// Minimal global toast — replaces blocking alert() dialogs.

import { useEffect } from 'react';
import { create } from 'zustand';

export interface ToastItem {
  id: number;
  kind: 'info' | 'error';
  message: string;
}

interface ToastState {
  toasts: ToastItem[];
  push: (message: string, kind?: ToastItem['kind']) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useToast = create<ToastState>((set) => ({
  toasts: [],
  push: (message, kind = 'info') => {
    const id = nextId++;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, kind, message }] }));
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export const toast = {
  info: (m: string) => useToast.getState().push(m, 'info'),
  error: (m: string) => useToast.getState().push(m, 'error'),
};

export default function ToastHost() {
  const toasts = useToast((s) => s.toasts);
  const dismiss = useToast((s) => s.dismiss);

  useEffect(() => {
    if (toasts.length === 0) return;
    const timers = toasts.map((t) => window.setTimeout(() => dismiss(t.id), t.kind === 'error' ? 8000 : 4000));
    return () => timers.forEach(clearTimeout);
  }, [toasts, dismiss]);

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-80 flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto rounded-xl border px-4 py-3 text-xs shadow-lg backdrop-blur ${
            t.kind === 'error'
              ? 'border-red-300/50 bg-red-50/95 text-red-800 dark:border-red-500/30 dark:bg-red-950/90 dark:text-red-200'
              : 'border-line bg-surface/95 text-ink'
          }`}
        >
          <div className="flex items-start gap-2">
            <span className="flex-1 leading-relaxed break-words">{t.message}</span>
            <button className="shrink-0 text-mute hover:text-ink" onClick={() => dismiss(t.id)}>
              ✕
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
