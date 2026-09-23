// Feed page: ranked list with progressive item loading + infinite scroll.

import { useEffect, useMemo, useState } from 'react';
import { fetchFeedIds, fetchItems, type FeedId, type HNItem } from '@hackdigest/core';
import { useI18n } from '../i18n';
import { useSentinel } from '../lib/hooks';
import { listBookmarks, listReadIds, toggleBookmark, type BookmarkEntry } from '../lib/bookmarks';
import StoryRow from './StoryRow';
import { IconRefresh } from './icons';

const PAGE = 30;

export default function StoryList({ feed }: { feed: FeedId }) {
  const { t } = useI18n();
  const [ids, setIds] = useState<number[] | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [visible, setVisible] = useState(PAGE);
  const [items, setItems] = useState<HNItem[]>([]);
  const [readIds, setReadIds] = useState<Set<number>>(new Set());
  const [bookmarks, setBookmarks] = useState<Set<number>>(new Set());
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    setIds(null);
    setError(null);
    setVisible(PAGE);
    setItems([]);
    listReadIds().then((s) => alive && setReadIds(s));
    listBookmarks().then((b) => alive && setBookmarks(new Set(b.map((e) => e.id))));
    fetchFeedIds(feed)
      .then((r) => alive && setIds(r))
      .catch((e: Error) => alive && setError(e));
    return () => {
      alive = false;
    };
  }, [feed, tick]);

  useEffect(() => {
    if (!ids) return;
    let alive = true;
    const slice = ids.slice(0, visible);
    fetchItems(slice).then((got) => {
      if (alive) setItems(got.filter((x): x is HNItem => x != null));
    });
    return () => {
      alive = false;
    };
  }, [ids, visible]);

  const sentinel = useSentinel(
    () => setVisible((v) => (ids && v < ids.length ? v + PAGE : v)),
    !!ids && visible < (ids?.length ?? 0)
  );

  const rankBase = useMemo(() => 1, []);

  if (error)
    return (
      <div className="p-8 text-center text-mute">
        {t.loadFail} — {error.message}
        <button className="ml-3 text-accent underline" onClick={() => setTick((x) => x + 1)}>
          {t.retry}
        </button>
      </div>
    );
  if (!ids) return <div className="p-8 text-center text-mute">{t.loading}</div>;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-bg/85 px-5 py-2.5 backdrop-blur">
        <div className="text-sm font-semibold">{t.feeds[feed]}</div>
        <button
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-mute hover:bg-raised hover:text-ink"
          onClick={() => setTick((x) => x + 1)}
        >
          <IconRefresh width={13} height={13} />
          {t.refresh}
        </button>
      </div>
      {items.map((item, i) => (
        <StoryRow
          key={item.id}
          item={item}
          rank={rankBase + i}
          read={readIds.has(item.id)}
          bookmarked={bookmarks.has(item.id)}
          onToggleBookmark={async (id) => {
            const now = await toggleBookmark(id);
            setBookmarks((prev) => {
              const next = new Set(prev);
              if (now) next.add(id);
              else next.delete(id);
              return next;
            });
          }}
        />
      ))}
      {items.length < Math.min(visible, ids.length) && (
        <div className="p-6 text-center text-sm text-mute">{t.loading}</div>
      )}
      <div ref={sentinel} className="h-4" />
    </div>
  );
}
