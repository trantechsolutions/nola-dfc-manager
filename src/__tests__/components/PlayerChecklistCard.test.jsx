// A parent looking at their checklist should never have to count green pills to
// work out whether anything is left. These pin the all-clear messaging, and the
// distinction between "everything required is done" and "literally nothing left".
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

let mockChecklist = null;
let mockResponses = {};

vi.mock('../../hooks/useChecklist', () => ({
  useChecklist: () => ({
    checklist: mockChecklist,
    setChecklist: vi.fn(),
    responses: [],
    responsesByPlayer: { p1: mockResponses },
    loading: false,
    error: null,
    refresh: vi.fn(),
    runBatch: vi.fn(),
    saveResponse: vi.fn(),
    setVerification: vi.fn(),
  }),
}));

import { I18nProvider } from '../../i18n/I18nContext';
import PlayerChecklistCard from '../../components/PlayerChecklistCard';

const SEASON = '2025-26';
const PLAYER = { id: 'p1', firstName: 'Ada', lastName: 'Lovelace', teamId: 't1', seasonProfiles: { [SEASON]: {} } };

const item = (key, label, overrides = {}) => ({
  key,
  label,
  description: '',
  type: 'check',
  url: '',
  audience: 'parent',
  required: true,
  requiresVerification: false,
  dueDate: null,
  linkedForm: null,
  ...overrides,
});

function renderCard({ items, responses = {} }) {
  mockChecklist = { id: 'cl-1', title: 'Preseason', items, isPublished: true };
  mockResponses = responses;
  return render(
    <I18nProvider>
      <PlayerChecklistCard
        player={PLAYER}
        teamId="t1"
        seasonId={SEASON}
        clubId="c1"
        user={{ id: 'u1' }}
        showToast={vi.fn()}
        onRefresh={vi.fn()}
      />
    </I18nProvider>,
  );
}

describe('PlayerChecklistCard completion messaging', () => {
  beforeEach(() => {
    mockChecklist = null;
    mockResponses = {};
  });

  it('says nothing is outstanding when every item is done', () => {
    renderCard({
      items: [item('a', 'Order uniform'), item('b', 'Pay fees')],
      responses: { a: { completed: true }, b: { completed: true } },
    });
    expect(screen.getByText('All done — nothing outstanding.')).toBeInTheDocument();
  });

  it('distinguishes required-done from truly-done when optionals remain', () => {
    // `complete` counts required items only. Saying "nothing outstanding" here
    // would contradict the unticked optional row rendered right below it.
    renderCard({
      items: [item('a', 'Order uniform'), item('b', 'Team photo', { required: false })],
      responses: { a: { completed: true } },
    });
    expect(screen.getByText('Everything required is done — the rest is optional.')).toBeInTheDocument();
    expect(screen.queryByText('All done — nothing outstanding.')).not.toBeInTheDocument();
  });

  it('shows no all-clear banner while work remains', () => {
    renderCard({ items: [item('a', 'Order uniform')], responses: {} });
    expect(screen.queryByText(/All done/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Everything required is done/)).not.toBeInTheDocument();
  });

  it('reports 100% when the required work is finished', () => {
    renderCard({ items: [item('a', 'Order uniform')], responses: { a: { completed: true } } });
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('explains itself when the team has published no checklist', () => {
    renderCard({ items: [] });
    expect(
      screen.getByText('Your team manager has not published a checklist for this season yet.'),
    ).toBeInTheDocument();
  });
});
