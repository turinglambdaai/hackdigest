// Auto-update via the Glaze backend (silent check, banner-driven). R1 is
// detection + jump to the release page; in-place install returns in R3
// (docs/GLAZE-MIGRATION.md).

import { apiPost } from '@hackdigest/core';

export interface UpdateInfo {
  version: string;
  body?: string;
  /** Release page to open in the browser. */
  url: string;
}

export async function checkForUpdate(): Promise<UpdateInfo | null> {
  try {
    const { update } = await apiPost<{ update: UpdateInfo | null }>('/api/update/check');
    return update ?? null;
  } catch {
    return null;
  }
}

export async function relaunchApp(): Promise<void> {
  // Legacy name kept for the banner import; R1 has no in-place relaunch.
  // Opening the release page is handled by UpdateBanner via openExternal.
  throw new Error('relaunch not supported in R1');
}
