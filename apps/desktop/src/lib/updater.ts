// Auto-update via tauri-plugin-updater (silent check, banner-driven install).

import { isTauri } from '@hackdigest/core';

export interface UpdateInfo {
  version: string;
  body?: string;
  downloadAndInstall: (onProgress?: (p: { downloaded: number; total: number | null }) => void) => Promise<void>;
}

export async function checkForUpdate(): Promise<UpdateInfo | null> {
  if (!isTauri()) return null;
  const { check } = await import('@tauri-apps/plugin-updater');
  const update = await check();
  if (!update) return null;
  return {
    version: update.version,
    body: update.body ?? undefined,
    downloadAndInstall: async (onProgress) => {
      let downloaded = 0;
      let total: number | null = null;
      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case 'Started':
            total = event.data.contentLength ?? null;
            break;
          case 'Progress':
            downloaded += event.data.chunkLength;
            break;
          case 'Finished':
            break;
        }
        onProgress?.({ downloaded, total });
      });
    },
  };
}

export async function relaunchApp(): Promise<void> {
  const { relaunch } = await import('@tauri-apps/plugin-process');
  await relaunch();
}
