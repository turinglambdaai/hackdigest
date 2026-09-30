// Story detail: bilingual header, translate-all, thread digest, comment tree.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  digestThread,
  domainOf,
  fetchItem,
  fetchItems,
  miniMarkdown,
  sanitizeHtml,
  timeAgo,
  translateComments,
  translateStory,
  getCachedTranslation,
  type HNItem,
} from '@hackdigest/core';
import { useI18n } from '../i18n';
import { useSettings, useTrans, useUI, useTree } from '../state/store';
import { openExternal } from '../lib/hooks';
import { isBookmarked, toggleBookmark, markRead } from '../lib/bookmarks';
import { CommentNode, buildTree, collectVisible } from './CommentTree';
import { toast } from './Toast';
import { isTypingTarget } from '../lib/keys';
import { IconChevronLeft, IconExternal, IconStar, IconTranslate, IconSpark, IconRefresh } from './icons';

export default function StoryDetail({ id }: { id: number }) {
  const { t, lang } = useI18n();
  const navigate = useUI((s) => s.navigate);
  const back = useUI((s) => s.back);
  const llm = useSettings((s) => s.settings.llm);
  const target = useSettings((s) => s.settings.translateTarget);
  const sc = useSettings((s) => s.settings.shortcuts);
  const trans = useTrans((s) => s.map[id]);
  const put = useTrans((s) => s.put);

  const [story, setStory] = useState<HNItem | null>(null);
  const [comments, setComments] = useState<HNItem[]>([]);
  const [loadedParents, setLoadedParents] = useState<Set<number>>(new Set());
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [translatingStory, setTranslatingStory] = useState(false);
  const [digest, setDigest] = useState<string | null>(null);
  const [digesting, setDigesting] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let alive = true;
    setStory(null);
    setComments([]);
    setLoadedParents(new Set());
    setDigest(null);
    setTranslatingStory(false);
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

  // Lazy comments: only the top level loads with the story; each subtree is
  // fetched on demand ("Expand N replies") instead of pulling 1000 items up front.
  const loadKids = useCallback(async (parentId: number, kids: number[]) => {
    setLoadedParents((prev) => {
      if (prev.has(parentId)) return prev;
      const next = new Set(prev);
      next.add(parentId);
      return next;
    });
    const got = await fetchItems(kids);
    setComments((prev) => {
      const seen = new Set(prev.map((c) => c.id));
      return [...prev, ...got.filter((x): x is HNItem => x != null && !x.dead && !x.deleted && !seen.has(x.id))];
    });
  }, []);

  useEffect(() => {
    if (!story?.kids?.length) return;
    setCommentsLoading(true);
    void loadKids(story.id, story.kids).finally(() => setCommentsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story?.id]);

  const expandKids = useCallback(
    (item: HNItem) => {
      if (item.kids?.length) void loadKids(item.id, item.kids);
    },
    [loadKids]
  );


  // Keyboard: <-/u back, t translate story, Shift+T translate all, d digest.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'ArrowLeft' || e.key === sc.detailBack) {
        back();
      } else if (e.key === sc.detailTranslate) {
        void translateStoryNow();
      } else if (e.key === sc.detailTranslateAll) {
        toggleAutoMode();
      } else if (e.key === sc.detailDigest) {
        void runDigest();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const tree = useMemo(() => buildTree(comments), [comments]);
  const roots = story ? (tree.get(story.id) ?? []) : [];

  const requireLLM = () => { if (llm) return llm; toast.info(t.noKeyTitle + ' — ' + t.goSettings); navigate({ type: 'settings' }); return null; };

  const translateStoryNow = async () => {
    const cfg = requireLLM();
    if (!cfg || !story || translatingStory) return;
    setTranslatingStory(true);
    try {
      const r = await translateStory(cfg, story, target);
      put(id, r);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setTranslatingStory(false);
    }
  };

  const visibleComments = useMemo(
    () => collectVisible(roots, tree, useTree.getState().collapsed),
    [roots, tree]
  );

  // ---- Follow-scroll translation: viewport enters a queue, batches drain ----
  const [autoMode, setAutoMode] = useState(false);
  const [autoDone, setAutoDone] = useState(0);
  const autoQueue = useRef<HNItem[]>([]);
  const autoSeen = useRef<Set<number>>(new Set());
  const autoRunning = useRef(false);
  const autoAbort = useRef<AbortController | null>(null);

  const pumpAuto = useCallback(async () => {
    if (autoRunning.current || autoQueue.current.length === 0) return;
    const cfg = llm;
    if (!cfg) return;
    autoRunning.current = true;
    const ac = new AbortController();
    autoAbort.current = ac;
    try {
      while (autoQueue.current.length > 0 && !ac.signal.aborted) {
        const batch = autoQueue.current.splice(0, autoQueue.current.length);
        try {
          const { failed } = await translateComments(
            cfg,
            batch,
            target,
            (results) => {
              for (const [cid, text] of results) put(cid, { text });
              setAutoDone((d) => d + results.size);
            },
            ac.signal
          );
          if (failed > 0 && !ac.signal.aborted) toast.error(t.someFailed.replace('{n}', String(failed)));
        } catch (e) {
          if (!ac.signal.aborted) toast.error(e instanceof Error ? e.message : String(e));
        }
      }
    } finally {
      autoRunning.current = false;
    }
  }, [llm, target, put, t]);

  // Debounced pump: entries arriving together (a viewport's worth) merge
  // into ONE translation batch instead of one request per comment.
  const pumpTimer = useRef<number | null>(null);
  const schedulePump = useCallback(() => {
    if (pumpTimer.current != null) return;
    pumpTimer.current = window.setTimeout(() => {
      pumpTimer.current = null;
      void pumpAuto();
    }, 400);
  }, [pumpAuto]);

  const enqueueVisible = useCallback(
    (item: HNItem) => {
      if (autoSeen.current.has(item.id)) return;
      if (useTrans.getState().map[item.id]?.text) return; // already translated
      autoSeen.current.add(item.id);
      autoQueue.current.push(item);
      schedulePump();
    },
    [schedulePump]
  );

  const toggleAutoMode = useCallback(() => {
    setAutoMode((on) => {
      if (on) {
        autoAbort.current?.abort();
        autoQueue.current = [];
        if (pumpTimer.current != null) {
          clearTimeout(pumpTimer.current);
          pumpTimer.current = null;
        }
      }
      return !on;
    });
  }, []);

  // Global setting: follow-scroll auto-translation without pressing anything.
  const autoOnScroll = useSettings((s) => s.settings.autoTranslateOnScroll);
  useEffect(() => {
    if (autoOnScroll) setAutoMode(true);
  }, [autoOnScroll]);

  // New story: reset the follow state (mode itself persists).
  useEffect(() => {
    autoAbort.current?.abort();
    autoQueue.current = [];
    autoSeen.current = new Set();
    setAutoDone(0);
    if (pumpTimer.current != null) {
      clearTimeout(pumpTimer.current);
      pumpTimer.current = null;
    }
  }, [id]);

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
      if (!ac.signal.aborted) toast.error(e instanceof Error ? e.message : String(e));
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
            disabled={translatingStory}
          >
            {translatingStory ? (
              <IconRefresh className="animate-spin" width={13} height={13} />
            ) : (
              <IconTranslate width={13} height={13} />
            )}
            {translatingStory ? `${t.translating}…` : t.translateStoryBtn}
          </button>
          {comments.length > 0 && (
            <button
              title={t.translateVisibleHint}
              className={autoMode ? 'flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accentsoft px-3 py-1.5 text-xs font-medium text-accent hover:opacity-90' : 'flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium hover:bg-raised'}
              onClick={toggleAutoMode}
            >
              <IconTranslate className={autoMode ? 'animate-pulse' : ''} width={13} height={13} />
              {autoMode ? `${t.autoFollowing} ${autoDone}` : `${t.translateAll} (${visibleComments.length})`}
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
          {commentsLoading && (
            <div className="flex items-center gap-2 py-2 text-xs text-mute">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
              {t.loadingComments}
            </div>
          )}
          {comments.length === 0 ? (
            <div className="py-6 text-center text-sm text-mute">
              {story.kids?.length ? t.loading : t.noResults}
            </div>
          ) : (
            <div className="space-y-3 pb-10">
              {roots.map((c) => (
                <CommentNode
                  key={c.id}
                  item={c}
                  children={tree.get(c.id)}
                  tree={tree}
                  kidsLoaded={loadedParents.has(c.id)}
                  onExpandKids={expandKids}
                  autoActive={autoMode}
                  onAutoVisible={enqueueVisible}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
