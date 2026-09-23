// Global UI + settings + translation-session state (zustand).

import { create } from 'zustand';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings } from '@hackdigest/core';

export type View =
  | { type: 'feed'; feed: 'top' | 'new' | 'best' | 'ask' | 'show' | 'job' }
  | { type: 'story'; id: number }
  | { type: 'search'; query: string }
  | { type: 'bookmarks' }
  | { type: 'daily' }
  | { type: 'settings' };

interface UIState {
  view: View;
  stack: View[];
  navigate: (v: View) => void;
  back: () => void;
}

export const useUI = create<UIState>((set, get) => ({
  view: { type: 'feed', feed: 'top' },
  stack: [],
  navigate: (v) => set({ stack: [...get().stack, get().view], view: v }),
  back: () => {
    const stack = get().stack;
    if (stack.length === 0) return;
    set({ view: stack[stack.length - 1], stack: stack.slice(0, -1) });
  },
}));

interface SettingsState {
  settings: Settings;
  loaded: boolean;
  init: () => Promise<void>;
  patch: (p: Partial<Settings>) => void;
}

export const useSettings = create<SettingsState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  loaded: false,
  init: async () => {
    const s = await loadSettings();
    set({ settings: s, loaded: true });
  },
  patch: (p) => {
    const next = { ...get().settings, ...p };
    set({ settings: next });
    void saveSettings(next);
  },
}));

export interface TransEntry {
  title?: string;
  text?: string;
}

interface TransState {
  map: Record<number, TransEntry>;
  put: (id: number, t: TransEntry) => void;
  clear: () => void;
}

export const useTrans = create<TransState>((set) => ({
  map: {},
  put: (id, t) => set((s) => ({ map: { ...s.map, [id]: { ...s.map[id], ...t } } })),
  clear: () => set({ map: {} }),
}));

/** Theme handling: apply .dark class + font scale to <html>. */
export function applyChrome(settings: Settings) {
  const root = document.documentElement;
  const dark =
    settings.theme === 'dark' ||
    (settings.theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  root.classList.toggle('dark', dark);
  root.style.fontSize = `${16 * settings.fontScale}px`;
  root.lang = settings.uiLang === 'zh' ? 'zh-CN' : 'en';
}
