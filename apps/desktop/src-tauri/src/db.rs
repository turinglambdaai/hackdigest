// Local SQLite store (app-config dir / hackdigest.db): the durable home for
// translation caches, HN item caches, and small KV (device id). The WebView2
// IndexedDB never persisted in packaged builds, so everything rides here.
// Command args are snake_case; Tauri maps them from JS camelCase.

use rusqlite::{params, Connection};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

pub struct Db(pub Mutex<Connection>);

pub fn init(app: &AppHandle) -> Result<Db, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let conn = Connection::open(dir.join("hackdigest.db")).map_err(|e| e.to_string())?;
    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         CREATE TABLE IF NOT EXISTS kv (
             key TEXT PRIMARY KEY,
             value TEXT NOT NULL
         );
         CREATE TABLE IF NOT EXISTS translations (
             item_id INTEGER NOT NULL,
             lang TEXT NOT NULL,
             model TEXT NOT NULL,
             title TEXT,
             text TEXT,
             updated_at INTEGER NOT NULL,
             PRIMARY KEY (item_id, lang)
         );
         CREATE TABLE IF NOT EXISTS hn_items (
             id INTEGER PRIMARY KEY,
             json TEXT NOT NULL,
             fetched_at INTEGER NOT NULL
         );",
    )
    .map_err(|e| e.to_string())?;
    Ok(Db(Mutex::new(conn)))
}

fn now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

// ---- impl functions (testable with a plain &Connection) ----

fn kv_get_impl(conn: &Connection, key: &str) -> Option<String> {
    conn.query_row("SELECT value FROM kv WHERE key = ?1", params![key], |r| r.get(0)).ok()
}

fn kv_set_impl(conn: &Connection, key: &str, value: &str) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO kv(key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )
    .map(|_| ())
}

pub type TransRow = (i64, String, String, Option<String>, Option<String>); // (item_id, lang, model, title, text)

fn put_translations_impl(conn: &mut Connection, rows: Vec<TransRow>) -> rusqlite::Result<()> {
    let tx = conn.transaction()?;
    for (item_id, lang, model, title, text) in rows {
        tx.execute(
            "INSERT INTO translations(item_id, lang, model, title, text, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(item_id, lang) DO UPDATE SET
               model = excluded.model, title = excluded.title, text = excluded.text, updated_at = excluded.updated_at",
            params![item_id, lang, model, title, text, now()],
        )?;
    }
    tx.commit()
}

fn get_translation_impl(conn: &Connection, item_id: i64, lang: &str) -> Option<(Option<String>, Option<String>)> {
    conn.query_row(
        "SELECT title, text FROM translations WHERE item_id = ?1 AND lang = ?2",
        params![item_id, lang],
        |r| Ok((r.get(0)?, r.get(1)?)),
    )
    .ok()
}

fn get_translations_impl(
    conn: &Connection,
    item_ids: &[i64],
    lang: &str,
) -> Vec<(i64, Option<String>, Option<String>)> {
    let mut out = Vec::new();
    for id in item_ids {
        if let Some((title, text)) = get_translation_impl(conn, *id, lang) {
            out.push((*id, title, text));
        }
    }
    out
}

fn put_items_impl(conn: &mut Connection, items: Vec<(i64, String)>) -> rusqlite::Result<()> {
    let tx = conn.transaction()?;
    for (id, json) in items {
        tx.execute(
            "INSERT INTO hn_items(id, json, fetched_at) VALUES (?1, ?2, ?3)
             ON CONFLICT(id) DO UPDATE SET json = excluded.json, fetched_at = excluded.fetched_at",
            params![id, json, now()],
        )?;
    }
    tx.commit()
}

// ---- Tauri commands ----

#[tauri::command]
pub fn kv_get(db: State<Db>, key: String) -> Option<String> {
    db.0.lock().ok().and_then(|c| kv_get_impl(&c, &key))
}

#[tauri::command]
pub fn kv_set(db: State<Db>, key: String, value: String) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    kv_set_impl(&conn, &key, &value).map_err(|e| e.to_string())
}

