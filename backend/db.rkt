#lang racket/base

;; SQLite store — byte-for-byte the same schema the Tauri build created
;; (db.rs): kv / translations / hn_items, WAL. Migrated databases open
;; here with zero conversion.

(require db
         racket/contract
         racket/file
         racket/match
         racket/path)

;; SQLite NULL rides as sql-null in racket/db; the impl layer uses #f.
(define (sql v) (if (string? v) v sql-null))
(define (unsql v) (if (sql-null? v) #f v))

(provide
 (contract-out
  [open-database (-> (or/c path-string? #f) connection?)]
  [kv-get (-> connection? string? (or/c string? #f))]
  [kv-set! (-> connection? string? string? void?)]
  [translation-get (-> connection? exact-integer? string?
                       (values (or/c string? #f) (or/c string? #f)))]
  [translations-get-batch (-> connection? (listof exact-integer?) string?
                              (listof (list/c exact-integer? (or/c string? #f) (or/c string? #f))))]
  [translations-put! (-> connection?
                         (listof (list/c exact-integer? string? string?
                                         (or/c string? #f) (or/c string? #f)))
                         void?)]
  [item-get (-> connection? exact-integer? (or/c string? #f))]
  [items-put! (-> connection? (listof (list/c exact-integer? string?)) void?)]))

;; #f dir → private in-memory DB (tests).
(define (open-database dir)
  (when dir (make-directory* dir))
  (define conn
    (if dir
        (sqlite3-connect #:database (build-path dir "hackdigest.db") #:mode 'create)
        (sqlite3-connect #:database 'memory)))
  (query-exec conn "PRAGMA journal_mode = WAL")
  (query-exec conn
              "CREATE TABLE IF NOT EXISTS kv (
                 key TEXT PRIMARY KEY,
                 value TEXT NOT NULL)")
  (query-exec conn
              "CREATE TABLE IF NOT EXISTS translations (
                 item_id INTEGER NOT NULL,
                 lang TEXT NOT NULL,
                 model TEXT NOT NULL,
                 title TEXT,
                 text TEXT,
                 updated_at INTEGER NOT NULL,
                 PRIMARY KEY (item_id, lang))")
  (query-exec conn
              "CREATE TABLE IF NOT EXISTS hn_items (
                 id INTEGER PRIMARY KEY,
                 json TEXT NOT NULL,
                 fetched_at INTEGER NOT NULL)")
  conn)

;; ---- kv --------------------------------------------------------------------

(define (kv-get conn key)
  (query-maybe-value conn "SELECT value FROM kv WHERE key = ?1" key))

(define (kv-set! conn key value)
  (query-exec conn
              "INSERT INTO kv(key, value) VALUES (?1, ?2)
               ON CONFLICT(key) DO UPDATE SET value = excluded.value"
              key value))

;; ---- translations ----------------------------------------------------------

(define (translation-get conn item-id lang)
  (define row
    (query-maybe-row conn
                     "SELECT title, text FROM translations WHERE item_id = ?1 AND lang = ?2"
                     item-id lang))
  (if row (values (unsql (vector-ref row 0)) (unsql (vector-ref row 1))) (values #f #f)))

(define (translations-get-batch conn item-ids lang)
  (for/list ([id (in-list item-ids)]
             #:do [(define-values (title text) (translation-get conn id lang))]
             #:when (or title text))
    (list id title text)))

(define (translations-put! conn rows)
  (start-transaction conn)
  (for ([row (in-list rows)])
    (match-define (list item-id lang model title text) row)
    (query-exec conn
                "INSERT INTO translations(item_id, lang, model, title, text, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)
                 ON CONFLICT(item_id, lang) DO UPDATE SET
                   model = excluded.model, title = excluded.title,
                   text = excluded.text, updated_at = excluded.updated_at"
                item-id lang model (sql title) (sql text) (current-seconds)))
  (commit-transaction conn))

;; ---- hn_items ---------------------------------------------------------------

(define (item-get conn id)
  (query-maybe-value conn "SELECT json FROM hn_items WHERE id = ?1" id))

(define (items-put! conn items)
  (start-transaction conn)
  (for ([item (in-list items)])
    (match-define (list id json) item)
    (query-exec conn
                "INSERT INTO hn_items(id, json, fetched_at) VALUES (?1, ?2, ?3)
                 ON CONFLICT(id) DO UPDATE SET json = excluded.json, fetched_at = excluded.fetched_at"
                id json (current-seconds)))
  (commit-transaction conn))
