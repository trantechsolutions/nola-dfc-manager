import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { I18nProvider } from '../i18n/I18nContext';
import SponsorsView from '../views/team/SponsorsView';

const baseProps = {
  transactions: [],
  selectedSeason: 's1',
  formatMoney: (n) => `$${n}`,
  onDistribute: vi.fn(),
  onReset: vi.fn(),
  seasonalPlayers: [],
  seasons: [{ id: 's1', isFinalized: false }],
  currentSeasonData: { isFinalized: false },
  distributionMethod: 'waterfall',
  onSetDistributionMethod: vi.fn(),
};

function renderView() {
  return render(
    <I18nProvider>
      <SponsorsView {...baseProps} />
    </I18nProvider>,
  );
}

describe('SponsorsView i18n wiring', () => {
  beforeEach(async () => {
    localStorage.clear();
    const i18n = (await import('../i18n/config')).default;
    await act(async () => {
      await i18n.changeLanguage('en');
    });
  });

  it('renders English strings from the sponsors namespace', () => {
    renderView();
    expect(screen.getByText('Distribution Method')).toBeInTheDocument();
    expect(screen.getByText('Pending Distributions')).toBeInTheDocument();
    // Method card label resolved via sponsors.methods.waterfall.label
    expect(screen.getAllByText('Waterfall').length).toBeGreaterThan(0);
    expect(screen.getByText('All sponsorship funds have been distributed.')).toBeInTheDocument();
  });

  it('swaps to Spanish when the locale changes (no hardcoded English left)', async () => {
    renderView();
    const i18n = (await import('../i18n/config')).default;
    await act(async () => {
      await i18n.changeLanguage('es');
    });
    expect(screen.getByText('Método de distribución')).toBeInTheDocument();
    expect(screen.getByText('Distribuciones pendientes')).toBeInTheDocument();
    expect(screen.getAllByText('Cascada').length).toBeGreaterThan(0);
    expect(screen.getByText('Todos los fondos de patrocinio han sido distribuidos.')).toBeInTheDocument();
    // The old hardcoded English must be gone.
    expect(screen.queryByText('Distribution Method')).not.toBeInTheDocument();
  });
});
