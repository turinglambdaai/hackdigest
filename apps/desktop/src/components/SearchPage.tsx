// HN search via Algolia: relevance/newest ordering + time-range filter.

import { useEffect, useState } from 'react';
import { searchHN, timeAgo, type AlgoliaHit } from '@hackdigest/core';
import { useI18n } from '../i18n';
import { useUI } from '../state/store';

type SortBy = 'relevance' | 'date';
type Range = 'all' | 'year' | 'month' | 'week' | 'day';

const RANGE_SECONDS: Record<Range, number> = {
  all: 0,
  year: 365 * 86400,
  month: 30 * 86400,
  week: 7 * 86400,
  day: 86400,
};

export default function SearchPage({ query }: { query: string }) {
  const { t, lang } = useI18n();
  const navigate = useUI((s) => s.navigate);
  const [hits, setHits] = useState<AlgoliaHit[] | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [running, setRunning] = useState(true);
  const [q, setQ] = useState(query);
  const [sortBy, setSortBy] = useState<SortBy>('relevance');
  const [range, setRange] = useState<Range>('all');

  const run = (value: string, sort: SortBy, rng: Range) => {
    setRunning(true);
    setError(null);
    const min = RANGE_SECONDS[rng];
    searchHN(value, {
      sortBy: sort,
      ...(min ? { minCreatedAt: Math.floor(Date.now() / 1000) - min } : {}),
    })
      .then((r) => setHits(r.hits))
      .catch((e: Error) => setError(e))
      .finally(() => setRunning(false));
  };

  useEffect(() => {
    run(query, sortBy, range);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const chipCls = (active: boolean) =>
    `rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
      active ? 'bg-accent text-white' : 'border border-line text-mute hover:text-ink'
    }`;

  return (
    <div className="mx-auto max-w-3xl">
      <form
        className="sticky top-0 z-10 border-b border-line bg-bg/85 px-5 py-2.5 backdrop-blur"
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim()) run(q.trim(), sortBy, range);
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
            <button type="button" className={chipCls(sortBy === 'relevance')} onClick={() => { setSortBy('relevance'); run(q.trim() || query, 'relevance', range); }}>
              {t.sortRelevance}
            </button>
            <button type="button" className={chipCls(sortBy === 'date')} onClick={() => { setSortBy('date'); run(q.trim() || query, 'date', range); }}>
              {t.sortNewest}
            </button>
          </div>
          <select
            className="rounded-md border border-line bg-raised px-2 py-1 text-[11px] text-mute outline-none"
            value={range}
            onChange={(e) => {
              const r = e.target.value as Range;
              setRange(r);
              run(q.trim() || query, sortBy, r);
            }}
          >
            <option value="all">{t.rangeAll}</option>
            <option value="year">{t.rangeYear}</option>
            <option value="month">{t.rangeMonth}</option>
            <option value="week">{t.rangeWeek}</option>
            <option value="day">{t.rangeDay}</option>
          </select>
        </div>
      </form>

      {running && <div className="p-8 text-center text-sm text-mute">{t.loading}</div>}
      {error && (
        <div className="p-8 text-center text-sm text-mute">
          {t.loadFail} — {error.message}
        </div>
      )}
      {hits && hits.length === 0 && !running && (
        <div className="p-8 text-center text-sm text-mute">{t.noResults}</div>
      )}
      {hits?.map((h) => (
        <div
          key={h.objectID}
          className="cursor-pointer border-b border-line/60 px-5 py-3 hover:bg-raised/60"
          onClick={() => h.story_id && navigate({ type: 'story', id: h.story_id })}
        >
          <div className="text-[15px] font-medium leading-snug">{h.title ?? '(no title)'}</div>
          <div className="mt-1 flex gap-2 text-xs text-mute">
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
      ))}
    </div>
  );
}
