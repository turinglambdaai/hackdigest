// Auto-update via the Glaze backend (R3 of the Glaze migration). The
// backend verifies the signed feed, downloads on a worker thread and owns
// the platform install handover; this module drives the flow: silent check
// → confirm → start_download → poll state → confirm → install.
//
// Modes returned by /api/update/check:
//   download — portable mac/win install: in-app download + swap + restart
//   manual   — Linux archive: download, then reveal the folder by hand
//   page     — installer-based (DMG/MSI) or unknown: release page only

import { apiPost } from '@hackdigest/core';

export type UpdateMode = 'download' | 'manual' | 'page';

export interface UpdateInfo {
  version: string;
  /** Release page, for the page-mode fallback. */
  url: string;
  mode: UpdateMode;
  sizeBytes?: number;
}

export interface UpdateState {
  phase: 'idle' | 'checking' | 'downloading' | 'downloaded' | 'error';
  percent: number;
  message?: string | null;
  downloadedPath?: string | null;
  availableVersion?: string | null;
}

export async function checkForUpdate(): Promise<UpdateInfo | null> {
  try {
    const { update } = await apiPost<{ update: UpdateInfo | null }>('/api/update/check');
    return update ?? null;
  } catch {
    return null;
  }
}

export async function startUpdateDownload(): Promise<boolean> {
  const res = await apiPost<{ ok: boolean; message?: string }>('/api/update/start');
  return res.ok;
}

export async function getUpdateState(): Promise<UpdateState> {
  return apiPost<UpdateState>('/api/update/state');
}

/** mac/win: quit and let the backend swap the install; linux: reveal. */
export async function installUpdate(): Promise<{ ok: boolean; message?: string }> {
  return apiPost<{ ok: boolean; message?: string }>('/api/update/install');
}

/** 800ms state polling until the phase settles or the caller bails. */
export async function pollUpdateState(
  onTick: (state: UpdateState) => void,
  isCancelled: () => boolean = () => false
): Promise<UpdateState> {
  for (;;) {
    if (isCancelled()) {
      return { phase: 'idle', percent: 0 };
    }
    const state = await getUpdateState().catch(() => null);
    if (!state) {
      return { phase: 'error', percent: 0, message: 'update state unavailable' };
    }
    onTick(state);
    if (state.phase !== 'downloading') return state;
    await new Promise((resolve) => setTimeout(resolve, 800));
  }
}
