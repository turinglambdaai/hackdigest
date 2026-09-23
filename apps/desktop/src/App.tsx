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

export default function App() {
  const view = useUI((s) => s.view);
  const settings = useSettings((s) => s.settings);
  const loaded = useSettings((s) => s.loaded);
  const init = useSettings((s) => s.init);
  const update = useStartupUpdateCheck();
  const [bannerDismissed, setBannerDismissed] = useState(false);

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
      <ToastHost />
    </div>
  );
}
