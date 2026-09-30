// HN search via Algolia: story/comment types, relevance/newest ordering,
// time-range filter, and pagination (load more).

import { useEffect, useState } from 'react';
import { searchHN, timeAgo, type AlgoliaHit } from '@hackdigest/core';
import { useI18n } from '../i18n';
import { useUI } from '../state/store';

type SortBy = 'relevance' | 'date';
type Range = 'all' | 'year' | 'month' | 'week' | 'day';
type Type = 'story' | 'comment';

const RANGE_SECONDS: Record<Range, number> = {
  all: 0,
  year: 365 * 86400,
  month: 30 * 86400,
  week: 7 * 86400,
  day: 86400,
};

const stripHtml = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

export default function SearchPage({ query }: { query: string }) {
  const { t, lang } = useI18n();
  const navigate = useUI((s) => s.navigate);
  const [hits, setHits] = useState<AlgoliaHit[] | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [running, setRunning] = useState(true);
  const [q, setQ] = useState(query);
  const [sortBy, setSortBy] = useState<SortBy>('relevance');
  const [range, setRange] = useState<Range>('all');
  const [type, setType] = useState<Type>('story');
  const [page, setPage] = useState(0);
  const [morePages, setMorePages] = useState(false);

  const params = () => {
    const min = RANGE_SECONDS[range];
    return {
      sortBy,
      type,
      ...(min ? { minCreatedAt: Math.floor(Date.now() / 1000) - min } : {}),
    };
  };

  const run = (value: string) => {
    setRunning(true);
    setError(null);
    setPage(0);
    searchHN(value, params())
      .then((r) => {
        setHits(r.hits);
        setMorePages(r.page + 1 < r.nbPages);
      })
      .catch((e: Error) => setError(e))
      .finally(() => setRunning(false));
  };

  const loadMore = () => {
    const next = page + 1;
    setRunning(true);
    searchHN(q.trim() || query, { ...params(), page: next })
      .then((r) => {
        setHits((prev) => [...(prev ?? []), ...r.hits]);
        setPage(next);
        setMorePages(r.page + 1 < r.nbPages);
      })
      .catch((e: Error) => setError(e))
      .finally(() => setRunning(false));
  };

  useEffect(() => {
    run(query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const chipCls = (active: boolean) =>
    `rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
      active ? 'bg-accent text-white' : 'border border-line text-mute hover:text-ink'
    }`;

  const rerun = (patch2: Partial<{ sortBy: SortBy; range: Range; type: Type }>) => {
    if (patch2.sortBy) setSortBy(patch2.sortBy);
    if (patch2.range) setRange(patch2.range);
    if (patch2.type) setType(patch2.type);
    setRunning(true);
    setError(null);
    setPage(0);
    const min = patch2.range ? RANGE_SECONDS[patch2.range] : RANGE_SECONDS[range];
    searchHN(q.trim() || query, {
      sortBy: patch2.sortBy ?? sortBy,
      type: patch2.type ?? type,
      ...(min ? { minCreatedAt: Math.floor(Date.now() / 1000) - min } : {}),
    })
      .then((r) => {
        setHits(r.hits);
        setMorePages(r.page + 1 < r.nbPages);
      })
      .catch((e: Error) => setError(e))
      .finally(() => setRunning(false));
  };

  return (
    <div className="mx-auto max-w-3xl">
      <form
        className="sticky top-0 z-10 border-b border-line bg-bg/85 px-5 py-2.5 backdrop-blur"
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim()) run(q.trim());
        }}
      >
        <div className="flex gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus
            className="flex-1 rounded-lg bg-raised px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-accent/50"
            placeholder={t.searchPlaceholder}
          />
          <button className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90">
            {t.search}
          </button>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <div className="flex gap-1.5">
            <button type="button" className={chipCls(type === 'story')} onClick={() => rerun({ type: 'story' })}>
              {t.typeStory}
            </button>
            <button type="button" className={chipCls(type === 'comment')} onClick={() => rerun({ type: 'comment' })}>
              {t.typeComment}
            </button>
          </div>
          <div className="flex gap-1.5">
            <button type="button" className={chipCls(sortBy === 'relevance')} onClick={() => rerun({ sortBy: 'relevance' })}>
              {t.sortRelevance}
            </button>
            <button type="button" className={chipCls(sortBy === 'date')} onClick={() => rerun({ sortBy: 'date' })}>
              {t.sortNewest}
            </button>
          </div>
          <select
            className="rounded-md border border-line bg-raised px-2 py-1 text-[11px] text-mute outline-none"
            value={range}
            onChange={(e) => rerun({ range: e.target.value as Range })}
          >
            <option value="all">{t.rangeAll}</option>
            <option value="year">{t.rangeYear}</option>
            <option value="month">{t.rangeMonth}</option>
            <option value="week">{t.rangeWeek}</option>
            <option value="day">{t.rangeDay}</option>
          </select>
        </div>
      </form>

      {running && hits == null && <div className="p-8 text-center text-sm text-mute">{t.loading}</div>}
      {error && (
        <div className="p-8 text-center text-sm text-mute">
          {t.loadFail} — {error.message}
        </div>
      )}
      {hits && hits.length === 0 && !running && (
        <div className="p-8 text-center text-sm text-mute">{t.noResults}</div>
      )}
      {hits?.map((h) =>
        type === 'comment' ? (
          <div
            key={h.objectID}
            className="cursor-pointer border-b border-line/60 px-5 py-3 hover:bg-raised/60"
            onClick={() => h.story_id && navigate({ type: 'story', id: h.story_id })}
          >
            <div className="text-[13px] leading-snug text-ink/85">{stripHtml(h.comment_text ?? '').slice(0, 180) || '(empty)'}</div>
            <div className="mt-1 flex flex-wrap gap-2 text-xs text-mute">
              <span>{t.by} {h.author}</span>
              <span>{timeAgo(Math.floor(new Date(h.created_at).getTime() / 1000), lang)}</span>
              {h.story_title && <span className="truncate text-accent/80">↩ {h.story_title.slice(0, 60)}</span>}
            </div>
          </div>
        ) : (
          <div
            key={h.objectID}
            className="cursor-pointer border-b border-line/60 px-5 py-3 hover:bg-raised/60"
            onClick={() => h.story_id && navigate({ type: 'story', id: h.story_id })}
          >
            <div className="text-[15px] font-medium leading-snug">{h.title ?? '(no title)'}</div>
            <div className="mt-1 flex flex-wrap gap-2 text-xs text-mute">
              {h.points != null && (
                <span>
                  {h.points} {t.points}
                </span>
              )}
              <span>
                {t.by} {h.author}
              </span>
              <span>{timeAgo(Math.floor(new Date(h.created_at).getTime() / 1000), lang)}</span>
              {h.num_comments != null && (
                <span>
                  {h.num_comments} {t.comments}
                </span>
              )}
            </div>
          </div>
        )
      )}
      {hits && morePages && !running && (
        <div className="p-5 text-center">
          <button
            className="rounded-lg border border-line bg-surface px-4 py-1.5 text-xs font-medium text-mute hover:border-accent hover:text-accent"
            onClick={loadMore}
          >
            {t.loadMore}
          </button>
        </div>
      )}
      {running && hits != null && <div className="p-4 text-center text-xs text-mute">{t.loading}</div>}
    </div>
  );
}
