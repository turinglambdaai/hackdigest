// AI digests: thread digest, story TL;DR, daily front-page digest.
// All streamed as Markdown for the reading panel.

import type { HNItem } from './hn';
import { chat, type LLMConfig } from './llm';
import { langName } from './translate';
import { kvGet, kvSet } from './store';

const MAX_COMMENTS = 150;
const MAX_CHARS_PER_COMMENT = 600;

export async function digestThread(
  cfg: LLMConfig,
  story: HNItem,
  comments: HNItem[],
  lang: string,
  onDelta?: (t: string) => void,
  signal?: AbortSignal
): Promise<string> {
  const picked = comments.slice(0, MAX_COMMENTS);
  const rendered = picked
    .map((c) => `- (${c.by ?? '?'}, score~hn): ${(c.text ?? '').replace(/<[^>]+>/g, ' ').slice(0, MAX_CHARS_PER_COMMENT)}`)
    .join('\n');
  const sys = [
    `You are an analyst who reads Hacker News threads and writes a sharp, structured digest in ${langName(lang)}.`,
    'Markdown output. Be concrete and cite usernames for notable points. No filler, no summary-of-the-summary.',
  ].join(' ');
  const user = [
    `STORY: ${story.title ?? ''}${story.url ? ` (${story.url})` : ''}`,
    story.text ? `STORY TEXT: ${story.text.replace(/<[^>]+>/g, ' ').slice(0, 2000)}` : '',
    `COMMENTS (${picked.length} of ${comments.length}):`,
    rendered,
    '',
    'Write the digest with exactly these sections:',
    '## 背景',
    '1-2 sentences: what is being discussed and why it is on HN.',
    '## 主要观点',
    'Bullet list of the strongest arguments, grouped as 支持方 / 反对方 / 中立 where applicable. Cite usernames.',
    '## 值得一看',
    '2-4 standout comments with author and a one-line reason each.',
    '## 一句话结论',
    'One sentence: where the community landed.',
  ].join('\n');
  return chat(cfg, [{ role: 'system', content: sys }, { role: 'user', content: user }], {
    onDelta,
    signal,
    maxTokens: 2000,
  });
}

export async function tldrStory(
  cfg: LLMConfig,
  story: HNItem,
  lang: string,
  onDelta?: (t: string) => void,
  signal?: AbortSignal
): Promise<string> {
  // v0.1: self-text posts (Ask HN etc.) get a real TL;DR from the text;
  // link posts fall back to title + top comments via digestThread.
  const sys = `You write tight TL;DRs of technical posts in ${langName(lang)}. Markdown, max 150 words, end with one line starting with "要点：" listing 3 key takeaways as short bullets on that line.`;
  const user = [
    `TITLE: ${story.title ?? ''}`,
    story.text ? `TEXT: ${story.text.replace(/<[^>]+>/g, ' ').slice(0, 8000)}` : '(no self text)',
  ].join('\n');
  return chat(cfg, [{ role: 'system', content: sys }, { role: 'user', content: user }], {
    onDelta,
    signal,
    maxTokens: 800,
  });
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
  const sys = [
    `You are the editor of a daily Hacker News briefing in ${langName(lang)}.`,
    'Markdown. Group stories into 3-5 thematic sections with ## headings (in the target language). Under each, list stories as: `- **中文标题**（原文分数/评论数，域名）— 一句话为什么值得看`.',
    'You may skip irrelevant stories; never invent ones. End with a section "## 编者注" of 2 sentences on the overall theme of the day.',
  ].join(' ');
  const list = stories
    .map((s) => `- [${s.id}] ${s.title} (${s.score} pts, ${s.comments} comments${s.domain ? `, ${s.domain}` : ''})`)
    .join('\n');
  const user = `Today's top stories (${date}):\n${list}`;
  const out = await chat(cfg, [{ role: 'system', content: sys }, { role: 'user', content: user }], {
    onDelta,
    signal,
    maxTokens: 3000,
  });
  await kvSet('meta', dailyKey(date, lang), out);
  return out;
}
