// Bridge to the Glaze Racket backend.
//
// Two transports behind one interface:
//  - native: the page runs on the controlled glaze:// origin; calls ride
//    the GLZ1 message handler (window.__glz1, injected at document start
//    by the native bootstrap). No TCP port exists in production.
//  - http: the page is served by the loopback server (vite dev, the HTTP
//    adapter) and talks plain relative fetch; /api/health probes for the
//    backend, and without one callers fall back to IndexedDB /
//    window.open, matching the old isTauri() branches.
//
// Streaming routes keep their line protocol on both transports (first
// line `OK` or `ERR <status> <message>`, then raw text or ndjson lines):
// the native channel delivers the handler's bytes verbatim as chunk
// frames, so one parser serves both.

type OnDelta = (text: string) => void;

interface Glz1 {
  invoke(
    path: string,
    args?: unknown,
    opts?: { method?: string; timeoutMs?: number }
  ): Promise<unknown>;
  invokeStream(
    path: string,
    args?: unknown,
    opts?: { method?: string; onDelta?: OnDelta; signal?: AbortSignal }
  ): Promise<string>;
}

declare global {
  interface Window {
    __glz1?: Glz1;
  }
}

function nativeBridge(): Glz1 | null {
  return (typeof window !== 'undefined' && window.__glz1) || null;
}

let probe: Promise<boolean> | null = null;

/** True once a backend answers — native bridge present, or /api/health ok. Memoized per session. */
export function hasBackend(): Promise<boolean> {
  if (!probe) {
    const g = nativeBridge();
    probe = g
      ? Promise.resolve(true)
      : fetch('/api/health', { method: 'GET' })
          .then((r) => r.ok)
          .catch(() => false);
  }
  return probe;
}

// Both the native and HTTP adapters must share the same JSON error policy.
async function readJsonResponse<T>(res: Response): Promise<T> {
  const json = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok) {
    throw new Error(json?.error ?? `${res.status} ${res.statusText}`);
  }
  return json as T;
}

/** GET JSON via native GLZ1 or the explicit HTTP development adapter. */
export async function apiGet<T>(path: string): Promise<T> {
  const g = nativeBridge();
  if (g) {
    return (await g.invoke(path, {}, { method: 'GET' })) as T;
  }
  return readJsonResponse<T>(await fetch(path, { method: 'GET' }));
}

/** POST JSON to the backend; returns the parsed response or null (JSON null). */
export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const g = nativeBridge();
  if (g) {
    return (await g.invoke(path, body ?? {}, { method: 'POST' })) as T;
  }
  return readJsonResponse<T>(await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  }));
}

// The streaming line protocol shared by both transports. Errors cannot
// throw out of the onDelta callback (the native bootstrap swallows
// callback exceptions by design), so the parser records the error and the
// caller raises it after the stream settles.
class LineStreamParser {
  private buf = '';
  private statusDone = false;
  error: Error | null = null;

  constructor(
    private readonly mode: 'text' | 'lines',
    private readonly onItem: OnDelta
  ) {}

  push(chunk: string): void {
    if (this.error) return;
    this.buf += chunk;
    if (!this.statusDone) {
      const nl = this.buf.indexOf('\n');
      if (nl === -1) return;
      const status = this.buf.slice(0, nl);
      this.buf = this.buf.slice(nl + 1);
      this.statusDone = true;
      if (status.startsWith('ERR')) {
        const msg = status.slice(3).trim();
        const m = msg.match(/^(\d+)\s?(.*)$/);
        this.error = new Error(m && m[2] ? m[2] : msg || 'request failed');
        return;
      }
    }
    if (this.mode === 'text') {
      if (this.buf) {
        this.onItem(this.buf);
        this.buf = '';
      }
      return;
    }
    for (;;) {
      const nl = this.buf.indexOf('\n');
      if (nl === -1) break;
      const line = this.buf.slice(0, nl).trim();
      this.buf = this.buf.slice(nl + 1);
      if (line) this.onItem(line);
    }
  }

  /** Data held back past the last chunk; throws if no status line ever arrived. */
  finish(): string {
    if (!this.statusDone) throw new Error('stream ended before status line');
    const tail = this.buf;
    this.buf = '';
    return tail;
  }
}

function deliverTail(p: LineStreamParser, mode: 'text' | 'lines', onItem: OnDelta): void {
  const tail = p.finish();
  const last = mode === 'text' ? tail : tail.trim();
  if (last) onItem(last);
}

// Native transport: chunk frames carry the handler's bytes verbatim; the
// parser reconstructs the same line protocol the HTTP body has.
async function invokeNativeStream(
  path: string,
  body: unknown,
  mode: 'text' | 'lines',
  onItem: OnDelta,
  signal?: AbortSignal
): Promise<string> {
  const g = nativeBridge();
  if (!g) throw new Error('native bridge unavailable');
  const items: string[] = [];
  const p = new LineStreamParser(mode, (t) => {
    items.push(t);
    onItem(t);
  });
  try {
    await g.invokeStream(path, body, {
      method: 'POST',
      onDelta: (d) => p.push(d),
      signal,
    });
    deliverTail(p, mode, (t) => {
      items.push(t);
      onItem(t);
    });
    if (p.error) throw p.error;
    return items.join('');
  } catch (e) {
    throw p.error ?? e;
  }
}

// HTTP transport: a fetch reader feeds the same parser with body chunks.
async function fetchStream(
  path: string,
  body: unknown,
  mode: 'text' | 'lines',
  onItem: OnDelta,
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
  const items: string[] = [];
  const p = new LineStreamParser(mode, (t) => {
    items.push(t);
    onItem(t);
  });
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    p.push(decoder.decode(value, { stream: true }));
    if (p.error) throw p.error;
  }
  deliverTail(p, mode, (t) => {
    items.push(t);
    onItem(t);
  });
  if (p.error) throw p.error;
  return items.join('');
}

/**
 * Streamed chat: first line is `OK` or `ERR <status> <message>`, then raw
 * text deltas. Passes each delta to onDelta as it arrives and returns the
 * full text. The AbortSignal cancels the stream (the backend sees the
 * stream cancelled and stops writing).
 */
export function streamChat(
  path: string,
  body: unknown,
  onDelta: OnDelta,
  signal?: AbortSignal
): Promise<string> {
  const g = nativeBridge();
  return g
    ? invokeNativeStream(path, body, 'text', onDelta, signal)
    : fetchStream(path, body, 'text', onDelta, signal);
}

/**
 * Stream a POST endpoint that answers ndjson: first line `OK` or
 * `ERR <status> <message>`, then one JSON object per line. onLine fires as
 * each complete line arrives.
 */
export async function streamLines(
  path: string,
  body: unknown,
  onLine: (line: string) => void,
  signal?: AbortSignal
): Promise<void> {
  const g = nativeBridge();
  if (g) {
    await invokeNativeStream(path, body, 'lines', onLine, signal);
    return;
  }
  await fetchStream(path, body, 'lines', onLine, signal);
}
