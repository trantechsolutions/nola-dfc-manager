import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { swCacheService } from '../../services/swCacheService';

// ── Harness ───────────────────────────────────────────────────────────────────

const originalServiceWorker = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker');

/**
 * Installs a navigator.serviceWorker stub whose controller optionally replies to
 * the purge message over the transferred MessagePort.
 */
function setController({ present = true, reply = 'PURGE_DATA_CACHES_DONE', throws = false } = {}) {
  const postMessage = vi.fn((message, transfer) => {
    if (throws) throw new Error('postMessage failed');
    if (!reply) return;
    const port = transfer?.[0];
    // The worker replies asynchronously, exactly as a real SW would.
    setTimeout(() => port?.postMessage({ type: reply }), 0);
  });

  Object.defineProperty(navigator, 'serviceWorker', {
    value: { controller: present ? { postMessage } : null },
    configurable: true,
    writable: true,
  });

  return postMessage;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  if (originalServiceWorker) {
    Object.defineProperty(navigator, 'serviceWorker', originalServiceWorker);
  } else {
    delete navigator.serviceWorker;
  }
  vi.restoreAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('swCacheService.purgeDataCaches', () => {
  it('messages the active worker and resolves true on acknowledgement', async () => {
    const postMessage = setController();

    const pending = swCacheService.purgeDataCaches();
    await vi.advanceTimersByTimeAsync(0);

    expect(postMessage).toHaveBeenCalledWith({ type: 'PURGE_DATA_CACHES' }, [expect.anything()]);
    await expect(pending).resolves.toBe(true);
  });

  it('resolves false when no worker controls the page', async () => {
    setController({ present: false });
    await expect(swCacheService.purgeDataCaches()).resolves.toBe(false);
  });

  it('resolves false rather than hanging when the worker never replies', async () => {
    setController({ reply: null });

    const pending = swCacheService.purgeDataCaches();
    await vi.advanceTimersByTimeAsync(2000);

    await expect(pending).resolves.toBe(false);
  });

  it('resolves false on an unexpected reply type', async () => {
    setController({ reply: 'SOMETHING_ELSE' });

    const pending = swCacheService.purgeDataCaches();
    await vi.advanceTimersByTimeAsync(0);

    await expect(pending).resolves.toBe(false);
  });

  it('swallows a postMessage failure so sign-out is never blocked', async () => {
    setController({ throws: true });
    await expect(swCacheService.purgeDataCaches()).resolves.toBe(false);
  });

  it('resolves false when the browser has no service worker support', async () => {
    delete navigator.serviceWorker;
    await expect(swCacheService.purgeDataCaches()).resolves.toBe(false);
  });

  it('settles exactly once when a reply arrives before the timeout', async () => {
    setController();

    const pending = swCacheService.purgeDataCaches();
    await vi.advanceTimersByTimeAsync(0);
    await expect(pending).resolves.toBe(true);

    // Advancing past the timeout must not flip the already-settled result.
    await vi.advanceTimersByTimeAsync(5000);
    await expect(pending).resolves.toBe(true);
  });
});
