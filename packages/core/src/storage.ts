// Storage abstraction: the Glaze backend's SQLite store is the durable home
// (mirrors the Tauri build: webview storage proved non-persistent there);
// plain browsers keep IndexedDB. Wire shapes match the old Tauri commands.

import { apiPost, hasBackend } from './bridge';
import { kvGet, kvSet } from './store';

export interface StoredTranslation {
  title?: string;
  text?: string;
}

type TransRow = [number, string, string, string | null, string | null]; // itemId, lang, model, title, text

export async function storageKvGet(key: string): Promise<string | null> {
  if (await hasBackend()) {
    try {
      const { value } = await apiPost<{ value: string | null }>('/api/kv/get', { key });
      return value ?? null;
    } catch {
      return null;
    }
  }
  return (await kvGet<string>('meta', key)) ?? null;
}

export async function storageKvSet(key: string, value: string): Promise<void> {
  if (await hasBackend()) {
    try {
      await apiPost('/api/kv/set', { key, value });
    } catch {
      /* fall through to IDB */
    }
    return;
  }
  await kvSet('meta', key, value);
}

export async function getStoredTranslation(itemId: number, lang: string): Promise<StoredTranslation | null> {
  if (await hasBackend()) {
    try {
      const row = await apiPost<{ found: boolean; title: string | null; text: string | null }>(
        '/api/translations/get',
        { itemId, lang }
      );
      if (!row.found) return null;
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
  if (await hasBackend()) {
    try {
      const payload: TransRow[] = rows.map((r) => [r.id, lang, model, r.title ?? null, r.text ?? null]);
      await apiPost('/api/translations/put', { rows: payload });
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
  if (await hasBackend()) {
    try {
      const { rows } = await apiPost<{ rows: Array<[number, string | null, string | null]> }>(
        '/api/translations/get-batch',
        { itemIds, lang }
      );
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
  if (await hasBackend()) {
    try {
      const { json } = await apiPost<{ json: string | null }>('/api/items/get', { id });
      return json ? JSON.parse(json) : null;
    } catch {
      return null;
    }
  }
  return kvGet('items', id);
}

export async function putStoredItems(items: Array<{ id: number }>): Promise<void> {
  if (await hasBackend()) {
    try {
      const payload = items.map((it) => [it.id, JSON.stringify(it)] as [number, string]);
      await apiPost('/api/items/put', { items: payload });
      return;
    } catch {
      /* fall through */
    }
  }
  for (const it of items) await kvSet('items', it.id, it);
}
