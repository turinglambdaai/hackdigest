// Top banner: a new version is available. R3 flow: download → progress →
// "quit and install" (mac/win portable), reveal-folder (linux), or release
// page fallback (DMG/MSI installs the backend cannot swap by itself).
// The state machine lives in useUpdateFlow so Settings can reuse it.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import { openExternal } from '../lib/hooks';
import {
  checkForUpdate,
  installUpdate,
  pollUpdateState,
  startUpdateDownload,
  type UpdateInfo,
} from '../lib/updater';
import { IconRefresh } from './icons';

export type UpdateFlowPhase =
  | 'found'
  | 'downloading'
  | 'downloaded'
  | 'installing'
  | 'error';

/** Drive one update: start the backend download, poll progress, install. */
export function useUpdateFlow(update: UpdateInfo | null) {
  const [phase, setPhase] = useState<UpdateFlowPhase>('found');
  const [percent, setPercent] = useState(0);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    setPhase('found');
    setPercent(0);
  }, [update?.version]);

  const download = useCallback(async () => {
    if (!update) return;
    setPhase('downloading');
    try {
      await startUpdateDownload();
      const final = await pollUpdateState((s) => {
        if (alive.current) setPercent(s.percent);
      }, () => !alive.current);
      setPhase(final.phase === 'downloaded' ? 'downloaded' : 'error');
    } catch {
      setPhase('error');
    }
  }, [update]);

  const install = useCallback(async () => {
    setPhase('installing');
    try {
      const res = await installUpdate();
      if (!res.ok) setPhase('error');
      // mac/win: the backend exits on a delay and relaunches the new app;
      // linux: the download folder just opened.
    } catch {
      setPhase('error');
    }
  }, []);

  return { phase, percent, download, install };
}

export default function UpdateBanner({ update, onClose }: { update: UpdateInfo | null; onClose: () => void }) {
  const { t } = useI18n();
  const { phase, percent, download, install } = useUpdateFlow(update);

  if (!update) return null;

  const opensFolder = update.mode === 'manual';
  const inPlace = update.mode === 'download';

  return (
    <div className="flex items-center gap-2 border-b border-accent/40 bg-accentsoft px-4 py-1.5 text-xs text-ink">
      <IconRefresh width={13} height={13} className="shrink-0 text-accent" />
      <span>
        {t.updateAvailable}: <strong>v{update.version}</strong>
      </span>
      {phase === 'found' && (inPlace || opensFolder) && (
        <button
          className="ml-1 rounded-md bg-accent px-2 py-0.5 font-medium text-white hover:opacity-90"
          onClick={() => void download()}
        >
          {t.updateDownload}
        </button>
      )}
      {phase === 'downloading' && (
        <span className="ml-1 text-mute">{t.updateDownloading.replace('{percent}', String(percent))}</span>
      )}
      {phase === 'downloaded' && !opensFolder && (
        <button
          className="ml-1 rounded-md bg-accent px-2 py-0.5 font-medium text-white hover:opacity-90"
          onClick={() => void install()}
        >
          {t.updateReadyInstall}
        </button>
      )}
      {phase === 'downloaded' && opensFolder && (
        <>
          <span className="ml-1 text-mute">{t.updateManualHint}</span>
          <button
            className="ml-1 rounded-md bg-accent px-2 py-0.5 font-medium text-white hover:opacity-90"
            onClick={() => void install()}
          >
            {t.updateOpenFolder}
          </button>
        </>
      )}
      {phase === 'installing' && <span className="ml-1 text-mute">{t.updateInstalling}</span>}
      {phase === 'error' && <span className="ml-1 text-mute">{t.updateFailed}</span>}
      {update.mode === 'page' && (
        <button
          className="ml-1 rounded-md bg-accent px-2 py-0.5 font-medium text-white hover:opacity-90"
          onClick={() => void openExternal(update.url)}
        >
          {t.updateNow}
        </button>
      )}
      {update.mode === 'page' && <span className="ml-1 text-mute">{t.updatePageHint}</span>}
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
