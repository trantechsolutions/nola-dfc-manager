import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';

import { usePanelRoute } from '../../hooks/usePanelRoute';

/** Opens a panel from somewhere other than the component that closes it — the
 *  mobile FAB's arrangement, where AppRoutes renders and dismisses the panel. */
function Opener() {
  const { openPanel } = usePanelRoute();
  return <button onClick={() => openPanel('tx')}>FAB new tx</button>;
}

/** A list view that opens two panels and reports the location back to the test. */
function Harness() {
  const { panel, panelParams, openPanel, replacePanel, closePanel } = usePanelRoute();
  const location = useLocation();
  // MemoryRouter keeps its own stack, so a hardware Back press has to be
  // driven through the router rather than through window.history.
  const navigate = useNavigate();

  return (
    <div>
      <p data-testid="search">{location.search}</p>
      <p data-testid="panel">{panel ?? 'none'}</p>
      <p data-testid="params">{JSON.stringify(panelParams)}</p>

      <button onClick={() => openPanel('tx', { id: '8f21' })}>Edit tx</button>
      <button onClick={() => openPanel('tx', { eventId: '4a2', amount: '125.00' })}>New tx from event</button>
      <button onClick={() => replacePanel('player', { id: 'p2' })}>Swap to player 2</button>
      <button onClick={closePanel}>Close</button>
      <button onClick={() => navigate(-1)}>Hardware back</button>
      <Opener />
    </div>
  );
}

const renderAt = (entry = '/finance/ledger') =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/finance/ledger" element={<Harness />} />
      </Routes>
    </MemoryRouter>,
  );

describe('usePanelRoute', () => {
  it('reports no panel on a bare URL', () => {
    renderAt();
    expect(screen.getByTestId('panel')).toHaveTextContent('none');
  });

  it('opens a panel by putting it in the URL', async () => {
    const user = userEvent.setup();
    renderAt();

    await user.click(screen.getByRole('button', { name: 'Edit tx' }));

    expect(screen.getByTestId('panel')).toHaveTextContent('tx');
    expect(screen.getByTestId('search')).toHaveTextContent('panel=tx&panel.id=8f21');
  });

  it('carries prefill params a bare id could not express', async () => {
    const user = userEvent.setup();
    renderAt();

    await user.click(screen.getByRole('button', { name: 'New tx from event' }));

    expect(JSON.parse(screen.getByTestId('params').textContent)).toEqual({
      eventId: '4a2',
      amount: '125.00',
    });
  });

  // The whole point of routing the panels: the URL alone is enough to restore
  // one, which is what makes a reload or a shared link work.
  it('opens straight from a URL it was never navigated to', () => {
    renderAt('/finance/ledger?panel=tx&panel.id=8f21');

    expect(screen.getByTestId('panel')).toHaveTextContent('tx');
    expect(JSON.parse(screen.getByTestId('params').textContent)).toEqual({ id: '8f21' });
  });

  it('preserves the view’s own params when a panel opens and closes', async () => {
    const user = userEvent.setup();
    renderAt('/finance/ledger?tab=ledger');

    await user.click(screen.getByRole('button', { name: 'Edit tx' }));
    expect(screen.getByTestId('search')).toHaveTextContent('tab=ledger');

    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.getByTestId('search')).toHaveTextContent('?tab=ledger');
    expect(screen.getByTestId('panel')).toHaveTextContent('none');
  });

  it('closes a panel it opened', async () => {
    const user = userEvent.setup();
    renderAt();

    await user.click(screen.getByRole('button', { name: 'Edit tx' }));
    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(screen.getByTestId('panel')).toHaveTextContent('none');
  });

  // Closing has to rewind the entry opening pushed. Replacing it instead would
  // leave it on the stack, and the next Back press would re-open the panel the
  // user just dismissed.
  it('does not leave a closed panel one Back press away', async () => {
    const user = userEvent.setup();
    renderAt();

    await user.click(screen.getByRole('button', { name: 'Edit tx' }));
    await user.click(screen.getByRole('button', { name: 'Close' }));

    await user.click(screen.getByRole('button', { name: 'Hardware back' }));

    expect(screen.getByTestId('panel')).toHaveTextContent('none');
  });

  // Arrived at directly, there is no entry of ours to rewind — going back would
  // leave the app rather than close the panel.
  it('closes a panel it arrived on without navigating away', async () => {
    const user = userEvent.setup();
    renderAt('/finance/ledger?panel=tx&panel.id=8f21');

    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(screen.getByTestId('panel')).toHaveTextContent('none');
    expect(screen.getByTestId('search')).toHaveTextContent('');
  });

  it('hands Back the job of closing a panel it opened', async () => {
    const user = userEvent.setup();
    renderAt();

    await user.click(screen.getByRole('button', { name: 'Edit tx' }));
    expect(screen.getByTestId('panel')).toHaveTextContent('tx');

    await user.click(screen.getByRole('button', { name: 'Hardware back' }));

    expect(screen.getByTestId('panel')).toHaveTextContent('none');
  });

  // The FAB opens the panel; AppRoutes closes it. Tracked per component, that
  // close would not know an entry had been pushed, and would leave the panel
  // one Back press from re-appearing.
  it('rewinds a push made by a different component', async () => {
    const user = userEvent.setup();
    renderAt();

    await user.click(screen.getByRole('button', { name: 'FAB new tx' }));
    expect(screen.getByTestId('panel')).toHaveTextContent('tx');

    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.getByTestId('panel')).toHaveTextContent('none');

    await user.click(screen.getByRole('button', { name: 'Hardware back' }));
    expect(screen.getByTestId('panel')).toHaveTextContent('none');
  });

  // Stepping between records inside a picker should not stack an entry per
  // step, or Back walks through every one of them on the way out.
  it('swaps panels without stacking history when replacing', async () => {
    const user = userEvent.setup();
    renderAt();

    await user.click(screen.getByRole('button', { name: 'Edit tx' }));
    await user.click(screen.getByRole('button', { name: 'Swap to player 2' }));
    expect(screen.getByTestId('panel')).toHaveTextContent('player');

    await user.click(screen.getByRole('button', { name: 'Hardware back' }));

    expect(screen.getByTestId('panel')).toHaveTextContent('none');
  });
});
