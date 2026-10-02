// Top banner: a new version is available → jump to the release page.
// R1 of the Glaze migration has no in-place installer (backend #17 scope);
// the full download/install chain returns in R3 (docs/GLAZE-MIGRATION.md).

import { useState } from 'react';
import { useI18n } from '../i18n';
import { openExternal } from '../lib/hooks';
import { checkForUpdate, type UpdateInfo } from '../lib/updater';
import { IconRefresh } from './icons';

export default function UpdateBanner({ update, onClose }: { update: UpdateInfo | null; onClose: () => void }) {
  const { t } = useI18n();
  const [opening, setOpening] = useState(false);
  if (!update) return null;

  const open = async () => {
    setOpening(true);
    try {
      await openExternal(update.url);
    } finally {
      setOpening(false);
    }
  };

  return (
    <div className="flex items-center gap-2 border-b border-accent/40 bg-accentsoft px-4 py-1.5 text-xs text-ink">
      <IconRefresh width={13} height={13} className="shrink-0 text-accent" />
      <span>
        {t.updateAvailable}: <strong>v{update.version}</strong>
      </span>
      <button
        className="ml-1 rounded-md bg-accent px-2 py-0.5 font-medium text-white hover:opacity-90 disabled:opacity-60"
        onClick={open}
        disabled={opening}
      >
        {t.updateNow}
      </button>
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
