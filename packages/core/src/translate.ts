// Translation pipeline: story (title + self text) and comment batches.
// Results are cached in IndexedDB keyed by item id + model + target language,
// so a translated thread is never billed twice.

import type { HNItem } from './hn';
import { chat, type LLMConfig } from './llm';
import { kvGet, kvSet } from './store';

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
  const hit = await kvGet<CacheEntry>('trans', cacheKey(id, lang));
  return hit ?? null;
}

function extractJson(raw: string): Record<string, unknown> {
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
  await kvSet('trans', cacheKey(story.id, lang), { ...out, model: cfg.model, lang });
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
  const list = comments.map((c) => `[${c.id}] ${c.text ?? ''}`).join('\n\n');
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
 * Translate a whole comment tree in batches of ~40, reporting progress.
 * Already-cached comments are skipped; each finished batch is flushed to
 * cache and surfaced via onBatch so the UI can render progressively.
 */
export async function translateComments(
  cfg: LLMConfig,
  comments: HNItem[],
  lang: string,
  onBatch?: (results: Map<number, string>, progress: CommentBatchResult) => void,
  signal?: AbortSignal
): Promise<void> {
  const pending: HNItem[] = [];
  for (const c of comments) {
    const cached = await getCachedTranslation(c.id, lang);
    if (cached?.text) onBatch?.(new Map([[c.id, cached.text]]), { done: 0, total: comments.length });
    else pending.push(c);
  }
  const BATCH = 40;
  let done = comments.length - pending.length;
  for (let i = 0; i < pending.length; i += BATCH) {
    if (signal?.aborted) return;
    const slice = pending.slice(i, i + BATCH);
    try {
      const map = await translateBatch(cfg, slice, lang, signal);
      for (const [id, text] of map) {
        await kvSet('trans', cacheKey(id, lang), { text, model: cfg.model, lang });
      }
      done += slice.length;
      onBatch?.(map, { done, total: comments.length });
    } catch (e) {
      if (signal?.aborted) return;
      throw e;
    }
  }
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
