// Client for the HackDigest hosted service (Phase 2): license activation,
// free trials, and quota status. The chat path itself needs nothing new —
// the service speaks the OpenAI protocol, so core's LLMConfig points at it.

import { kvGet, kvSet } from './store';

export const HOSTED_BASE_URL = 'https://hd.jrtx.site/v1';

export interface HostedStatus {
  plan: 'trial' | 'pro' | 'lifetime';
  expiresAt: number | null;
  used: number;
  limit: number;
  day?: string;
}

/** Stable per-install device id (used for trials and device binding). */
export async function getDeviceId(): Promise<string> {
  const existing = await kvGet<string>('meta', 'deviceId');
  if (existing) return existing;
  const id = (crypto.randomUUID?.() ?? `dev-${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/-/g, '');
  await kvSet('meta', 'deviceId', id);
  return id;
}

async function post<T>(path: string, body: unknown, key?: string): Promise<T> {
  const res = await fetch(`${HOSTED_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(key ? { Authorization: `Bearer ${key}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const j = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!res.ok) throw new Error(j?.error?.message ?? `${res.status} ${res.statusText}`);
  return j;
}

export async function activateLicense(key: string): Promise<HostedStatus> {
  const deviceId = await getDeviceId();
  return post<HostedStatus>('/license/activate', { key, deviceId });
}

export async function startTrial(): Promise<{ key: string } & HostedStatus> {
  const deviceId = await getDeviceId();
  return post('/license/trial', { deviceId });
}

export async function fetchQuota(key: string): Promise<HostedStatus> {
  const res = await fetch(`${HOSTED_BASE_URL}/quota`, { headers: { Authorization: `Bearer ${key}` } });
  const j = (await res.json().catch(() => ({}))) as HostedStatus & { error?: { message?: string } };
  if (!res.ok) throw new Error(j?.error?.message ?? `${res.status} ${res.statusText}`);
  return j;
}
