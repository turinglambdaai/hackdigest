// HN search via Algolia.

import { useEffect, useState } from 'react';
import { searchHN, timeAgo, type AlgoliaHit } from '@hackdigest/core';
import { useI18n } from '../i18n';
import { useUI } from '../state/store';

export default function SearchPage({ query }: { query: string }) {
  const { t, lang } = useI18n();
  const navigate = useUI((s) => s.navigate);
  const [hits, setHits] = useState<AlgoliaHit[] | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [running, setRunning] = useState(true);
  const [q, setQ] = useState(query);

  const run = (value: string) => {
    setRunning(true);
    setError(null);
    searchHN(value)
      .then((r) => setHits(r.hits))
      .catch((e: Error) => setError(e))
      .finally(() => setRunning(false));
  };

  useEffect(() => {
    run(query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  return (
    <div className="mx-auto max-w-3xl">
      <form
        className="sticky top-0 z-10 flex gap-2 border-b border-line bg-bg/85 px-5 py-2.5 backdrop-blur"
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim()) run(q.trim());
        }}
      >
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
