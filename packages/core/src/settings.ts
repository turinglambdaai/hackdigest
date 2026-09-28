// App settings persisted in IndexedDB ('meta' store), mirrored to a JSON
// file in the OS app-config dir when running under Tauri — IndexedDB has
// been observed wiped by WebView2 updates, so the file is the durable copy
// and IndexedDB is the fast path.

import type { LLMConfig } from './llm';
import type { HostedStatus } from './hosted';
import { kvGet, kvSet } from './store';
import { isTauri } from './llm';

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

async function readSettingsFile(): Promise<Partial<Settings> | null> {
  if (!isTauri()) return null;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const json = await invoke<string | null>('read_settings_file');
    return json ? (JSON.parse(json) as Partial<Settings>) : null;
  } catch {
    return null;
  }
}

async function writeSettingsFile(s: Settings): Promise<void> {
  if (!isTauri()) return;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('write_settings_file', { json: JSON.stringify(s) });
  } catch {
    /* file is a mirror; IndexedDB remains the primary store */
  }
}

export async function loadSettings(): Promise<Settings> {
  const saved = await kvGet<Partial<Settings>>('meta', 'settings');
  if (saved && (saved.llm || saved.providerId)) {
    return { ...DEFAULT_SETTINGS, ...saved };
  }
  // IndexedDB empty/wiped → recover from the filesystem mirror.
  const fromFile = await readSettingsFile();
  if (fromFile && (fromFile.llm || fromFile.providerId)) {
    const merged = { ...DEFAULT_SETTINGS, ...fromFile };
    await kvSet('meta', 'settings', merged);
    return merged;
  }
  return DEFAULT_SETTINGS;
}

export async function saveSettings(s: Settings): Promise<void> {
  await kvSet('meta', 'settings', s);
  void writeSettingsFile(s);
}
