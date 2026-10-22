import { describe, it, expect, beforeEach } from 'vitest';
import { rememberPage, tabTarget, resetNavMemory } from '../../utils/navMemory';

const money = {
  id: 'money',
  to: '/finance/budget',
  items: [{ id: 'finance/budget' }, { id: 'finance/ledger' }],
};

describe('tabTarget', () => {
  beforeEach(() => resetNavMemory());

  it('opens the first page of a destination never visited', () => {
    expect(tabTarget(money, 'home')).toBe('/finance/budget');
  });

  it('returns to the page the destination was left on', () => {
    rememberPage('money', 'finance/ledger');
    expect(tabTarget(money, 'home')).toBe('/finance/ledger');
  });

  it('goes back to the first page when tapping the tab you are on', () => {
    rememberPage('money', 'finance/ledger');
    expect(tabTarget(money, 'money')).toBe('/finance/budget');
  });

  it('forgets a remembered page the user can no longer reach', () => {
    rememberPage('money', 'finance/book-balance');
    expect(tabTarget(money, 'home')).toBe('/finance/budget');
  });
});
