import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import EventRsvp from '../../components/EventRsvp';
import { I18nProvider } from '../../i18n/I18nContext';

const maya = { id: 'p1', firstName: 'Maya', lastName: 'Thompson' };

function renderRsvp(props) {
  return render(
    <I18nProvider>
      <EventRsvp {...props} />
    </I18nProvider>,
  );
}

describe('EventRsvp', () => {
  it('gives a guardian three icon answers and says whose answer it is', () => {
    const onChange = vi.fn().mockResolvedValue();
    renderRsvp({ mine: [maya], onChange });
    expect(screen.getByText('For Maya')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Maybe' }));
    expect(onChange).toHaveBeenCalledWith('p1', 'maybe', null);
  });

  it('clears the answer when the current one is tapped again', () => {
    const onChange = vi.fn().mockResolvedValue();
    renderRsvp({ mine: [maya], rsvps: [{ playerId: 'p1', status: 'going' }], onChange });
    const going = screen.getByRole('button', { name: 'Going' });
    expect(going).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(going);
    expect(onChange).toHaveBeenCalledWith('p1', null, null);
  });

  it('offers an optional reason under a decline and saves it when the field is left', () => {
    const onChange = vi.fn().mockResolvedValue();
    renderRsvp({ mine: [maya], rsvps: [{ playerId: 'p1', status: 'no', note: null }], onChange });
    const reason = screen.getByPlaceholderText('Reason (optional)');
    fireEvent.change(reason, { target: { value: 'Out of town' } });
    fireEvent.blur(reason);
    expect(onChange).toHaveBeenCalledWith('p1', 'no', 'Out of town');
  });

  it('shows a past answer and its reason without letting it change', () => {
    renderRsvp({
      mine: [maya],
      rsvps: [{ playerId: 'p1', status: 'no', note: 'Sick' }],
      readOnly: true,
      onChange: vi.fn(),
    });
    expect(screen.getByRole('button', { name: "Can't go" })).toBeDisabled();
    expect(screen.getByText('Sick')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Reason (optional)')).not.toBeInTheDocument();
  });

  it('drops the "For" label for a player answering for themselves', () => {
    renderRsvp({ mine: [{ ...maya, isSelf: true }], onChange: vi.fn() });
    expect(screen.queryByText('For Maya')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Going' })).toBeInTheDocument();
  });
});
