// Translation wrappers (R2): the batching, self-healing bisect, caching,
// and prompt construction all live in the Racket backend now — the page
// only relays requests and renders progress. Exported signatures match the
// previous in-page implementation, so components are untouched.

import { apiPost, streamLines } from './bridge';
import { getStoredTranslation } from './storage';
import type { LLMConfig } from './llm';
import type { HNItem } from './hn';

export interface Translation {
  title?: string;
  text?: string;
}

function toCfg(cfg: LLMConfig) {
  // The backend fills empty/masked fields from stored settings — the real
  // key never needs to be present in the page anymore.
  return { baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, model: cfg.model };
}

export async function getCachedTranslation(id: number, lang: string): Promise<Translation | null> {
  return getStoredTranslation(id, lang);
}

/** Kept for parity with the old export; parsing now happens server-side. */
export function extractJson(raw: string): Record<string, unknown> {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('no JSON in model output');
  return JSON.parse(m[0]);
}

export async function translateStory(
  cfg: LLMConfig,
  story: HNItem,
  lang: string,
  signal?: AbortSignal
): Promise<Translation> {
  const cached = await getCachedTranslation(story.id, lang);
  if (cached) return cached;
  const r = await apiPost<{ title: string; text: string }>('/api/translate/story', {
    cfg: toCfg(cfg),
    story: { id: story.id, title: story.title ?? '', text: story.text ?? null },
    lang,
  });
  return { title: r.title || undefined, text: r.text || undefined };
}

export interface CommentBatchResult {
  done: number;
  total: number;
}

/**
 * Translate a comment set; batch progress streams in ndjson from the
 * backend (one line per healed batch). Returns how many comments
 * ultimately failed — partial success always wins over aborting.
 */
export async function translateComments(
  cfg: LLMConfig,
  comments: HNItem[],
  lang: string,
  onBatch?: (results: Map<number, string>, progress: CommentBatchResult) => void,
  signal?: AbortSignal
): Promise<{ failed: number }> {
  let failed = 0;
  await streamLines(
    '/api/translate/comments',
    {
      cfg: toCfg(cfg),
      comments: comments.map((c) => ({ id: c.id, text: c.text ?? '' })),
      lang,
    },
    (line) => {
      const j = JSON.parse(line) as {
        batch?: Record<string, string>;
        done?: number;
        total?: number;
        failed?: number;
      };
      if (j.batch && onBatch) {
        const map = new Map<number, string>();
        for (const [k, v] of Object.entries(j.batch)) {
          const id = Number(k);
          if (Number.isFinite(id) && v) map.set(id, v);
        }
        if (map.size > 0) onBatch(map, { done: j.done ?? 0, total: j.total ?? comments.length });
      }
      if (typeof j.failed === 'number') failed = j.failed;
    },
    signal
  );
  return { failed };
}

export function langName(lang: string): string {
  const names: Record<string, string> = {
    zh: 'Simplified Chinese (简体中文)',
    'zh-TW': 'Traditional Chinese (繁體中文)',
    ja: 'Japanese (日本語)',
    ko: 'Korean (한국어)',
    en: 'English',
  };
  return names[lang] ?? lang;
}

export const TRANSLATE_TARGETS = ['zh', 'zh-TW', 'ja', 'ko', 'en'];

/**
 * Batch-translate story TITLES (feed page). The backend batches (30/request)
 * and persists; the page receives the full map at once. Already-cached
 * titles come back in the same map, so revisiting a feed never re-bills.
 */
export async function translateTitles(
  cfg: LLMConfig,
  stories: HNItem[],
  lang: string,
  onDone?: (results: Map<number, string>) => void,
  signal?: AbortSignal
): Promise<void> {
  const r = await apiPost<{ pairs: Array<[number, string]> }>('/api/translate/titles', {
    cfg: toCfg(cfg),
    stories: stories.map((s) => ({ id: s.id, title: s.title ?? '' })),
    lang,
  });
  if (onDone && r.pairs?.length) {
    onDone(new Map(r.pairs.filter(([id, t]) => Number.isFinite(id) && t)));
  }
}
