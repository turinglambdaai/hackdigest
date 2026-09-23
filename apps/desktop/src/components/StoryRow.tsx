import { useState } from 'react';
import { timeAgo, domainOf, translateStory, type HNItem } from '@hackdigest/core';
import { useI18n } from '../i18n';
import { useUI, useSettings, useTrans } from '../state/store';
import { IconStar, IconTranslate } from './icons';

interface Props {
  item: HNItem;
  rank?: number;
  read?: boolean;
  bookmarked?: boolean;
  onToggleBookmark?: (id: number) => void;
}

export default function StoryRow({ item, rank, read, bookmarked, onToggleBookmark }: Props) {
  const { t, lang } = useI18n();
  const navigate = useUI((s) => s.navigate);
  const llm = useSettings((s) => s.settings.llm);
  const target = useSettings((s) => s.settings.translateTarget);
  const put = useTrans((s) => s.put);
  const trans = useTrans((s) => s.map[item.id]);
  const [busy, setBusy] = useState(false);

  const domain = domainOf(item.url);
  const titleTranslated = trans?.title && trans.title !== item.title;

  const quickTranslate = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!llm) return navigate({ type: 'settings' });
    if (busy) return;
    setBusy(true);
    try {
      const r = await translateStory(llm, item, target);
      put(item.id, r);
    } catch {
      /* surfaced on the detail page; the row stays silent */
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="group cursor-pointer border-b border-line/60 px-5 py-3 transition-colors hover:bg-raised/60"
      onClick={() => navigate({ type: 'story', id: item.id })}
    >
      <div className="flex items-start gap-3">
        {rank != null && <div className="w-7 shrink-0 pt-0.5 text-right text-[13px] text-mute tabular-nums">{rank}.</div>}
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <span className={`text-[15px] font-medium leading-snug ${read ? 'text-mute' : 'text-ink'}`}>
              {titleTranslated ? trans!.title : item.title}
            </span>
            {titleTranslated && (
              <span className="mt-0.5 hidden shrink-0 truncate text-xs text-mute sm:inline" title={item.title}>
                {item.title}
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-mute">
            {item.score != null && (
              <span>
                {item.score} {t.points}
              </span>
            )}
            {item.by && (
              <span>
                {t.by} {item.by}
              </span>
            )}
            <span>{timeAgo(item.time, lang)}</span>
            {domain && <span className="rounded bg-raised px-1.5 py-px">{domain}</span>}
            {item.descendants != null && item.descendants > 0 && (
              <span>
                {item.descendants} {t.comments}
              </span>
            )}
            {read && <span className="text-mute/60">{t.readMark}</span>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1 pt-0.5">
          <button
            title={t.translate}
            className="rounded-md p-1.5 text-mute opacity-0 transition-opacity hover:bg-raised hover:text-accent group-hover:opacity-100 focus:opacity-100"
            onClick={quickTranslate}
          >
            <IconTranslate className={busy ? 'animate-pulse' : ''} width={14} height={14} />
          </button>
          <button
            title={bookmarked ? t.bookmarkRemoved : t.bookmarkAdded}
            className={`rounded-md p-1.5 transition-colors hover:bg-raised ${
              bookmarked ? 'text-accent' : 'text-mute opacity-0 group-hover:opacity-100 focus:opacity-100'
            }`}
            onClick={(e) => {
              e.stopPropagation();
              onToggleBookmark?.(item.id);
            }}
          >
            <IconStar filled={bookmarked} width={14} height={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