#[derive(serde::Serialize)]
pub struct TranslationRow {
    pub title: Option<String>,
    pub text: Option<String>,
}

#[tauri::command]
pub fn get_translation(db: State<Db>, item_id: i64, lang: String) -> Option<TranslationRow> {
    db.0.lock().ok().and_then(|c| {
        get_translation_impl(&c, item_id, &lang).map(|(title, text)| TranslationRow { title, text })
    })
}

#[tauri::command]
pub fn get_translations(
    db: State<Db>,
    item_ids: Vec<i64>,
    lang: String,
) -> Vec<(i64, Option<String>, Option<String>)> {
    db.0.lock().map(|c| get_translations_impl(&c, &item_ids, &lang)).unwrap_or_default()
}

#[tauri::command]
pub fn put_translations(db: State<Db>, rows: Vec<TransRow>) -> Result<(), String> {
    let mut conn = db.0.lock().map_err(|e| e.to_string())?;
    put_translations_impl(&mut conn, rows).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_item(db: State<Db>, id: i64) -> Option<String> {
    let conn = db.0.lock().ok()?;
    conn.query_row("SELECT json FROM hn_items WHERE id = ?1", params![id], |r| r.get(0)).ok()
}

#[tauri::command]
pub fn put_items(db: State<Db>, items: Vec<(i64, String)>) -> Result<(), String> {
    let mut conn = db.0.lock().map_err(|e| e.to_string())?;
    put_items_impl(&mut conn, items).map_err(|e| e.to_string())
}

// ---- tests (plain connections, no Tauri State needed) ----

#[cfg(test)]
mod tests {
    use super::*;

    fn mem() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE kv(key TEXT PRIMARY KEY, value TEXT NOT NULL);
             CREATE TABLE translations(item_id INTEGER NOT NULL, lang TEXT NOT NULL, model TEXT NOT NULL, title TEXT, text TEXT, updated_at INTEGER NOT NULL, PRIMARY KEY(item_id, lang));
             CREATE TABLE hn_items(id INTEGER PRIMARY KEY, json TEXT NOT NULL, fetched_at INTEGER NOT NULL);",
        )
        .unwrap();
        conn
    }

    #[test]
    fn kv_roundtrip_and_overwrite() {
        let conn = &mut mem();
        kv_set_impl(conn, "deviceId", "abc").unwrap();
        assert_eq!(kv_get_impl(conn, "deviceId").as_deref(), Some("abc"));
        kv_set_impl(conn, "deviceId", "xyz").unwrap();
        assert_eq!(kv_get_impl(conn, "deviceId").as_deref(), Some("xyz"));
    }

    #[test]
    fn translations_batch_upsert_and_get() {
        let conn = &mut mem();
        put_translations_impl(
            conn,
            vec![
                (1, "zh".into(), "m".into(), Some("标题".into()), None),
                (2, "zh".into(), "m".into(), None, Some("正文".into())),
            ],
        )
        .unwrap();
        assert_eq!(get_translation_impl(conn, 1, "zh").unwrap().0.as_deref(), Some("标题"));
        // overwrite
        put_translations_impl(conn, vec![(1, "zh".into(), "m2".into(), Some("新标题".into()), None)]).unwrap();
        assert_eq!(get_translation_impl(conn, 1, "zh").unwrap().0.as_deref(), Some("新标题"));
        // batched read
        let got = get_translations_impl(conn, &[1, 2, 3], "zh");
        assert_eq!(got.len(), 2);
        assert_eq!(got[0].0, 1);
    }

    #[test]
    fn items_upsert() {
        let conn = &mut mem();
        put_items_impl(conn, vec![(42, r#"{"id":42}"#.into())]).unwrap();
        let v: Option<String> = conn
            .query_row("SELECT json FROM hn_items WHERE id = 42", [], |r| r.get(0))
            .ok();
        assert_eq!(v.as_deref(), Some(r#"{"id":42}"#));
    }
}
