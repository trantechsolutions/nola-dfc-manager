import { describe, it, expect } from 'vitest';
import { roleLabel } from '../../utils/roleLabel';

describe('roleLabel', () => {
  const t = (key, fallback) => ({ 'roles.teamManager': 'Team Manager' })[key] ?? fallback;

  it('reads the translated name for a known role', () => {
    expect(roleLabel('team_manager', t)).toBe('Team Manager');
  });

  it('falls back to a readable form of an unknown role', () => {
    expect(roleLabel('kit_coordinator', t)).toBe('Kit coordinator');
  });

  it('is empty without a role', () => {
    expect(roleLabel(null, t)).toBe('');
  });
});
