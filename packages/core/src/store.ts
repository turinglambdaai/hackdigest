// Minimal IndexedDB wrapper — one database, object stores per purpose.
// Runs identically in the browser and inside the Tauri webview.

const DB_NAME = 'hackdigest';
const DB_VERSION = 1;

export type StoreName = 'items' | 'trans' | 'bookmarks' | 'history' | 'meta';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of ['items', 'trans', 'bookmarks', 'history', 'meta']) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<R>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<R> {
  return openDB().then(
    (db) =>
      new Promise<R>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        req.onsuccess = () => resolve(req.result as R);
        req.onerror = () => reject(req.error);
      })
  );
}

export const idbGet = <T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> =>
  tx<T | undefined>(store, 'readonly', (s) => s.get(key));

export const idbSet = (store: StoreName, key: IDBValidKey, value: unknown): Promise<IDBValidKey> =>
  tx<IDBValidKey>(store, 'readwrite', (s) => s.put(value));

export const idbDel = (store: StoreName, key: IDBValidKey): Promise<undefined> =>
  tx<undefined>(store, 'readwrite', (s) => s.delete(key));

export const idbAll = <T>(store: StoreName): Promise<T[]> =>
  tx<T[]>(store, 'readonly', (s) => s.getAll());

// In-memory fallback when IndexedDB is unavailable (SSR/tests). Best effort.
const mem = new Map<string, unknown>();
const keyOf = (s: string, k: IDBValidKey) => `${s}:${String(k)}`;
export async function kvGet<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> {
  try {
    return await idbGet<T>(store, key);
  } catch {
    return mem.get(keyOf(store, key)) as T | undefined;
  }
}
export async function kvSet(store: StoreName, key: IDBValidKey, value: unknown): Promise<void> {
  try {
    await idbSet(store, key, value);
  } catch {
    mem.set(keyOf(store, key), value);
  }
}
