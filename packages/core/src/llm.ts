// OpenAI-compatible chat client. Works with any /v1/chat/completions endpoint:
// OpenAI, GLM, DeepSeek, Qwen (dashscope compatible-mode), Kimi, Ollama, ...
//
// In the Tauri webview we swap in @tauri-apps/plugin-http's fetch (no CORS);
// in a plain browser we fall back to global fetch (dev mode).

export interface LLMConfig {
  baseUrl: string; // e.g. https://api.deepseek.com/v1
  apiKey: string;
  model: string;
}

export interface ChatMsg {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

type FetchLike = typeof fetch;

let tauriFetch: FetchLike | null = null;
let tauriProbed = false;

async function smartFetch(): Promise<FetchLike> {
  if (!tauriProbed) {
    tauriProbed = true;
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      try {
        const mod = await import('@tauri-apps/plugin-http');
        tauriFetch = mod.fetch as FetchLike;
      } catch {
        tauriFetch = null;
      }
    }
  }
  return tauriFetch ?? fetch;
}

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export class LLMError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
  }
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
  signal?: AbortSignal;
  /** When provided, the response is streamed and deltas are passed through. */
  onDelta?: (text: string) => void;
}

export async function chat(cfg: LLMConfig, msgs: ChatMsg[], opts: ChatOptions = {}): Promise<string> {
  try {
    return await chatOnce(cfg, msgs, opts, true);
  } catch (e) {
    // Some OpenAI-compatible endpoints reject response_format with 400/422.
    // The prompts already demand JSON-only output, so retry without it.
    if (e instanceof LLMError && (e.status === 400 || e.status === 422) && opts.jsonMode) {
      return await chatOnce(cfg, msgs, opts, false);
    }
    // Rate-limited (common on free tiers): one patient retry.
    if (e instanceof LLMError && e.status === 429) {
      await new Promise((r) => setTimeout(r, 3000));
      return await chatOnce(cfg, msgs, opts, true);
    }
    // Timeout (our 60s guard) — user cancels pass through untouched.
    if (e instanceof Error && /timed? ?out|abort/i.test(e.message) && !opts.signal?.aborted) {
      throw new LLMError('请求超时（60 秒）—— 模型无响应，可尝试换一个模型或服务商');
    }
    throw e;
  }
}

/** Combined abort: the caller's signal OR a 60s request timeout. */
function withTimeout(signal: AbortSignal | undefined, ms = 60000): { signal: AbortSignal; cancel: () => void } {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(new Error('request timed out')), ms);
  const onAbort = () => ac.abort(signal?.reason);
  signal?.addEventListener('abort', onAbort, { once: true });
  return { signal: ac.signal, cancel: () => (clearTimeout(timer), signal?.removeEventListener('abort', onAbort)) };
}

async function chatOnce(
  cfg: LLMConfig,
  msgs: ChatMsg[],
  opts: ChatOptions,
  withJsonFormat: boolean
): Promise<string> {
  const f = await smartFetch();
  const url = `${cfg.baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const body: Record<string, unknown> = {
    model: cfg.model,
    messages: msgs,
    temperature: opts.temperature ?? 0.3,
  };
  if (opts.maxTokens) body.max_tokens = opts.maxTokens;
  if (opts.jsonMode && withJsonFormat) body.response_format = { type: 'json_object' };
  if (opts.onDelta) body.stream = true;

  const { signal, cancel } = withTimeout(opts.signal);
  let res: Response;
  try {
    res = await f(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify(body),
      signal,
    });
  } finally {
    cancel();
  }

  if (!res.ok) {
    let detail = '';
    try {
      const j = await res.json();
      detail = j?.error?.message ?? JSON.stringify(j);
    } catch {
      /* ignore */
    }
    throw new LLMError(`${res.status} ${res.statusText}${detail ? ` — ${detail}` : ''}`, res.status);
  }

  if (!opts.onDelta || !res.body) {
    const j = await res.json();
    return j?.choices?.[0]?.message?.content ?? '';
  }

  // Stream SSE deltas.
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let full = '';
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      const s = line.trim();
      if (!s.startsWith('data:')) continue;
      const data = s.slice(5).trim();
      if (data === '[DONE]') continue;
      try {
        const j = JSON.parse(data);
        const delta: string = j?.choices?.[0]?.delta?.content ?? '';
        if (delta) {
          full += delta;
          opts.onDelta(delta);
        }
      } catch {
        /* partial line, skip */
      }
    }
  }
  return full;
}

/** Quick connectivity + auth check for the settings page. */
export async function testLLM(cfg: LLMConfig): Promise<void> {
  const f = await smartFetch();
  const res = await f(`${cfg.baseUrl.replace(/\/+$/, '')}/models`, {
    headers: { Authorization: `Bearer ${cfg.apiKey}` },
  });
  if (!res.ok) throw new LLMError(`${res.status} ${res.statusText}`, res.status);
}
