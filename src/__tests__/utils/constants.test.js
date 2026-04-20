import { describe, it, expect } from 'vitest';
import { DOC_TYPE_LABELS, DOC_TYPES, CATEGORY_LABELS } from '../../utils/constants';

describe('constants', () => {
  it('DOC_TYPE_LABELS has all expected types', () => {
    expect(DOC_TYPE_LABELS).toHaveProperty('medical_release');
    expect(DOC_TYPE_LABELS).toHaveProperty('birth_certificate');
    expect(DOC_TYPE_LABELS).toHaveProperty('player_photo');
    expect(DOC_TYPE_LABELS).toHaveProperty('other');
  });

  it('CATEGORY_LABELS has all system categories', () => {
    expect(CATEGORY_LABELS).toHaveProperty('TMF');
    expect(CATEGORY_LABELS).toHaveProperty('FUN');
    expect(CATEGORY_LABELS).toHaveProperty('SPO');
    expect(CATEGORY_LABELS).toHaveProperty('OPE');
    expect(CATEGORY_LABELS).toHaveProperty('TOU');
    expect(CATEGORY_LABELS).toHaveProperty('LEA');
    expect(CATEGORY_LABELS).toHaveProperty('CRE');
    expect(CATEGORY_LABELS).toHaveProperty('FRI');
  });

  it('DOC_TYPES is a non-empty array', () => {
    expect(Array.isArray(DOC_TYPES)).toBe(true);
    expect(DOC_TYPES.length).toBeGreaterThan(0);
  });
});
