// Packaged Glaze uses GLZ1 (no local /api HTTP server). The desktop
// opener must use the shared transport adapter and must never turn a
// backend URL rejection into an unguarded WebView navigation.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiPost, hasBackend } from '@hackdigest/core';
import { openExternal } from '../src/lib/hooks';

vi.mock('@hackdigest/core', () => ({
  apiPost: vi.fn(),
  hasBackend: vi.fn(),
}));

describe('desktop external links', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal('fetch', vi.fn());
    vi.spyOn(window, 'open').mockImplementation(() => null);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('uses the Glaze transport adapter in packaged/native mode', async () => {
    vi.mocked(hasBackend).mockResolvedValue(true);
    vi.mocked(apiPost).mockResolvedValue({ ok: true });

    await openExternal('https://example.org/story');

    expect(apiPost).toHaveBeenCalledExactlyOnceWith('/api/open', {
      url: 'https://example.org/story',
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(window.open).not.toHaveBeenCalled();
  });

  it('does not bypass a backend refusal with window.open', async () => {
    vi.mocked(hasBackend).mockResolvedValue(true);
    vi.mocked(apiPost).mockRejectedValue(new Error('only http(s) urls'));

    await expect(openExternal('javascript:alert(1)')).rejects.toThrow(
      'only http(s) urls'
    );

    expect(window.open).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('uses the browser opener only when no backend is available', async () => {
    vi.mocked(hasBackend).mockResolvedValue(false);

    await openExternal('https://example.org/story');

    expect(apiPost).not.toHaveBeenCalled();
    expect(window.open).toHaveBeenCalledExactlyOnceWith(
      'https://example.org/story',
      '_blank',
      'noopener,noreferrer'
    );
  });
});
