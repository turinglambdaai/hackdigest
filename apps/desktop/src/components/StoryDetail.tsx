// Story detail: bilingual header, translate-all, thread digest, comment tree.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  digestThread,
  domainOf,
  fetchCommentTree,
  fetchItem,
  miniMarkdown,
  sanitizeHtml,
  timeAgo,
  translateComments,
  translateStory,
  getCachedTranslation,
  type HNItem,
} from '@hackdigest/core';
import { useI18n } from '../i18n';
import { useSettings, useTrans, useUI } from '../state/store';
import { openExternal } from '../lib/hooks';
import { isBookmarked, toggleBookmark, markRead } from '../lib/bookmarks';
import { CommentNode, buildTree } from './CommentTree';
import { IconChevronLeft, IconExternal, IconStar, IconTranslate, IconSpark } from './icons';

export default function StoryDetail({ id }: { id: number }) {
  const { t, lang } = useI18n();
  const navigate = useUI((s) => s.navigate);
  const back = useUI((s) => s.back);
  const llm = useSettings((s) => s.settings.llm);
  const target = useSettings((s) => s.settings.translateTarget);
  const trans = useTrans((s) => s.map[id]);
  const put = useTrans((s) => s.put);

  const [story, setStory] = useState<HNItem | null>(null);
  const [comments, setComments] = useState<HNItem[]>([]);
  const [translating, setTranslating] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [digest, setDigest] = useState<string | null>(null);
  const [digesting, setDigesting] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let alive = true;
    setStory(null);
    setComments([]);
    setDigest(null);
    setTranslating(false);
    setProgress(null);
    void isBookmarked(id).then((b) => alive && setBookmarked(b));
    void markRead(id);
    void fetchItem(id)
      .then(async (s) => {
        if (!alive || !s) return;
        setStory(s);
        const cached = await getCachedTranslation(id, target);
        if (cached) put(id, cached);
      })
      .catch(() => {});
    return () => {
      alive = false;
      abortRef.current?.abort();
    };
  }, [id, target, put]);

  // Progressive comment loading.
  useEffect(() => {
    if (!story?.kids?.length) return;
    const ac = new AbortController();
    abortRef.current = ac;
    const buffer: HNItem[] = [];
    let flushTimer: number | undefined;
    const flush = () => {
      if (buffer.length) {
        const chunk = buffer.splice(0, buffer.length);
        setComments((prev) => [...prev, ...chunk]);
      }
    };
    void fetchCommentTree(
      story.kids!,
      (item) => {
        buffer.push(item);
        if (flushTimer == null) flushTimer = window.setTimeout(() => (flush(), (flushTimer = undefined)), 120);
      },
      ac.signal
    ).then((all) => {
      flush();
      if (all.length === 0) return;
      // De-dup in case buffered and final overlap.
      setComments((prev) => {
        const seen = new Set(prev.map((c) => c.id));
        return [...prev, ...all.filter((c) => !seen.has(c.id))];
      });
    });
    return () => {
      ac.abort();
      if (flushTimer != null) clearTimeout(flushTimer);
    };
  }, [story?.id, story?.kids]);

  const tree = useMemo(() => buildTree(comments), [comments]);
  const roots = story ? (tree.get(story.id) ?? []) : [];

  const requireLLM = () => llm ?? (navigate({ type: 'settings' }), null);

  const translateStoryNow = async () => {
    const cfg = requireLLM();
    if (!cfg || !story || translating) return;
    setTranslating(true);
    try {
      const r = await translateStory(cfg, story, target);
      put(id, r);
    } catch (e) {
      alert(String(e instanceof Error ? e.message : e));
    } finally {
      setTranslating(false);
    }
  };

  const translateAllComments = async () => {
    const cfg = requireLLM();
    if (!cfg || translating || comments.length === 0) return;
    const ac = new AbortController();
    abortRef.current = ac;
    setTranslating(true);
    setProgress({ done: 0, total: comments.length });
    try {
      await translateComments(
        cfg,
        comments,
        target,
        (batch, p) => {
          for (const [cid, text] of batch) put(cid, { text });
          setProgress(p);
        },
        ac.signal
      );
    } catch (e) {
      if (!ac.signal.aborted) alert(String(e instanceof Error ? e.message : e));
    } finally {
      setTranslating(false);
      setProgress(null);
    }
  };

  const runDigest = async () => {
    const cfg = requireLLM();
    if (!cfg || !story || digesting) return;
    setDigest('');
    setDigesting(true);
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      await digestThread(cfg, story, comments, target, (d) => setDigest((prev) => prev + d), ac.signal);
    } catch (e) {
      if (!ac.signal.aborted) alert(String(e instanceof Error ? e.message : e));
      setDigest(null);
    } finally {
      setDigesting(false);
    }
  };

  if (!story)
    return (
      <div className="flex h-full items-center justify-center text-mute">{t.loading}</div>
    );

  const domain = domainOf(story.url);
  const titleZh = trans?.title && trans.title !== story.title;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="sticky top-0 z-10 border-b border-line bg-bg/85 px-5 py-2.5 backdrop-blur">
        <button
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-mute hover:bg-raised hover:text-ink"
          onClick={back}
        >
          <IconChevronLeft width={13} height={13} />
          {t.back}
        </button>
      </div>

      <div className="px-5 pt-5">
        <h1 className="text-xl font-semibold leading-snug">
          {titleZh ? trans!.title : story.title}
          {titleZh && (
            <span className="mt-1 block text-sm font-normal text-mute">{story.title}</span>
          )}
        </h1>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-mute">
          {story.score != null && (
            <span>
              {story.score} {t.points}
            </span>
          )}
          {story.by && (
            <span>
              {t.by} {story.by}
            </span>
          )}
          <span>{timeAgo(story.time, lang)}</span>
          {domain && <span className="rounded bg-raised px-1.5 py-px">{domain}</span>}
          {story.descendants != null && (
            <span>
              {story.descendants} {t.comments}
            </span>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {story.url && (
            <button
              className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
              onClick={() => story.url && void openExternal(story.url)}
            >
              <IconExternal width={13} height={13} />
              {t.openOriginal}
            </button>
          )}
          <button
            className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium hover:bg-raised"
            onClick={translateStoryNow}
            disabled={translating}
          >
            <IconTranslate className={translating ? 'animate-pulse' : ''} width={13} height={13} />
            {t.translate}
          </button>
          {comments.length > 0 && (
            <button
              className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium hover:bg-raised"
              onClick={translateAllComments}
              disabled={translating}
            >
              <IconTranslate className={translating ? 'animate-pulse' : ''} width={13} height={13} />
              {t.translateAll}
              {progress ? ` (${progress.done}/${progress.total})` : ` (${comments.length})`}
            </button>
          )}
          {comments.length > 0 && (
            <button
              className="flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accentsoft px-3 py-1.5 text-xs font-medium text-accent hover:opacity-90"
              onClick={runDigest}
              disabled={digesting}
            >
              <IconSpark className={digesting ? 'animate-pulse' : ''} width={13} height={13} />
              {digesting ? t.digestThreadRunning : t.digestThread}
            </button>
          )}
          <button
            className={`ml-auto flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs hover:bg-raised ${
              bookmarked ? 'text-accent' : 'text-mute'
            }`}
            onClick={async () => setBookmarked(await toggleBookmark(id))}
          >
            <IconStar filled={bookmarked} width={13} height={13} />
          </button>
        </div>

        {translating && progress && (
          <div className="mt-2 text-xs text-accent">{t.translatedProgress.replace('{done}', String(progress.done)).replace('{total}', String(progress.total))}</div>
        )}

        {digest != null && (
          <div className="prose-hn mt-5 rounded-xl border border-accent/30 bg-surface p-5 text-[14px]">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-accent">
              <IconSpark width={13} height={13} />
              {t.digestThread}
            </div>
            <div dangerouslySetInnerHTML={{ __html: miniMarkdown(digest) }} />
          </div>
        )}

        {story.text && (
          <div className="prose-hn mt-5 border-t border-line pt-4 text-[15px]">
            <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(trans?.text ?? story.text) }} />
            {trans?.text && (
              <details className="mt-2 text-xs text-mute">
                <summary className="cursor-pointer select-none hover:text-ink">{t.showOriginal}</summary>
                <div className="mt-1" dangerouslySetInnerHTML={{ __html: sanitizeHtml(story.text) }} />
              </details>
            )}
          </div>
        )}

        <div className="mt-6 border-t border-line pt-2">
          {comments.length === 0 ? (
            <div className="py-6 text-center text-sm text-mute">
              {story.kids?.length ? t.loading : t.noResults}
            </div>
          ) : (
            <div className="space-y-3 pb-10">
              {roots.map((c) => (
                <CommentNode key={c.id} item={c} children={tree.get(c.id)} tree={tree} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
