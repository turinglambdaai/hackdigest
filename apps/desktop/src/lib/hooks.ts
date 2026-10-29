// Shared hooks: external link opening, async state.

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiPost, hasBackend } from '@hackdigest/core';

export async function openExternal(url: string): Promise<void> {
  if (await hasBackend()) {
    // Packaged Glaze apps use native GLZ1, not a loopback /api server.
    // Preserve backend URL policy: a rejected opener request must not
    // bypass the Racket guard via window.open in the WebView.
    await apiPost('/api/open', { url });
    return;
  }
  // Browser-only frontend development, with no Glaze backend.
  window.open(url, '_blank', 'noopener,noreferrer');
}

export interface Async<T> {
  data: T | null;
  error: Error | null;
  loading: boolean;
  reload: () => void;
}

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): Async<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    fnRef
      .current()
      .then((d) => alive && (setData(d), setLoading(false)))
      .catch((e: Error) => alive && (setError(e), setLoading(false)));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, reload };
}

/** Intersection-based infinite scroll sentinel. */
export function useSentinel(onHit: () => void, enabled: boolean) {
  const ref = useRef<HTMLDivElement | null>(null);
  const cbRef = useRef(onHit);
  cbRef.current = onHit;
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) cbRef.current();
      },
      { rootMargin: '600px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [enabled]);
  return ref;
}
