import { describe, it, expect } from 'vitest';
import { contrast, teamPalette, DEFAULT_TEAM_COLOR } from '../../utils/teamColor';

describe('teamPalette', () => {
  it('keeps a dark team colour as-is on the light theme', () => {
    expect(teamPalette('#1e293b').light).toBe('#1e293b');
  });

  it('darkens a light team colour until it reads on white', () => {
    const p = teamPalette('#ffd700');
    expect(contrast(p.light, '#ffffff')).toBeGreaterThanOrEqual(4.5);
    expect(p.baseFg).not.toBe('#ffffff');
  });

  it('lightens a dark team colour until it reads on the dark surface', () => {
    const p = teamPalette('#1e293b');
    expect(contrast(p.dark, '#1a201d')).toBeGreaterThanOrEqual(4.5);
  });

  it('gives every fill a foreground that holds AA', () => {
    for (const hex of ['#ffffff', '#ffd700', '#0dcaf0', '#dc3545', '#000000', '#1e293b']) {
      const p = teamPalette(hex);
      expect(contrast(p.light, p.lightFg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(p.dark, p.darkFg)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('falls back to the default for a missing or malformed colour', () => {
    expect(teamPalette(null).base).toBe(DEFAULT_TEAM_COLOR);
    expect(teamPalette('not-a-colour').base).toBe(DEFAULT_TEAM_COLOR);
    expect(teamPalette('#abc').base).toBe('#aabbcc');
  });
});

describe('teamPalette edges and dark fills', () => {
  it('outlines a team colour that would vanish into a white page', () => {
    expect(teamPalette('#ffffff').edgeLight).not.toBe('#ffffff');
    expect(teamPalette('#fdfbf0').edgeLight).not.toBe('#fdfbf0');
  });

  it('uses the fill itself as the edge when it already stands out', () => {
    expect(teamPalette('#0a7c3e').edgeLight).toBe('#0a7c3e');
  });

  it('dims the dark-theme fill toward the surface, keeping a readable foreground', () => {
    const p = teamPalette('#ffd700');
    expect(p.fillDark).not.toBe(p.base);
    expect(contrast(p.fillDark, p.fillDarkFg)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('teamPalette accent for a white kit', () => {
  it('borrows the default accent rather than darkening white into grey', () => {
    expect(teamPalette('#ffffff').light).toBe(teamPalette(DEFAULT_TEAM_COLOR).light);
    expect(teamPalette('#ffffff').base).toBe('#ffffff');
  });
});
