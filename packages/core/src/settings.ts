// App settings: the JSON file in the OS app-config dir is the source of
// truth in packaged builds (IndexedDB there proved non-persistent and was
// wiped on updates). IndexedDB remains the store for plain-browser dev.

import type { LLMConfig } from './llm';
import type { HostedStatus } from './hosted';
import { kvGet, kvSet } from './store';
import { isTauri } from './llm';
import { readDataFile, writeDataFile } from './dataFile';

export interface Shortcuts {
  listNext: string;
  listPrev: string;
  listOpen: string;
  listStar: string;
  listTranslate: string;
  listRefresh: string;
  detailBack: string;
  detailTranslate: string;
  detailTranslateAll: string;
  detailDigest: string;
}

export const DEFAULT_SHORTCUTS: Shortcuts = {
  listNext: 'j',
  listPrev: 'k',
  listOpen: 'o',
  listStar: 's',
  listTranslate: 't',
  listRefresh: 'r',
  detailBack: 'u',
  detailTranslate: 't',
  detailTranslateAll: 'T',
  detailDigest: 'd',
};

export interface Settings {
  uiLang: 'zh' | 'en';
  theme: 'light' | 'dark' | 'auto';
  translateTarget: string; // 'zh' | 'zh-TW' | 'ja' | 'ko' | 'en'
  fontScale: number; // 0.9 / 1.0 / 1.1 / 1.25
  llm: LLMConfig | null;
  providerId: string; // preset id, '' when unset
  hostedStatus: HostedStatus | null; // cached activation/quota state
  shortcuts: Shortcuts;
  autoTranslateOnScroll: boolean;
  autoTranslateTitles: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  uiLang: 'zh',
  theme: 'auto',
  translateTarget: 'zh',
  fontScale: 1.0,
  llm: null,
  providerId: '',
  hostedStatus: null,
  shortcuts: DEFAULT_SHORTCUTS,
  autoTranslateOnScroll: false,
  autoTranslateTitles: true,
};

function merge(raw: Partial<Settings> | null | undefined): Settings {
  return { ...DEFAULT_SETTINGS, ...raw, shortcuts: { ...DEFAULT_SHORTCUTS, ...(raw?.shortcuts ?? {}) } };
}

export async function loadSettings(): Promise<Settings> {
  if (isTauri()) {
    // File is the source of truth in packaged builds.
    const fromFile = await readDataFile<Partial<Settings>>('settings');
    if (fromFile) return merge(fromFile);
    // First run after this migration: adopt whatever IndexedDB still has.
    const saved = await kvGet<Partial<Settings>>('meta', 'settings');
    const merged = merge(saved);
    if (saved) void writeDataFile('settings', merged);
    return merged;
  }
  const saved = await kvGet<Partial<Settings>>('meta', 'settings');
  return merge(saved);
}

export async function saveSettings(s: Settings): Promise<void> {
  if (isTauri()) {
    await writeDataFile('settings', s);
    void kvSet('meta', 'settings', s); // best effort, dev convenience
    return;
  }
  await kvSet('meta', 'settings', s);
}
