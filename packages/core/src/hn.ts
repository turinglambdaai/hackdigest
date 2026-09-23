// Hacker News official Firebase API client.
// Docs: https://github.com/HackerNews/API

import { kvGet, kvSet } from './store';

const FB = 'https://hacker-news.firebaseio.com/v0';

export type FeedId = 'top' | 'new' | 'best' | 'ask' | 'show' | 'job';

export interface HNItem {
  id: number;
  deleted?: boolean;
  type?: 'story' | 'comment' | 'job' | 'poll' | 'pollopt';
  by?: string;
  time: number; // unix seconds
  dead?: boolean;
  title?: string;
  url?: string;
  text?: string; // HTML
  score?: number;
  descendants?: number; // comment count
  kids?: number[];
  parent?: number;
}

export const FEED_PATHS: Record<FeedId, string> = {
  top: 'topstories',
  new: 'newstories',
  best: 'beststories',
  ask: 'askstories',
  show: 'showstories',
  job: 'jobstories',
};

const inflight = new Map<number, Promise<HNItem | null>>();
const memory = new Map<number, HNItem>();

export async function fetchFeedIds(feed: FeedId): Promise<number[]> {
  const res = await fetch(`${FB}/${FEED_PATHS[feed]}.json`);
  if (!res.ok) throw new Error(`HN API ${res.status}`);
  return res.json();
}

export async function fetchItem(id: number): Promise<HNItem | null> {
  const mem = memory.get(id);
  if (mem) return mem;
  const pending = inflight.get(id);
  if (pending) return pending;
  const p = (async () => {
    const cached = await kvGet<HNItem>('items', id);
    if (cached) {
      memory.set(id, cached);
      return cached;
    }
    const res = await fetch(`${FB}/item/${id}.json`);
    if (!res.ok) throw new Error(`HN API ${res.status}`);
    const item: HNItem | null = await res.json();
    if (item) {
      memory.set(id, item);
      void kvSet('items', id, item);
    }
    return item;
  })().finally(() => inflight.delete(id));
  inflight.set(id, p);
  return p;
}

export async function fetchItems(ids: number[], concurrency = 12): Promise<(HNItem | null)[]> {
  const out: (HNItem | null)[] = new Array(ids.length).fill(null);
  let cursor = 0;
  async function worker() {
    while (cursor < ids.length) {
      const i = cursor++;
      try {
        out[i] = await fetchItem(ids[i]);
      } catch {
        out[i] = null;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, ids.length) }, worker));
  return out;
}

/** Pull a comment tree depth-first, calling `onItem` as each node arrives. */
export async function fetchCommentTree(
  rootKids: number[],
  onItem: (item: HNItem) => void,
  signal?: AbortSignal
): Promise<HNItem[]> {
  const all: HNItem[] = [];
  const queue = [...rootKids];
  const pool = 8;
  let stopped = false;
  const onAbort = () => (stopped = true);
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    let cursor = 0;
    async function worker() {
      while (cursor < queue.length && !stopped) {
        const id = queue[cursor++];
        let item: HNItem | null = null;
        try {
          item = await fetchItem(id);
        } catch {
          continue;
        }
        if (!item || item.dead || item.deleted) continue;
        all.push(item);
        onItem(item);
        if (item.kids?.length) queue.push(...item.kids);
      }
    }
    // First pass only (top-level), then keep draining newly discovered kids.
    await Promise.all(Array.from({ length: Math.min(pool, queue.length) }, worker));
    while (cursor < queue.length && !stopped) {
      await Promise.all(Array.from({ length: Math.min(pool, queue.length - cursor) }, worker));
    }
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }
  return all;
}
