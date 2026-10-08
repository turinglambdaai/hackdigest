// AI digests: thread digest, story TL;DR, daily front-page digest (R2).
// Prompt construction, comment caps, and the daily cache live in the Racket
// backend; the page streams the Markdown and renders it.

import { streamChat } from './bridge';
import { kvGet } from './store';
import type { LLMConfig } from './llm';
import type { HNItem } from './hn';

function toCfg(cfg: LLMConfig) {
  return { baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, model: cfg.model };
}

function slimStory(story: HNItem) {
  return { id: story.id, title: story.title ?? '', url: story.url ?? null, text: story.text ?? null };
}

const noop = () => {};

export async function digestThread(
  cfg: LLMConfig,
  story: HNItem,
  comments: HNItem[],
  lang: string,
  onDelta?: (t: string) => void,
  signal?: AbortSignal
): Promise<string> {
  return streamChat(
    '/api/digest/thread',
    {
      cfg: toCfg(cfg),
      story: slimStory(story),
      comments: comments.map((c) => ({
        id: c.id,
        text: c.text ?? '',
        by: c.by ?? null,
        score: c.score ?? null,
      })),
      lang,
    },
    onDelta ?? noop,
    signal
  );
}

export async function tldrStory(
  cfg: LLMConfig,
  story: HNItem,
  lang: string,
  onDelta?: (t: string) => void,
  signal?: AbortSignal
): Promise<string> {
  return streamChat('/api/digest/tldr', { cfg: toCfg(cfg), story: slimStory(story), lang }, onDelta ?? noop, signal);
}

export interface DailyStory {
  id: number;
  title: string;
  score: number;
  comments: number;
  domain?: string;
}

const dailyKey = (date: string, lang: string) => `daily:${date}:${lang}`;

export function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function getCachedDaily(date: string, lang: string): Promise<string | null> {
  return (await kvGet<string>('meta', dailyKey(date, lang))) ?? null;
}

export async function digestDaily(
  cfg: LLMConfig,
  stories: DailyStory[],
  lang: string,
  date: string,
  onDelta?: (t: string) => void,
  signal?: AbortSignal
): Promise<string> {
  // The backend persists the finished digest under the same kv key, so
  // tomorrow's revisits hit getCachedDaily without a model call.
  return streamChat(
    '/api/digest/daily',
    { cfg: toCfg(cfg), stories, lang, date },
    onDelta ?? noop,
    signal
  );
}
