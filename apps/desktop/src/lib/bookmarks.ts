// Bookmarks & read-history helpers over the core KV stores.

import { idbAll, idbDel, idbGet, idbSet } from '@hackdigest/core';

export interface BookmarkEntry {
  id: number;
  ts: number;
}

export async function listBookmarks(): Promise<BookmarkEntry[]> {
  const all = await idbAll<BookmarkEntry>('bookmarks');
  return all.sort((a, b) => b.ts - a.ts);
}

export async function isBookmarked(id: number): Promise<boolean> {
  return (await idbGet('bookmarks', id)) != null;
}

export async function toggleBookmark(id: number): Promise<boolean> {
  if (await isBookmarked(id)) {
    await idbDel('bookmarks', id);
    return false;
  }
  await idbSet('bookmarks', id, { id, ts: Date.now() });
  return true;
}

export async function listReadIds(): Promise<Set<number>> {
  const all = await idbAll<{ id: number }>('history');
  return new Set(all.map((e) => e.id));
}

export async function markRead(id: number): Promise<void> {
  await idbSet('history', id, { id, ts: Date.now() });
}
