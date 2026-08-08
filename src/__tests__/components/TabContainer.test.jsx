import { describe, it, expect } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TabContainer from '../../components/TabContainer';

// Callers build the tab array inline, so it is a new identity on every render.
// The harness below reproduces that plus an unrelated re-render of the parent.
function Harness({ defaultTab = 'roster' }) {
  const [, setTick] = useState(0);
  const tabs = [
    { id: 'roster', label: 'Roster' },
    { id: 'documents', label: 'Documents' },
    { id: 'checklist', label: 'Checklist' },
  ];

  return (
    <div>
      <button onClick={() => setTick((n) => n + 1)}>re-render</button>
      <TabContainer tabs={tabs} defaultTab={defaultTab}>
        {(activeTab) => <p>active: {activeTab}</p>}
      </TabContainer>
    </div>
  );
}

describe('TabContainer', () => {
  it('opens on the default tab', () => {
    render(<Harness />);
    expect(screen.getByText('active: roster')).toBeInTheDocument();
  });

  it('switches when a tab is clicked', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Checklist' }));
    expect(screen.getByText('active: checklist')).toBeInTheDocument();
  });

  it('keeps the selected tab when the parent re-renders', async () => {
    // Regression: the defaultTab sync effect listed `tabs` as a dependency, so a
    // new array identity on any parent re-render (a toast after saving, say)
    // reset the user back to the default tab.
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: 'Checklist' }));
    await user.click(screen.getByRole('button', { name: 're-render' }));

    expect(screen.getByText('active: checklist')).toBeInTheDocument();
  });

  it('still follows an actual defaultTab change', () => {
    const { rerender } = render(<Harness defaultTab="roster" />);
    rerender(<Harness defaultTab="documents" />);
    expect(screen.getByText('active: documents')).toBeInTheDocument();
  });

  it('falls back to the first tab when the default is not available', () => {
    render(
      <TabContainer tabs={[{ id: 'documents', label: 'Documents' }]} defaultTab="roster">
        {(activeTab) => <p>active: {activeTab}</p>}
      </TabContainer>,
    );
    expect(screen.getByText('active: documents')).toBeInTheDocument();
  });
});
