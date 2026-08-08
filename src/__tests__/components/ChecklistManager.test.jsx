// showConfirm resolves to the user's answer and takes no callback argument
// (see useModalState). ChecklistManager originally passed a callback, so the
// dialog opened, "Proceed" did nothing, and the delete silently never ran.
// These tests pin both branches of that contract.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const deleteChecklist = vi.fn().mockResolvedValue(undefined);
const saveChecklist = vi.fn();
const listChecklistSources = vi.fn().mockResolvedValue([]);

vi.mock('../../services/checklistService', () => ({
  checklistService: {
    deleteChecklist: (...args) => deleteChecklist(...args),
    saveChecklist: (...args) => saveChecklist(...args),
    listChecklistSources: (...args) => listChecklistSources(...args),
  },
}));

const refresh = vi.fn().mockResolvedValue(undefined);

const CHECKLIST = {
  id: 'cl-1',
  teamId: 't1',
  seasonId: '2025-26',
  title: 'Preseason Setup',
  isPublished: true,
  items: [
    {
      key: 'uniform',
      label: 'Order uniform',
      description: '',
      type: 'check',
      url: '',
      audience: 'parent',
      required: true,
      requiresVerification: false,
      dueDate: null,
    },
  ],
};

vi.mock('../../hooks/useChecklist', () => ({
  useChecklist: () => ({
    checklist: CHECKLIST,
    setChecklist: vi.fn(),
    responses: [],
    responsesByPlayer: {},
    loading: false,
    error: null,
    refresh,
    saveResponse: vi.fn(),
    setVerification: vi.fn(),
  }),
}));

import { I18nProvider } from '../../i18n/I18nContext';
import ChecklistManager from '../../views/team/ChecklistManager';

function renderManager({ showConfirm, showToast = vi.fn() }) {
  return render(
    <I18nProvider>
      <ChecklistManager
        players={[{ id: 'p1', firstName: 'Ada', lastName: 'Lovelace' }]}
        teamId="t1"
        teamName="U12 Boys"
        seasonId="2025-26"
        seasonLabel="2025-26"
        user={{ id: 'u1' }}
        showToast={showToast}
        showConfirm={showConfirm}
        canManage
      />
    </I18nProvider>,
  );
}

describe('ChecklistManager delete', () => {
  beforeEach(() => {
    deleteChecklist.mockClear();
    refresh.mockClear();
  });

  it('deletes the checklist when the confirm dialog resolves true', async () => {
    const user = userEvent.setup();
    const showConfirm = vi.fn().mockResolvedValue(true);
    const showToast = vi.fn();
    renderManager({ showConfirm, showToast });

    await user.click(screen.getByRole('button', { name: /delete checklist/i }));

    // One argument only — a second callback argument would be dropped on the floor.
    expect(showConfirm).toHaveBeenCalledTimes(1);
    expect(showConfirm.mock.calls[0]).toHaveLength(1);

    await waitFor(() => expect(deleteChecklist).toHaveBeenCalledWith('cl-1'));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(showToast).toHaveBeenCalledWith('Checklist deleted');
  });

  it('does not delete when the confirm dialog is dismissed', async () => {
    const user = userEvent.setup();
    const showConfirm = vi.fn().mockResolvedValue(false);
    renderManager({ showConfirm });

    await user.click(screen.getByRole('button', { name: /delete checklist/i }));

    await waitFor(() => expect(showConfirm).toHaveBeenCalled());
    expect(deleteChecklist).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('surfaces a failed delete instead of reporting success', async () => {
    const user = userEvent.setup();
    deleteChecklist.mockRejectedValueOnce(new Error('permission denied'));
    const showToast = vi.fn();
    renderManager({ showConfirm: vi.fn().mockResolvedValue(true), showToast });

    await user.click(screen.getByRole('button', { name: /delete checklist/i }));

    await waitFor(() => expect(showToast).toHaveBeenCalledWith('Could not save: permission denied', true));
    expect(showToast).not.toHaveBeenCalledWith('Checklist deleted');
  });
});
