import { describe, it, expect } from 'vitest';
import { formatPhone, formatPhoneInput, phoneDigits, phoneHref } from '../../utils/phone';

describe('formatPhone', () => {
  it('formats clean 10-digit numbers', () => {
    expect(formatPhone('5045551234')).toBe('(504) 555-1234');
    expect(formatPhone('504.555.1234')).toBe('(504) 555-1234');
    expect(formatPhone('504-555-1234')).toBe('(504) 555-1234');
  });

  it('handles a leading US country code', () => {
    expect(formatPhone('15045551234')).toBe('(504) 555-1234');
    expect(formatPhone('+1 (504) 555-1234')).toBe('(504) 555-1234');
  });

  it('is idempotent', () => {
    const once = formatPhone('5045551234');
    expect(formatPhone(once)).toBe(once);
    expect(formatPhone(formatPhone('15045551234'))).toBe('(504) 555-1234');
  });

  it('passes non-conforming values through unchanged', () => {
    expect(formatPhone('555-1234 x203')).toBe('555-1234 x203');
    expect(formatPhone('+44 20 7946 0958')).toBe('+44 20 7946 0958');
    expect(formatPhone('1-800-FLOWERS')).toBe('1-800-FLOWERS');
    expect(formatPhone('504555')).toBe('504555');
    expect(formatPhone('')).toBe('');
  });

  it('preserves null/undefined', () => {
    expect(formatPhone(null)).toBe(null);
    expect(formatPhone(undefined)).toBe(undefined);
  });
});

describe('formatPhoneInput', () => {
  it('builds the mask progressively', () => {
    expect(formatPhoneInput('5')).toBe('(5');
    expect(formatPhoneInput('504')).toBe('(504');
    expect(formatPhoneInput('5045')).toBe('(504) 5');
    expect(formatPhoneInput('504555')).toBe('(504) 555');
    expect(formatPhoneInput('5045551234')).toBe('(504) 555-1234');
  });

  it('ignores digits past ten and returns empty for no digits', () => {
    expect(formatPhoneInput('50455512349999')).toBe('(504) 555-1234');
    expect(formatPhoneInput('')).toBe('');
    expect(formatPhoneInput('abc')).toBe('');
  });
});

describe('phoneDigits / phoneHref', () => {
  it('extracts digits', () => {
    expect(phoneDigits('(504) 555-1234')).toBe('5045551234');
    expect(phoneDigits(null)).toBe('');
  });

  it('builds a tel: href from digits', () => {
    expect(phoneHref('(504) 555-1234')).toBe('tel:5045551234');
  });
});
