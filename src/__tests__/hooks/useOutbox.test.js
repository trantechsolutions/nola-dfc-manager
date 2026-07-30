import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

vi.mock('../../services/outboxService', () => ({
  outbox: {
    count: vi.fn(),
    flush: vi.fn(),
  },
}));

import { outbox } from '../../services/outboxService';
import { useOutbox } from '../../hooks/useOutbox';

// ── Harness ───────────────────────────────────────────────────────────────────

const originalOnLine = Object.getOwnPropertyDescriptor(window.Navigator.prototype, 'onLine');

function setOnline(value) {
  Object.defineProperty(navigator, 'onLine', { value, configurable: true });
}

function setVisibility(state) {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
}

beforeEach(() => {
  vi.clearAllMocks();
  setOnline(true);
  setVisibility('visible');
  outbox.count.mockResolvedValue(0);
  outbox.flush.mockResolvedValue({ replayed: 0, failed: 0, dropped: 0, skipped: false });
});

afterEach(() => {
  if (originalOnLine) Object.defineProperty(window.Navigator.prototype, 'onLine', originalOnLine);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useOutbox', () => {
  it('reports the pending count on mount', async () => {
    outbox.count.mockResolvedValue(3);

    const { result } = renderHook(() => useOutbox());

    await waitFor(() => expect(result.current.pendingCount).toBe(3));
  });

  it('drains anything left over from a previous session on mount', async () => {
    renderHook(() => useOutbox());
    await waitFor(() => expect(outbox.flush).toHaveBeenCalled());
  });

  it('flushes when connectivity returns', async () => {
    renderHook(() => useOutbox());
    await waitFor(() => expect(outbox.flush).toHaveBeenCalledTimes(1));

    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });

    await waitFor(() => expect(outbox.flush).toHaveBeenCalledTimes(2));
  });

  it('flushes when the app is brought back to the foreground', async () => {
    renderHook(() => useOutbox());
    await waitFor(() => expect(outbox.flush).toHaveBeenCalledTimes(1));

    await act(async () => {
      setVisibility('visible');
      document.dispatchEvent(new Event('visibilitychange'));
    });

    await waitFor(() => expect(outbox.flush).toHaveBeenCalledTimes(2));
  });

  it('does not flush when the app is merely being hidden', async () => {
    renderHook(() => useOutbox());
    await waitFor(() => expect(outbox.flush).toHaveBeenCalledTimes(1));

    await act(async () => {
      setVisibility('hidden');
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(outbox.flush).toHaveBeenCalledTimes(1);
  });

  it('does not attempt a flush while offline', async () => {
    setOnline(false);

    renderHook(() => useOutbox());
    await waitFor(() => expect(outbox.count).toHaveBeenCalled());

    expect(outbox.flush).not.toHaveBeenCalled();
  });

  it('refreshes the pending count after a flush', async () => {
    outbox.count.mockResolvedValueOnce(2).mockResolvedValue(0);

    const { result } = renderHook(() => useOutbox());

    await waitFor(() => expect(result.current.pendingCount).toBe(0));
  });

  it('clears the flushing flag even when the flush rejects', async () => {
    outbox.flush.mockRejectedValue(new Error('flush exploded'));

    const { result } = renderHook(() => useOutbox());

    await waitFor(() => expect(result.current.isFlushing).toBe(false));
  });

  it('detaches its listeners on unmount', async () => {
    const windowSpy = vi.spyOn(window, 'removeEventListener');
    const docSpy = vi.spyOn(document, 'removeEventListener');

    const { unmount } = renderHook(() => useOutbox());
    await waitFor(() => expect(outbox.flush).toHaveBeenCalled());
    unmount();

    expect(windowSpy).toHaveBeenCalledWith('online', expect.any(Function));
    expect(docSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
  });
});
