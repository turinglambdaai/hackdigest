// Storage abstraction: packaged builds ride Rust/SQLite commands (the
// WebView2 IndexedDB never persisted there); plain browsers keep IndexedDB.

import { isTauri } from './llm';
import { kvGet, kvSet } from './store';

export interface StoredTranslation {
  title?: string;
  text?: string;
}

type TransRow = [number, string, string, string | null, string | null]; // itemId, lang, model, title, text

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T | null> {
  const { invoke: inv } = await import('@tauri-apps/api/core');
  return inv<T>(cmd, args);
}

export async function storageKvGet(key: string): Promise<string | null> {
  if (isTauri()) {
    try {
      return await invoke<string | null>('kv_get', { key });
    } catch {
      return null;
    }
  }
  return (await kvGet<string>('meta', key)) ?? null;
}

export async function storageKvSet(key: string, value: string): Promise<void> {
  if (isTauri()) {
    try {
      await invoke('kv_set', { key, value });
    } catch {
      /* fall through to IDB */
    }
    return;
  }
  await kvSet('meta', key, value);
}

export async function getStoredTranslation(itemId: number, lang: string): Promise<StoredTranslation | null> {
  if (isTauri()) {
    try {
      const row = await invoke<{ title: string | null; text: string | null } | null>('get_translation', {
        itemId,
        lang,
      });
      if (!row) return null;
      return { title: row.title ?? undefined, text: row.text ?? undefined };
    } catch {
      return null;
    }
  }
  const hit = await kvGet<StoredTranslation & { model?: string }>('trans', `${itemId}:${lang}`);
  if (!hit) return null;
  return { title: hit.title, text: hit.text };
}

export async function putStoredTranslations(
  rows: Array<{ id: number; title?: string; text?: string }>,
  lang: string,
  model: string
): Promise<void> {
  if (isTauri()) {
    try {
      const payload: TransRow[] = rows.map((r) => [r.id, lang, model, r.title ?? null, r.text ?? null]);
      await invoke('put_translations', { rows: payload });
      return;
    } catch {
      /* fall through to IDB */
    }
  }
  for (const r of rows) {
    await kvSet('trans', `${r.id}:${lang}`, { ...r, model, lang });
  }
}

export async function getStoredTranslations(
  itemIds: number[],
  lang: string
): Promise<Map<number, StoredTranslation>> {
  const out = new Map<number, StoredTranslation>();
  if (itemIds.length === 0) return out;
  if (isTauri()) {
    try {
      const rows = await invoke<Array<[number, string | null, string | null]>>('get_translations', {
        itemIds,
        lang,
      });
      for (const [id, title, text] of rows ?? []) {
        out.set(id, { title: title ?? undefined, text: text ?? undefined });
      }
      return out;
    } catch {
      return out;
    }
  }
  const CHUNK = 100;
  for (let i = 0; i < itemIds.length; i += CHUNK) {
    const slice = itemIds.slice(i, i + CHUNK);
    const hits = await Promise.all(
      slice.map(async (id) => ({ id, t: await getStoredTranslation(id, lang) }))
    );
    for (const { id, t } of hits) if (t) out.set(id, t);
  }
  return out;
}

export async function getStoredItem(id: number): Promise<unknown | null> {
  if (isTauri()) {
    try {
      const json = await invoke<string | null>('get_item', { id });
      return json ? JSON.parse(json) : null;
    } catch {
      return null;
    }
  }
  return kvGet('items', id);
}

export async function putStoredItems(items: Array<{ id: number }>): Promise<void> {
  if (isTauri()) {
    try {
      const payload = items.map((it) => [it.id, JSON.stringify(it)] as [number, string]);
      await invoke('put_items', { items: payload });
      return;
    } catch {
      /* fall through */
    }
  }
  for (const it of items) await kvSet('items', it.id, it);
}
