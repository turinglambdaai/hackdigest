// Daily front-page digest page (BYOK, streamed, cached per day).

import { useEffect, useState } from 'react';
import {
  digestDaily,
  domainOf,
  fetchFeedIds,
  fetchItems,
  getCachedDaily,
  miniMarkdown,
  todayKey,
  type DailyStory,
} from '@hackdigest/core';
import { useI18n } from '../i18n';
import { useSettings, useUI } from '../state/store';
import { IconSpark } from './icons';

export default function DailyDigest() {
  const { t } = useI18n();
  const navigate = useUI((s) => s.navigate);
  const llm = useSettings((s) => s.settings.llm);
  const target = useSettings((s) => s.settings.translateTarget);
  const [content, setContent] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [cached, setCached] = useState(false);
  const [stories, setStories] = useState<DailyStory[] | null>(null);

  useEffect(() => {
    let alive = true;
    const date = todayKey();
    void getCachedDaily(date, target).then((c) => {
      if (c && alive) (setContent(c), setCached(true));
    });
    void (async () => {
      const ids = await fetchFeedIds('top');
      const items = await fetchItems(ids.slice(0, 30));
      if (!alive) return;
      setStories(
        items
          .filter((x): x is NonNullable<typeof x> => x != null)
          .map((s) => ({ id: s.id, title: s.title ?? '', score: s.score ?? 0, comments: s.descendants ?? 0, domain: domainOf(s.url) ?? undefined }))
      );
    })();
    return () => {
      alive = false;
    };
  }, [target]);

  const run = async () => {
    if (!llm) return navigate({ type: 'settings' });
    if (!stories || running) return;
    setRunning(true);
    setContent('');
    setCached(false);
    try {
      await digestDaily(llm, stories, target, todayKey(), (d) => setContent((prev) => prev + d));
    } catch (e) {
      alert(String(e instanceof Error ? e.message : e));
      setContent(null);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-5 py-6">
      <div className="flex items-center gap-2">
        <IconSpark width={18} height={18} className="text-accent" />
        <h1 className="text-lg font-semibold">{t.daily}</h1>
        <span className="text-xs text-mute">{todayKey()}</span>
        <button
          className="ml-auto flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
          onClick={run}
          disabled={running || !stories}
        >
          <IconSpark className={running ? 'animate-pulse' : ''} width={13} height={13} />
          {content && !running ? t.regenerate : t.generateDaily}
        </button>
      </div>
      <p className="mt-1 text-xs text-mute">
        {t.dailyIntro}
        {cached ? ` ${t.dailyCached}` : ''}
      </p>

      {content != null ? (
        <div className="prose-hn mt-5 rounded-xl border border-line bg-surface p-5 text-[14px]" dangerouslySetInnerHTML={{ __html: miniMarkdown(content) }} />
      ) : (
        <div className="mt-5 rounded-xl border border-dashed border-line bg-surface p-8 text-center text-sm text-mute">
          {running ? t.digestThreadRunning : t.dailyIntro}
        </div>
      )}
    </div>
  );
}
