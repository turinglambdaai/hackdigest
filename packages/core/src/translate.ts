// Translation pipeline: story (title + self text) and comment batches.
// Results are cached in IndexedDB keyed by item id + model + target language,
// so a translated thread is never billed twice.

import type { HNItem } from './hn';
import { chat, type LLMConfig } from './llm';
import { getStoredTranslation, getStoredTranslations, putStoredTranslations } from './storage';

export interface Translation {
  title?: string;
  text?: string;
}

interface CacheEntry extends Translation {
  model: string;
  lang: string;
}

const cacheKey = (id: number, lang: string) => `${id}:${lang}`;

export async function getCachedTranslation(id: number, lang: string): Promise<Translation | null> {
  return getStoredTranslation(id, lang);
}

export function extractJson(raw: string): Record<string, unknown> {
  // Models sometimes wrap JSON in ```json fences or prose; find the object.
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
  const sys = systemPrompt(lang);
  const user = [
    'Translate this Hacker News story into ' + langName(lang) + '. Keep HTML tags intact, translate only text nodes. Keep proper nouns, product names, and code as-is.',
    'Return JSON: {"title": "...", "text": "..."} — text is "" when the story has no self text.',
    `TITLE: ${story.title ?? ''}`,
    story.text ? `TEXT (HTML): ${story.text}` : 'TEXT: (none)',
  ].join('\n');
  let out: Translation;
  for (let attempt = 0; ; attempt++) {
    const raw = await chat(cfg, [{ role: 'system', content: sys }, { role: 'user', content: user }], {
      jsonMode: true,
      signal,
      maxTokens: 3000,
    });
    try {
      const j = extractJson(raw) as { title?: string; text?: string };
      out = { title: typeof j.title === 'string' ? j.title : undefined, text: typeof j.text === 'string' && j.text ? j.text : undefined };
      break;
    } catch (e) {
      if (attempt >= 1) throw e;
    }
  }
  await putStoredTranslations([{ id: story.id, title: out.title, text: out.text }], lang, cfg.model);
  return out;
}

export interface CommentBatchResult {
  done: number;
  total: number;
}

/** Translate a batch of comments (flat list). Returns id -> translated HTML. */
async function translateBatch(
  cfg: LLMConfig,
  comments: HNItem[],
  lang: string,
  signal?: AbortSignal
): Promise<Map<number, string>> {
  const MAX_CHARS = 1500; // per-comment input cap keeps outputs within max_tokens
  const list = comments
    .map((c) => `[${c.id}] ${(c.text ?? '').slice(0, MAX_CHARS)}`)
    .join('\n\n');
  const sys = systemPrompt(lang);
  const user = [
    'Translate each Hacker News comment below into ' + langName(lang) + '. Keep the [id] markers and HTML tags intact; translate only text nodes. Keep proper nouns and code as-is.',
    'Return JSON: {"t": {"<id>": "<translated HTML>", ...}} with one entry per input id.',
    list,
  ].join('\n');
  for (let attempt = 0; ; attempt++) {
    const raw = await chat(cfg, [{ role: 'system', content: sys }, { role: 'user', content: user }], {
      jsonMode: true,
      signal,
      maxTokens: 8000,
    });
    try {
      const j = extractJson(raw) as { t?: Record<string, string> };
      const map = new Map<number, string>();
      for (const [k, v] of Object.entries(j.t ?? {})) {
        const id = Number(k.replace(/[[\]]/g, ''));
        if (Number.isFinite(id) && typeof v === 'string' && v) map.set(id, v);
      }
      if (map.size > 0) return map;
      throw new Error('empty translation map');
    } catch (e) {
      if (attempt >= 1) throw e;
    }
  }
}

/**
 * Translate a comment set with self-healing batches: a failing batch is
 * bisected and retried (output-length limits and flaky JSON are the usual
 * culprits), down to single comments. Returns how many comments ultimately
 * failed — partial success always wins over aborting.
 */
export async function translateComments(
  cfg: LLMConfig,
  comments: HNItem[],
  lang: string,
  onBatch?: (results: Map<number, string>, progress: CommentBatchResult) => void,
  signal?: AbortSignal
): Promise<{ failed: number }> {
  const pending: HNItem[] = [];
  const cachedMap = await getStoredTranslations(comments.map((c) => c.id), lang);
  for (const c of comments) {
    const hit = cachedMap.get(c.id);
    if (hit?.text) onBatch?.(new Map([[c.id, hit.text]]), { done: 0, total: comments.length });
    else pending.push(c);
  }
  const BATCH = 20;
  const CONCURRENCY = 2;
  let done = comments.length - pending.length;
  let failed = 0;
  let cursor = 0;

  const runSlice = async (slice: HNItem[]): Promise<void> => {
    try {
      const map = await translateBatch(cfg, slice, lang, signal);
      await putStoredTranslations(
        slice.filter((c) => map.has(c.id)).map((c) => ({ id: c.id, text: map.get(c.id)! })),
        lang,
        cfg.model
      );
      done += slice.length;
      onBatch?.(map, { done, total: comments.length });
    } catch (e) {
      if (signal?.aborted) return;
      if (slice.length === 1) {
        failed += 1;
        done += 1;
        onBatch?.(new Map(), { done, total: comments.length });
        return;
      }
      // Bisect and retry both halves — one oversized comment must not
      // take the whole batch down.
      const mid = Math.ceil(slice.length / 2);
      await runSlice(slice.slice(0, mid));
      await runSlice(slice.slice(mid));
    }
  };

  const worker = async () => {
    while (cursor < pending.length && !signal?.aborted) {
      const i = cursor++;
      await runSlice(pending.slice(i, i + BATCH));
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(CONCURRENCY, Math.ceil(pending.length / BATCH))) }, worker));
  return { failed };
}

function systemPrompt(lang: string): string {
  return [
    'You are a professional translator for Hacker News content into ' + langName(lang) + '.',
    'You translate faithfully and idiomatically for developers: correct technical terminology, natural tone, never add opinions or notes.',
    'Always answer with a single JSON object and nothing else.',
  ].join(' ');
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
