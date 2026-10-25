import { useState } from 'react';
import type { FeedId } from '@hackdigest/core';
import { useUI, useSettings } from '../state/store';
import { useI18n } from '../i18n';
import {
  IconSearch,
  IconStar,
  IconNewspaper,
  IconSettings,
  IconSun,
  IconMoon,
  IconRefresh,
} from './icons';

const FEEDS: FeedId[] = ['top', 'new', 'best', 'ask', 'show', 'job'];

export default function Sidebar() {
  const { t } = useI18n();
  const view = useUI((s) => s.view);
  const navigate = useUI((s) => s.navigate);
  const settings = useSettings((s) => s.settings);
  const patch = useSettings((s) => s.patch);
  const [query, setQuery] = useState('');

  const dark = settings.theme === 'dark';
  // Native buttons: every destination is keyboard reachable (Tab) and
  // operable with Enter/Space; focus-visible keeps the focus ring visible
  // in both languages. aria-current marks the active destination for
  // assistive tech instead of relying on the color change alone.
  const itemCls = (active: boolean) =>
    `flex w-full items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm text-left transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent ${
      active ? 'bg-accentsoft text-accent font-medium' : 'text-ink/75 hover:bg-raised'
    }`;

  return (
    <aside className="flex h-full w-56 shrink-0 flex-col border-r border-line bg-surface">
      <div className="flex items-center gap-2 px-4 pt-4 pb-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-sm font-bold text-white">
          H
        </div>
        <div className="text-[15px] font-semibold tracking-tight">HackDigest</div>
      </div>

      <form
        className="px-3 pb-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (query.trim()) navigate({ type: 'search', query: query.trim() });
        }}
      >
        <div className="flex items-center gap-2 rounded-lg bg-raised px-2.5 py-1.5 text-sm text-mute focus-within:ring-1 focus-within:ring-accent/50">
          <IconSearch className="shrink-0" width={14} height={14} />
          <input
            id="global-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.searchPlaceholder}
            className="w-full bg-transparent text-ink outline-none placeholder:text-mute"
          />
        </div>
      </form>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3">
        <div className="px-3 pb-1 pt-1 text-[11px] font-medium uppercase tracking-wider text-mute">
          {t.feeds.top}
        </div>
        {FEEDS.map((f) => (
          <button
            key={f}
            type="button"
            className={itemCls(view.type === 'feed' && view.feed === f)}
            aria-current={view.type === 'feed' && view.feed === f ? 'page' : undefined}
            onClick={() => navigate({ type: 'feed', feed: f })}
          >
            <span className="w-3.5 text-center text-mute">{f === 'top' ? '▲' : f === 'new' ? '✦' : f === 'best' ? '★' : f === 'ask' ? '?' : f === 'show' ? '◆' : '▪'}</span>
            {t.feeds[f]}
          </button>
        ))}

        <div className="mt-3 border-t border-line pt-2" />
        <button
          type="button"
          className={itemCls(view.type === 'daily')}
          aria-current={view.type === 'daily' ? 'page' : undefined}
          onClick={() => navigate({ type: 'daily' })}
        >
          <IconNewspaper width={14} height={14} />
          {t.daily}
        </button>
        <button
          type="button"
          className={itemCls(view.type === 'bookmarks')}
          aria-current={view.type === 'bookmarks' ? 'page' : undefined}
          onClick={() => navigate({ type: 'bookmarks' })}
        >
          <IconStar width={14} height={14} />
          {t.bookmarks}
        </button>
      </nav>

      <div className="space-y-0.5 border-t border-line px-3 py-2">
        <button type="button" className={itemCls(false)} onClick={() => patch({ theme: dark ? 'light' : 'dark' })}>
          {dark ? <IconSun width={14} height={14} /> : <IconMoon width={14} height={14} />}
          {dark ? t.themeLight : t.themeDark}
        </button>
        <button
          type="button"
          className={itemCls(view.type === 'settings')}
          aria-current={view.type === 'settings' ? 'page' : undefined}
          onClick={() => navigate({ type: 'settings' })}
        >
          <IconSettings width={14} height={14} />
          {t.settings}
        </button>
        <div className="px-3 pt-1 text-[11px] text-mute/70">{t.footer}</div>
      </div>
    </aside>
  );
}
