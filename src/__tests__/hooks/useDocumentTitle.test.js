import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { renderHook } from '@testing-library/react';

import { APP_NAME } from '../../utils/constants';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';

const originalTitle = document.title;

describe('useDocumentTitle', () => {
  beforeEach(() => {
    document.title = 'stale';
  });

  afterAll(() => {
    document.title = originalTitle;
  });

  it('leads with the app name and names the selected team ahead of the club', () => {
    renderHook(() => useDocumentTitle('U12 Boys', 'NOLA DFC'));
    expect(document.title).toBe(`${APP_NAME} | U12 Boys`);
  });

  it('falls back to the club while no team is selected', () => {
    renderHook(() => useDocumentTitle(undefined, 'NOLA DFC'));
    expect(document.title).toBe(`${APP_NAME} | NOLA DFC`);
  });

  it('is the bare app name before any context resolves — no dangling separator', () => {
    renderHook(() => useDocumentTitle(undefined, undefined));
    expect(document.title).toBe(APP_NAME);
  });

  it('still names the team when the club has not loaded yet', () => {
    renderHook(() => useDocumentTitle('U12 Boys', undefined));
    expect(document.title).toBe(`${APP_NAME} | U12 Boys`);
  });

  it('re-titles when the team selection changes', () => {
    const { rerender } = renderHook(({ team }) => useDocumentTitle(team, 'NOLA DFC'), {
      initialProps: { team: 'U12 Boys' },
    });
    expect(document.title).toBe(`${APP_NAME} | U12 Boys`);

    rerender({ team: 'U14 Girls' });
    expect(document.title).toBe(`${APP_NAME} | U14 Girls`);
  });
});
