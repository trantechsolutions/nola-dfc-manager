// The admin side used to carry three hardcoded switches (medical release,
// ReePlayer waiver, club registration). Compliance is the season checklist now,
// so this panel renders whatever the team authored and follows the same
// staff-can-act rules as the roster matrix.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const applyCellState = vi.fn().mockResolvedValue(undefined);
vi.mock('../../services/checklistService', () => ({
  checklistService: { applyCellState: (...args) => applyCellState(...args) },
}));

import { I18nProvider } from '../../i18n/I18nContext';
import PlayerCompliancePanel from '../../components/PlayerCompliancePanel';
import { buildCompliance } from '../../utils/compliance';
import { CHECKLIST_FORMS } from '../../utils/checklist';

const SEASON = '2025-26';
const PLAYER = { id: 'p1', firstName: 'Ada', lastName: 'Lovelace', seasonProfiles: { [SEASON]: {} } };

const item = (key, label, overrides = {}) => ({
  key,
  label,
  type: 'check',
  audience: 'parent',
  required: true,
  requiresVerification: false,
  ...overrides,
});

function renderPanel({ items, responses = [], player = PLAYER, canManage = true, onOpenMedicalForm }) {
  const compliance = buildCompliance({ items, responses, players: [player], seasonId: SEASON });
  render(
    <I18nProvider>
      <PlayerCompliancePanel
        player={player}
        compliance={compliance}
        checklistId="cl-1"
        canManage={canManage}
        user={{ id: 'u1' }}
        showToast={vi.fn()}
        onChanged={vi.fn()}
        onOpenMedicalForm={onOpenMedicalForm}
      />
    </I18nProvider>,
  );
  return compliance;
}

describe('PlayerCompliancePanel', () => {
  beforeEach(() => applyCellState.mockClear());

  it("renders the team's authored items, not three fixed rows", () => {
    renderPanel({ items: [item('uniform', 'Order uniform'), item('fees', 'Pay fees')] });
    expect(screen.getByText('Order uniform')).toBeInTheDocument();
    expect(screen.getByText('Pay fees')).toBeInTheDocument();
    expect(screen.queryByText(/ReePlayer/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Club Registration/i)).not.toBeInTheDocument();
  });

  it('says so when the season has no checklist', () => {
    renderPanel({ items: [] });
    expect(screen.getByText('No checklist for this season yet')).toBeInTheDocument();
  });

  it('writes a cycled state through the shared service helper', async () => {
    const user = userEvent.setup();
    renderPanel({ items: [item('uniform', 'Order uniform')] });

    await user.click(screen.getByRole('button', { name: 'Not done' }));

    await waitFor(() => expect(applyCellState).toHaveBeenCalledTimes(1));
    expect(applyCellState.mock.calls[0][0]).toMatchObject({
      checklistId: 'cl-1',
      playerId: 'p1',
      itemKey: 'uniform',
      next: { completed: true, verified: false },
    });
  });

  it('does not write when the viewer cannot manage the checklist', async () => {
    const user = userEvent.setup();
    renderPanel({ items: [item('uniform', 'Order uniform')], canManage: false });

    await user.click(screen.getByRole('button', { name: 'Not done' }));
    expect(applyCellState).not.toHaveBeenCalled();
  });

  it('refuses to let staff tick a text item the parent must answer', async () => {
    const user = userEvent.setup();
    renderPanel({ items: [item('size', 'Shirt size', { type: 'text' })] });

    expect(screen.getByText('Only the parent can answer this one')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Not done' }));
    expect(applyCellState).not.toHaveBeenCalled();
  });

  it('offers the form launcher for a linked medical item instead of a tick', async () => {
    const user = userEvent.setup();
    const onOpenMedicalForm = vi.fn();
    renderPanel({
      items: [item('med', 'Medical Release', { linkedForm: CHECKLIST_FORMS.MEDICAL_RELEASE })],
      onOpenMedicalForm,
    });

    await user.click(screen.getByRole('button', { name: /open form/i }));
    expect(onOpenMedicalForm).toHaveBeenCalled();
    // The status control stays inert — the form is what completes this item.
    expect(applyCellState).not.toHaveBeenCalled();
  });

  it('reads a linked medical item as complete from the season flag alone', () => {
    const done = { ...PLAYER, seasonProfiles: { [SEASON]: { medicalRelease: true } } };
    renderPanel({
      items: [item('med', 'Medical Release', { linkedForm: CHECKLIST_FORMS.MEDICAL_RELEASE })],
      player: done,
      responses: [],
      onOpenMedicalForm: vi.fn(),
    });
    expect(screen.getByRole('button', { name: 'Complete' })).toBeInTheDocument();
  });

  it('lets staff sign off an item awaiting confirmation', async () => {
    const user = userEvent.setup();
    renderPanel({
      items: [item('kit', 'Kit handed out', { requiresVerification: true })],
      responses: [{ playerId: 'p1', itemKey: 'kit', completed: true }],
    });

    await user.click(screen.getByRole('button', { name: 'Awaiting staff confirmation' }));

    await waitFor(() => expect(applyCellState).toHaveBeenCalled());
    expect(applyCellState.mock.calls[0][0].next).toEqual({ completed: true, verified: true });
  });
});
