// OpenAI-compatible chat via the Glaze backend. The backend owns the HTTP
// call (and the API key, and the retry table: 400/422 json-mode fallback,
// 429 patient retry — see backend/llm.rkt); the page only relays configs
// and renders deltas. Works with any /v1/chat/completions endpoint:
// OpenAI, GLM, DeepSeek, Qwen (dashscope compatible-mode), Kimi, Ollama...

import { apiPost, streamChat } from './bridge';

export interface LLMConfig {
  baseUrl: string; // e.g. https://api.deepseek.com/v1
  apiKey: string;
  model: string;
}

export interface ChatMsg {
  role: 'system' | 'user' | 'assistant';
  content: string;
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

function asLLMError(e: unknown): LLMError {
  if (e instanceof LLMError) return e;
  const err = e as Error;
  return new LLMError(err?.message ?? String(e));
}

export async function chat(cfg: LLMConfig, msgs: ChatMsg[], opts: ChatOptions = {}): Promise<string> {
  const body = {
    cfg: { baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, model: cfg.model },
    msgs: msgs.map((m) => ({ role: m.role, content: m.content })),
    opts: {
      jsonMode: opts.jsonMode ?? false,
      maxTokens: opts.maxTokens ?? null,
      temperature: opts.temperature ?? 0.3,
    },
  };
  try {
    if (opts.onDelta) {
      return await streamChat('/api/llm/chat/stream', body, opts.onDelta, opts.signal);
    }
    const { content } = await apiPost<{ content: string }>('/api/llm/chat', body);
    return content;
  } catch (e) {
    if (opts.signal?.aborted) throw e;
    throw asLLMError(e);
  }
}

/** Quick connectivity + auth check for the settings page. */
export async function testLLM(cfg: LLMConfig): Promise<void> {
  try {
    await apiPost('/api/llm/test', {
      cfg: { baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, model: cfg.model },
    });
  } catch (e) {
    throw asLLMError(e);
  }
}
