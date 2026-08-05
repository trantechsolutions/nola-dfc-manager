// DirectoryCard is the single template behind the users, players and teams
// pages — if it drifts, all four drift together. These pin the contract each
// page relies on: header controls, column heads with sort state, the footer
// range, and the row helpers.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import DirectoryCard, { DetailRow, EmptyRow } from '../../components/layout/DirectoryCard';

const COLUMNS = [
  { key: 'name', label: 'Name' },
  { key: 'email', label: 'Email', className: 'hidden md:table-cell' },
  { key: 'actions', label: 'Actions', align: 'right' },
];

function renderCard(props = {}, children = null) {
  return render(
    <DirectoryCard
      title="User Directory"
      columns={COLUMNS}
      noun="user"
      page={1}
      pageCount={1}
      total={1}
      from={1}
      to={1}
      {...props}
    >
      {children ?? (
        <tr>
          <td>Ada</td>
          <td>ada@example.com</td>
          <td />
        </tr>
      )}
    </DirectoryCard>,
  );
}

describe('DirectoryCard', () => {
  it('renders the title, column heads and a row', () => {
    renderCard();
    expect(screen.getByText('User Directory')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Name' })).toBeInTheDocument();
    expect(screen.getByText('Ada')).toBeInTheDocument();
  });

  it('states the range and pluralises the noun', () => {
    renderCard({ total: 42, from: 11, to: 20 });
    expect(screen.getByText('Showing 11 to 20 of 42 users')).toBeInTheDocument();
  });

  it('uses the singular noun for a single result', () => {
    renderCard({ total: 1, from: 1, to: 1 });
    expect(screen.getByText('Showing 1 to 1 of 1 user')).toBeInTheDocument();
  });

  it('reports an empty list as a zero range, not "1 to 0"', () => {
    renderCard({ total: 0, from: 0, to: 0 });
    expect(screen.getByText('Showing 0 to 0 of 0 users')).toBeInTheDocument();
  });

  it('hides pagination at a single page and shows it beyond one', () => {
    const { unmount } = renderCard({ pageCount: 1 });
    expect(screen.queryByRole('navigation', { name: 'Pagination' })).not.toBeInTheDocument();
    unmount();

    renderCard({ pageCount: 4 });
    expect(screen.getByRole('navigation', { name: 'Pagination' })).toBeInTheDocument();
  });

  it('carries a column className onto its header so a column can hide responsively', () => {
    renderCard();
    expect(screen.getByRole('columnheader', { name: 'Email' })).toHaveClass('hidden', 'md:table-cell');
  });

  it('exposes sort state through aria-sort and fires onSort', async () => {
    const onSort = vi.fn();
    const user = userEvent.setup();
    renderCard({
      columns: [{ key: 'name', label: 'Name', sortable: true, sortDir: 'asc', onSort }, ...COLUMNS.slice(1)],
    });

    const header = screen.getByRole('columnheader', { name: /name/i });
    expect(header).toHaveAttribute('aria-sort', 'ascending');

    await user.click(within(header).getByRole('button'));
    expect(onSort).toHaveBeenCalled();
  });

  it('marks an unsorted sortable column as aria-sort="none"', () => {
    renderCard({
      columns: [{ key: 'name', label: 'Name', sortable: true, sortDir: null, onSort: vi.fn() }, ...COLUMNS.slice(1)],
    });
    expect(screen.getByRole('columnheader', { name: /name/i })).toHaveAttribute('aria-sort', 'none');
  });

  it('renders toolbar and prepend content', () => {
    renderCard({
      toolbar: <button type="button">Add user</button>,
      prepend: <p>Inline form</p>,
    });
    expect(screen.getByRole('button', { name: 'Add user' })).toBeInTheDocument();
    expect(screen.getByText('Inline form')).toBeInTheDocument();
  });

  it('spans EmptyRow and DetailRow across every column', () => {
    const { unmount } = renderCard({}, <EmptyRow colSpan={COLUMNS.length}>Nothing here</EmptyRow>);
    expect(screen.getByText('Nothing here').closest('td')).toHaveAttribute('colspan', '3');
    unmount();

    renderCard({}, <DetailRow colSpan={COLUMNS.length}>Detail panel</DetailRow>);
    expect(screen.getByText('Detail panel').closest('td')).toHaveAttribute('colspan', '3');
  });
});
