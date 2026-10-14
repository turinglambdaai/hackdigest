// Bridge dual-transport tests: the native (__glz1) path and the plain
// fetch path must expose the same semantics — apiPost returns the value,
// streamChat/streamLines parse the OK/ERR line protocol, and an ERR line
// throws the backend's message on both transports.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiPost, hasBackend, streamChat, streamLines } from '../src/bridge';

// A __glz1 double: invokes resolve with the handler's value; streams run
// the handler (which fires onDelta per chunk) and resolve with its return
// value — the same shape the real channel gives the bridge.
function nativeBridge(handlers: {
  invoke?: (path: string, args: unknown) => unknown;
  stream?: (path: string, args: unknown, onDelta: (t: string) => void) => string;
}) {
  (window as unknown as { __glz1?: unknown }).__glz1 = {
    invoke: (path: string, args: unknown) => Promise.resolve(handlers.invoke?.(path, args)),
    invokeStream: (path: string, args: unknown, opts?: { onDelta?: (t: string) => void }) => {
      const full = handlers.stream?.(path, args, (t) => opts?.onDelta?.(t)) ?? '';
      return Promise.resolve(full);
    },
  };
}

describe('bridge: http transport', () => {
  beforeEach(() => {
    delete (window as unknown as { __glz1?: unknown }).__glz1;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('hasBackend probes /api/health', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true })));
    expect(await hasBackend()).toBe(true);
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe('/api/health');
  });

  it('apiPost throws the backend error message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => ({ error: 'boom' }),
      }))
    );
    await expect(apiPost('/api/x', {})).rejects.toThrow('boom');
  });

  it('streamChat fires onDelta across fetch chunks and returns the full text', async () => {
    const chunks = [new TextEncoder().encode('OK\nHel'), new TextEncoder().encode('lo')];
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        body: {
          getReader: () => ({
            read: async () =>
              chunks.length ? { done: false, value: chunks.shift()! } : { done: true, value: undefined },
          }),
        },
      }))
    );
    const deltas: string[] = [];
    const full = await streamChat('/api/llm/chat/stream', {}, (t) => deltas.push(t));
    expect(full).toBe('Hello');
    expect(deltas.join('')).toBe('Hello');
  });

  it('streamChat throws the ERR-line message on the http path', async () => {
    const chunks = [new TextEncoder().encode('ERR 500 key bad\n')];
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        body: {
          getReader: () => ({
            read: async () =>
              chunks.length ? { done: false, value: chunks.shift()! } : { done: true, value: undefined },
          }),
        },
      }))
    );
    await expect(streamChat('/api/llm/chat/stream', {}, () => {})).rejects.toThrow('key bad');
  });

  it('streamLines fires per line even when lines split across chunks', async () => {
    const chunks = [
      new TextEncoder().encode('OK\n{"a"'),
      new TextEncoder().encode(':1}\n{"a":2}'),
      new TextEncoder().encode('\n'),
    ];
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        body: {
          getReader: () => ({
            read: async () =>
              chunks.length ? { done: false, value: chunks.shift()! } : { done: true, value: undefined },
          }),
        },
      }))
    );
    const lines: string[] = [];
    await streamLines('/api/translate/story', {}, (l) => lines.push(l));
    expect(lines).toEqual(['{"a":1}', '{"a":2}']);
  });
});

describe('bridge: native transport', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });
  afterEach(() => {
    delete (window as unknown as { __glz1?: unknown }).__glz1;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('hasBackend is true when __glz1 is present', async () => {
    nativeBridge({});
    expect(await hasBackend()).toBe(true);
  });

  it('apiPost resolves the invoke value', async () => {
    nativeBridge({ invoke: () => ({ pong: true }) });
    expect(await apiPost<{ pong: boolean }>('/api/kv/get', { key: 'x' })).toEqual({ pong: true });
  });

  it('apiPost propagates backend errors as Error', async () => {
    nativeBridge({
      invoke: () => {
        throw new Error('not found');
      },
    });
    await expect(apiPost('/api/nope', {})).rejects.toThrow('not found');
  });

  it('streamChat fires onDelta per chunk and returns the full text', async () => {
    const deltas: string[] = [];
    nativeBridge({
      stream: (_p, _a, onDelta) => {
        onDelta('OK\n');
        onDelta('Hel');
        onDelta('lo');
        return 'OK\nHello';
      },
    });
    const full = await streamChat('/api/llm/chat/stream', {}, (t) => deltas.push(t));
    expect(full).toBe('Hello');
    expect(deltas.join('')).toBe('Hello');
  });

  it('streamChat throws the ERR-line message on the native path', async () => {
    nativeBridge({
      stream: (_p, _a, onDelta) => {
        onDelta('ERR 429 rate limited\n');
        return 'ERR 429 rate limited\n';
      },
    });
    await expect(streamChat('/api/llm/chat/stream', {}, () => {})).rejects.toThrow('rate limited');
  });

  it('streamLines fires per complete line on the native path', async () => {
    const lines: string[] = [];
    nativeBridge({
      stream: (_p, _a, onDelta) => {
        onDelta('OK\n{"a":1}\n{"a":2}\n');
        return 'OK\n{"a":1}\n{"a":2}\n';
      },
    });
    await streamLines('/api/translate/story', {}, (l) => lines.push(l));
    expect(lines).toEqual(['{"a":1}', '{"a":2}']);
  });

  it('streamLines throws when the stream ends before a status line', async () => {
    nativeBridge({ stream: () => 'no status here' });
    await expect(streamLines('/api/x', {}, () => {})).rejects.toThrow('status line');
  });
});

