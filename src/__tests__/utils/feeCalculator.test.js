import { describe, it, expect } from 'vitest';
import { computeSeasonFee, FEE_ROUNDING_INCREMENT } from '../../utils/feeCalculator';

describe('computeSeasonFee', () => {
  it('applies the buffer to expenses and divides by the roster', () => {
    const { bufferAmount, needsCovered, rawFee, roundedFee } = computeSeasonFee({
      totalExpenses: 10000,
      bufferPercent: 5,
      rosterSize: 10,
    });
    expect(bufferAmount).toBe(500);
    expect(needsCovered).toBe(10500);
    expect(rawFee).toBe(1050);
    expect(roundedFee).toBe(1050);
  });

  it('rounds the fee up to the next $50', () => {
    expect(computeSeasonFee({ totalExpenses: 10010, bufferPercent: 0, rosterSize: 10 }).roundedFee).toBe(1050);
    expect(FEE_ROUNDING_INCREMENT).toBe(50);
  });

  it('subtracts the carryover after the buffer, lowering the fee', () => {
    const withoutCarryover = computeSeasonFee({ totalExpenses: 10000, bufferPercent: 5, rosterSize: 10 });
    const withCarryover = computeSeasonFee({
      totalExpenses: 10000,
      bufferPercent: 5,
      carryoverAmount: 2000,
      rosterSize: 10,
    });

    // Buffer still sized off the full expense figure, not the discounted one.
    expect(withCarryover.bufferAmount).toBe(withoutCarryover.bufferAmount);
    expect(withCarryover.needsCovered).toBe(8500);
    expect(withCarryover.rawFee).toBe(850);
    expect(withCarryover.roundedFee).toBe(850);
  });

  it('treats an absent carryover as zero', () => {
    const omitted = computeSeasonFee({ totalExpenses: 5000, bufferPercent: 10, rosterSize: 12 });
    const explicit = computeSeasonFee({ totalExpenses: 5000, bufferPercent: 10, carryoverAmount: 0, rosterSize: 12 });
    expect(omitted).toEqual(explicit);
  });

  it('floors the fee at zero when the carryover exceeds what is needed', () => {
    const result = computeSeasonFee({
      totalExpenses: 1000,
      bufferPercent: 5,
      carryoverAmount: 99999,
      rosterSize: 10,
    });
    expect(result.needsCovered).toBe(0);
    expect(result.rawFee).toBe(0);
    expect(result.roundedFee).toBe(0);
  });

  it('ignores a negative carryover rather than inflating the fee', () => {
    const result = computeSeasonFee({
      totalExpenses: 1000,
      bufferPercent: 0,
      carryoverAmount: -500,
      rosterSize: 10,
    });
    expect(result.needsCovered).toBe(1000);
    expect(result.rawFee).toBe(100);
  });

  it('returns a zero fee instead of dividing by an empty roster', () => {
    const result = computeSeasonFee({ totalExpenses: 5000, bufferPercent: 5, rosterSize: 0 });
    expect(result.needsCovered).toBe(5250);
    expect(result.rawFee).toBe(0);
    expect(result.roundedFee).toBe(0);
  });

  it('coerces string inputs from number fields', () => {
    const result = computeSeasonFee({
      totalExpenses: '10000',
      bufferPercent: '5',
      carryoverAmount: '500',
      rosterSize: '10',
    });
    expect(result.rawFee).toBe(1000);
  });
});
