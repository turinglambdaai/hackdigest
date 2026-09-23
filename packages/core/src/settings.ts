// App settings persisted in IndexedDB ('meta' store).

import type { LLMConfig } from './llm';
import type { HostedStatus } from './hosted';
import { kvGet, kvSet } from './store';

export interface Settings {
  uiLang: 'zh' | 'en';
  theme: 'light' | 'dark' | 'auto';
  translateTarget: string; // 'zh' | 'zh-TW' | 'ja' | 'ko' | 'en'
  fontScale: number; // 0.9 / 1.0 / 1.1 / 1.25
  llm: LLMConfig | null;
  providerId: string; // preset id, '' when unset
  hostedStatus: HostedStatus | null; // cached activation/quota state
}

export const DEFAULT_SETTINGS: Settings = {
  uiLang: 'zh',
  theme: 'auto',
  translateTarget: 'zh',
  fontScale: 1.0,
  llm: null,
  providerId: '',
  hostedStatus: null,
};

export async function loadSettings(): Promise<Settings> {
  const saved = await kvGet<Partial<Settings>>('meta', 'settings');
  return { ...DEFAULT_SETTINGS, ...saved };
}

export async function saveSettings(s: Settings): Promise<void> {
  await kvSet('meta', 'settings', s);
}
