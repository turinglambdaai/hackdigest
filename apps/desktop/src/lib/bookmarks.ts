// Bookmarks & read history. In packaged builds these live in library.json
// (app-config dir, survives updates); in plain browsers, IndexedDB.

import { hasBackend, idbAll, idbDel, idbSet } from '@hackdigest/core';
import { readDataFile, writeDataFile } from '@hackdigest/core';

export interface BookmarkEntry {
  id: number;
  ts: number;
}

interface HistoryEntry {
  id: number;
  ts: number;
}

interface Library {
  bookmarks: BookmarkEntry[];
  history: HistoryEntry[];
}

const EMPTY: Library = { bookmarks: [], history: [] };

async function loadLibrary(): Promise<Library> {
  const fromFile = await readDataFile<Library>('library');
  if (fromFile) return { ...EMPTY, ...fromFile };
  if (!(await hasBackend())) {
    // Browser dev: migrate/adopt IndexedDB data.
    const [b, h] = await Promise.all([
      idbAll<BookmarkEntry>('bookmarks'),
      idbAll<HistoryEntry>('history'),
    ]);
    const lib = { bookmarks: b.sort((x, y) => y.ts - x.ts), history: h };
    if (b.length || h.length) await writeDataFile('library', lib);
    return lib;
  }
  return EMPTY;
}

async function saveLibrary(lib: Library): Promise<void> {
  await writeDataFile('library', lib);
}

export async function listBookmarks(): Promise<BookmarkEntry[]> {
  return (await loadLibrary()).bookmarks.sort((a, b) => b.ts - a.ts);
}

export async function isBookmarked(id: number): Promise<boolean> {
  return (await loadLibrary()).bookmarks.some((e) => e.id === id);
}

export async function toggleBookmark(id: number): Promise<boolean> {
  const lib = await loadLibrary();
  const exists = lib.bookmarks.some((e) => e.id === id);
  lib.bookmarks = exists ? lib.bookmarks.filter((e) => e.id !== id) : [...lib.bookmarks, { id, ts: Date.now() }];
  await saveLibrary(lib);
  if (!(await hasBackend())) await idbDel('bookmarks', id).catch(() => {});
  return !exists;
}

export async function listReadIds(): Promise<Set<number>> {
  return new Set((await loadLibrary()).history.map((e) => e.id));
}

export async function markRead(id: number): Promise<void> {
  const lib = await loadLibrary();
  if (lib.history.some((e) => e.id === id)) return;
  lib.history = [...lib.history.slice(-4999), { id, ts: Date.now() }];
  await saveLibrary(lib);
  if (!(await hasBackend())) await idbSet('history', id, { id, ts: Date.now() }).catch(() => {});
}
