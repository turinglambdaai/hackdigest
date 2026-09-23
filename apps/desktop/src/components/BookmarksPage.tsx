// Bookmarks page: saved stories ranked by save time.

import { useEffect, useState } from 'react';
import { fetchItem, type HNItem } from '@hackdigest/core';
import { useI18n } from '../i18n';
import { listBookmarks, toggleBookmark } from '../lib/bookmarks';
import StoryRow from './StoryRow';

export default function BookmarksPage() {
  const { t } = useI18n();
  const [items, setItems] = useState<HNItem[] | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const marks = await listBookmarks();
      const got = await Promise.all(marks.map((m) => fetchItem(m.id)));
      if (alive) setItems(got.filter((x): x is HNItem => x != null));
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="sticky top-0 z-10 border-b border-line bg-bg/85 px-5 py-2.5 backdrop-blur">
        <div className="text-sm font-semibold">{t.bookmarks}</div>
      </div>
      {items == null && <div className="p-8 text-center text-sm text-mute">{t.loading}</div>}
      {items?.length === 0 && <div className="p-8 text-center text-sm text-mute">{t.noResults}</div>}
      {items?.map((item) => (
        <StoryRow
          key={item.id}
          item={item}
          bookmarked
          onToggleBookmark={async (id) => {
            await toggleBookmark(id);
            setItems((prev) => prev?.filter((x) => x.id !== id) ?? null);
          }}
        />
      ))}
    </div>
  );
}
