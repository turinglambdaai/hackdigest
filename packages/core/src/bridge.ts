// Bridge to the Glaze Racket backend (replaces the Tauri IPC layer).
// The page is served by the same local server, so plain relative fetch
// reaches /api/*; the api-token rides an HttpOnly cookie set by glaze's
// one-time bootstrap. With no backend (plain-browser dev via vite), the
// probe fails and callers fall back to IndexedDB / window.open, matching
// the old isTauri() branches.

let probe: Promise<boolean> | null = null;

/** True once the Glaze backend answers /api/health. Memoized per session. */
export function hasBackend(): Promise<boolean> {
  if (!probe) {
    probe = fetch('/api/health', { method: 'GET' })
      .then((r) => r.ok)
      .catch(() => false);
  }
  return probe;
}

/** POST JSON to the backend; returns the parsed response or null (JSON null). */
export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  const json = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok) {
    throw new Error(json?.error ?? `${res.status} ${res.statusText}`);
  }
  return json as T;
}

/**
 * Streamed chat: first line is `OK` or `ERR <status> <message>`, then raw
 * text deltas. Passes each delta to onDelta as it arrives and returns the
 * full text. The AbortSignal cancels the fetch (the backend sees the socket
 * drop and stops writing).
 */
export async function streamChat(
  path: string,
  body: unknown,
  onDelta: (text: string) => void,
  signal?: AbortSignal
): Promise<string> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText}${detail ? ` — ${detail}` : ''}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let full = '';
  let statusDone = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    if (!statusDone) {
      const nl = buf.indexOf('\n');
      if (nl === -1) continue;
      const status = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      statusDone = true;
      if (status.startsWith('ERR')) {
        const msg = status.slice(3).trim();
        const m = msg.match(/^(\d+)\s?(.*)$/);
        throw new Error(m && m[2] ? m[2] : msg || 'LLM request failed');
      }
    }
    if (buf) {
      full += buf;
      onDelta(buf);
      buf = '';
    }
  }
  if (buf) {
    full += buf;
    onDelta(buf);
  }
  if (!statusDone) throw new Error('stream ended before status line');
  return full;
}
