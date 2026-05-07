import { describe, it, expect } from 'vitest';
import { HOLDINGS, HOLDING_LABELS, HOLDING_COLORS, TRACKED_HOLDINGS } from '../../utils/holdings';

describe('HOLDINGS', () => {
  it('contains exactly four buckets', () => {
    expect(HOLDINGS).toHaveLength(4);
  });

  it('contains the expected bucket names', () => {
    expect(HOLDINGS).toContain('digital');
    expect(HOLDINGS).toContain('bank');
    expect(HOLDINGS).toContain('cash');
    expect(HOLDINGS).toContain('none');
  });
});

describe('HOLDING_LABELS', () => {
  it('has a label for every holding bucket', () => {
    HOLDINGS.forEach((h) => {
      expect(HOLDING_LABELS).toHaveProperty(h);
      expect(typeof HOLDING_LABELS[h]).toBe('string');
      expect(HOLDING_LABELS[h].length).toBeGreaterThan(0);
    });
  });

  it('"none" is labelled as Uncategorized', () => {
    expect(HOLDING_LABELS.none).toBe('Uncategorized');
  });
});

describe('HOLDING_COLORS', () => {
  const requiredKeys = ['bg', 'text', 'border', 'icon'];

  it('has a color definition for every holding bucket', () => {
    HOLDINGS.forEach((h) => {
      expect(HOLDING_COLORS).toHaveProperty(h);
    });
  });

  it('each color definition has bg, text, border, icon keys', () => {
    HOLDINGS.forEach((h) => {
      requiredKeys.forEach((key) => {
        expect(HOLDING_COLORS[h]).toHaveProperty(key);
        expect(typeof HOLDING_COLORS[h][key]).toBe('string');
      });
    });
  });

  it('dark-mode variants are present in bg and text strings', () => {
    HOLDINGS.forEach((h) => {
      expect(HOLDING_COLORS[h].bg).toMatch(/dark:/);
      expect(HOLDING_COLORS[h].text).toMatch(/dark:/);
    });
  });
});

describe('TRACKED_HOLDINGS', () => {
  it('includes digital, bank, cash', () => {
    expect(TRACKED_HOLDINGS).toContain('digital');
    expect(TRACKED_HOLDINGS).toContain('bank');
    expect(TRACKED_HOLDINGS).toContain('cash');
  });

  it('excludes "none"', () => {
    expect(TRACKED_HOLDINGS).not.toContain('none');
  });

  it('is a subset of HOLDINGS', () => {
    TRACKED_HOLDINGS.forEach((h) => {
      expect(HOLDINGS).toContain(h);
    });
  });
});
