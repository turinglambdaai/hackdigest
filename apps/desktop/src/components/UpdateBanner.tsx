// Top banner: a new version is available → one click download + install + relaunch.

import { useState } from 'react';
import { useI18n } from '../i18n';
import { checkForUpdate, relaunchApp, type UpdateInfo } from '../lib/updater';
import { IconRefresh } from './icons';

type Phase = 'idle' | 'downloading' | 'ready' | 'error';

export default function UpdateBanner({ update, onClose }: { update: UpdateInfo | null; onClose: () => void }) {
  const { t } = useI18n();
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState('');
  if (!update) return null;

  const run = async () => {
    setPhase('downloading');
    try {
      await update.downloadAndInstall((p) => {
        const mb = (n: number) => `${(n / 1048576).toFixed(1)} MB`;
        setProgress(p.total ? `${mb(p.downloaded)} / ${mb(p.total)}` : mb(p.downloaded));
      });
      setPhase('ready');
      await relaunchApp();
    } catch {
      setPhase('error');
    }
  };

  return (
    <div className="flex items-center gap-2 border-b border-accent/40 bg-accentsoft px-4 py-1.5 text-xs text-ink">
      <IconRefresh width={13} height={13} className="shrink-0 text-accent" />
      <span>
        {t.updateAvailable}: <strong>v{update.version}</strong>
      </span>
      {phase === 'downloading' && <span className="text-mute">{progress}…</span>}
      {phase === 'error' && <span className="text-red-600 dark:text-red-400">{t.updateFailed}</span>}
      {phase !== 'downloading' && phase !== 'ready' && (
        <button className="ml-1 rounded-md bg-accent px-2 py-0.5 font-medium text-white hover:opacity-90" onClick={run}>
          {t.updateNow}
        </button>
      )}
      <button className="ml-auto rounded-md px-1.5 py-0.5 text-mute hover:text-ink" onClick={onClose}>
        ✕
      </button>
    </div>
  );
}

/** Silent startup check; shows nothing unless an update exists. */
export function useStartupUpdateCheck() {
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  useState(() => {
    void checkForUpdate()
      .then(setUpdate)
      .catch(() => {});
  });
  return update;
}

export { checkForUpdate };
