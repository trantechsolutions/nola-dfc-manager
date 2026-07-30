import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockUseOutbox = vi.fn();
vi.mock('../../hooks/useOutbox', () => ({
  useOutbox: () => mockUseOutbox(),
}));

import { I18nProvider } from '../../i18n/I18nContext';
import OutboxIndicator from '../../components/OutboxIndicator';

// ── Harness ───────────────────────────────────────────────────────────────────

const flush = vi.fn();

function setOutbox({ pendingCount = 0, isFlushing = false } = {}) {
  mockUseOutbox.mockReturnValue({ pendingCount, isFlushing, flush, refresh: vi.fn() });
}

const renderIndicator = () =>
  render(
    <I18nProvider>
      <OutboxIndicator />
    </I18nProvider>,
  );

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('OutboxIndicator', () => {
  it('renders nothing when the queue is empty', () => {
    setOutbox({ pendingCount: 0 });

    const { container } = renderIndicator();

    expect(container).toBeEmptyDOMElement();
  });

  it('reports how many changes are waiting', () => {
    setOutbox({ pendingCount: 3 });

    renderIndicator();

    expect(screen.getByRole('button')).toHaveTextContent('3');
  });

  it('shows a syncing state while the queue is draining', () => {
    setOutbox({ pendingCount: 2, isFlushing: true });

    renderIndicator();

    expect(screen.getByRole('button')).toHaveTextContent(/syncing/i);
  });

  it('disables the control mid-flush so it cannot be double-triggered', () => {
    setOutbox({ pendingCount: 2, isFlushing: true });

    renderIndicator();

    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('retries the flush when tapped', async () => {
    setOutbox({ pendingCount: 1 });

    renderIndicator();
    await userEvent.click(screen.getByRole('button'));

    await waitFor(() => expect(flush).toHaveBeenCalledTimes(1));
  });

  it('stays visible while entries remain, so a pending write is never mistaken for a saved one', () => {
    setOutbox({ pendingCount: 1 });

    renderIndicator();

    expect(screen.getByRole('button')).toBeVisible();
  });
});
