import { useEffect, useState } from 'react';
import { useSettings, useUI, applyChrome } from './state/store';
import Sidebar from './components/Sidebar';
import StoryList from './components/StoryList';
import StoryDetail from './components/StoryDetail';
import SearchPage from './components/SearchPage';
import BookmarksPage from './components/BookmarksPage';
import DailyDigest from './components/DailyDigest';
import SettingsPage from './components/SettingsPage';
import UpdateBanner, { useStartupUpdateCheck } from './components/UpdateBanner';
import ToastHost from './components/Toast';
import ShortcutsOverlay from './components/ShortcutsOverlay';
import { isTypingTarget } from './lib/keys';

const FEED_KEYS: Array<'top' | 'new' | 'best' | 'ask' | 'show' | 'job'> = ['top', 'new', 'best', 'ask', 'show', 'job'];

export default function App() {
  const view = useUI((s) => s.view);
  const navigate = useUI((s) => s.navigate);
  const settings = useSettings((s) => s.settings);
  const loaded = useSettings((s) => s.loaded);
  const init = useSettings((s) => s.init);
  const update = useStartupUpdateCheck();
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);

  // Global keys: 1-6 switch feeds, / focuses search, ? shows the cheat sheet.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === '?') {
        setShowShortcuts((v) => !v);
      } else if (e.key === '/') {
        e.preventDefault();
        document.getElementById('global-search')?.focus();
      } else if (e.key === 'Escape') {
        setShowShortcuts(false);
        (document.activeElement as HTMLElement | null)?.blur?.();
      } else if (/^[1-6]$/.test(e.key)) {
        navigate({ type: 'feed', feed: FEED_KEYS[Number(e.key) - 1] });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => {
    if (loaded) applyChrome(settings);
  }, [loaded, settings]);

  // Re-resolve "auto" theme when the OS switches.
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyChrome(useSettings.getState().settings);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  if (!loaded) return <div className="h-screen w-screen bg-bg" />;

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-bg text-ink">
      {update && !bannerDismissed && <UpdateBanner update={update} onClose={() => setBannerDismissed(true)} />}
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="h-full flex-1 overflow-y-auto">
          {view.type === 'feed' && <StoryList key={view.feed} feed={view.feed} />}
          {view.type === 'story' && <StoryDetail key={view.id} id={view.id} />}
          {view.type === 'search' && <SearchPage key={view.query} query={view.query} />}
          {view.type === 'bookmarks' && <BookmarksPage />}
          {view.type === 'daily' && <DailyDigest />}
          {view.type === 'settings' && <SettingsPage />}
        </main>
      </div>
      {showShortcuts && <ShortcutsOverlay onClose={() => setShowShortcuts(false)} />}
      <ToastHost />
    </div>
  );
}
