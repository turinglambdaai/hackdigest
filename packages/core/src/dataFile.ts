// Durable JSON data files via Rust (app-config dir). The source of truth in
// packaged builds — IndexedDB there has proven non-persistent. Falls back
// to null/no-op in plain browsers (dev mode keeps using IndexedDB).

import { isTauri } from './llm';

export type DataFileName = 'settings' | 'library';

export async function readDataFile<T>(name: DataFileName): Promise<T | null> {
  if (!isTauri()) return null;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const json = await invoke<string | null>('read_data_file', { name });
    return json ? (JSON.parse(json) as T) : null;
  } catch {
    return null;
  }
}

export async function writeDataFile(name: DataFileName, data: unknown): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('write_data_file', { name, json: JSON.stringify(data) });
    return true;
  } catch {
    return false;
  }
}
