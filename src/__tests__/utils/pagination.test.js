import { describe, it, expect } from 'vitest';

import { paginate, pageWindow } from '../../utils/pagination';

const items = (n) => Array.from({ length: n }, (_, i) => i + 1);

describe('paginate', () => {
  it('slices the requested page', () => {
    const { slice, from, to, total, pageCount } = paginate(items(42), 2, 10);
    expect(slice).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
    expect([from, to, total, pageCount]).toEqual([11, 20, 42, 5]);
  });

  it('reports a short final page honestly', () => {
    const { slice, from, to } = paginate(items(42), 5, 10);
    expect(slice).toEqual([41, 42]);
    expect([from, to]).toEqual([41, 42]);
  });

  // The page index outlives the list it indexes — filtering while deep in the
  // list must not strand the user on a blank table with no way back.
  it('clamps a page that is now past the end', () => {
    const { slice, page } = paginate(items(12), 9, 10);
    expect(page).toBe(2);
    expect(slice).toEqual([11, 12]);
  });

  it('clamps a page below the first', () => {
    expect(paginate(items(12), 0, 10).page).toBe(1);
    expect(paginate(items(12), -3, 10).page).toBe(1);
  });

  it('reports a zero range for an empty list rather than "1 to 0"', () => {
    const { slice, from, to, total, pageCount } = paginate([], 1, 10);
    expect(slice).toEqual([]);
    expect([from, to, total, pageCount]).toEqual([0, 0, 0, 1]);
  });
});

describe('pageWindow', () => {
  it('shows every page when they all fit', () => {
    expect(pageWindow(1, 3)).toEqual([1, 2, 3]);
  });

  it('centres the window on the current page', () => {
    expect(pageWindow(7, 20)).toEqual([5, 6, 7, 8, 9]);
  });

  // Sliding rather than shrinking keeps the control a fixed width, so buttons
  // don't move under the cursor as you page.
  it('slides instead of shrinking at the start', () => {
    expect(pageWindow(1, 20)).toEqual([1, 2, 3, 4, 5]);
    expect(pageWindow(2, 20)).toEqual([1, 2, 3, 4, 5]);
  });

  it('slides instead of shrinking at the end', () => {
    expect(pageWindow(20, 20)).toEqual([16, 17, 18, 19, 20]);
    expect(pageWindow(19, 20)).toEqual([16, 17, 18, 19, 20]);
  });
});
