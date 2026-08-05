import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { useSidebarState } from '../../hooks/useSidebarState';

/** Swap in a matchMedia whose `matches` we control, mimicking a breakpoint. */
function setViewport(isDesktop) {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: isDesktop,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

describe('useSidebarState', () => {
  beforeEach(() => {
    window.localStorage.clear();
    setViewport(true);
  });

  it('starts expanded when nothing is stored', () => {
    const { result } = renderHook(() => useSidebarState());
    expect(result.current.collapsed).toBe(false);
  });

  it('toggles the minified rail on desktop, leaving the drawer shut', () => {
    const { result } = renderHook(() => useSidebarState());
    act(() => result.current.toggleSidebar());
    expect(result.current.collapsed).toBe(true);
    expect(result.current.mobileOpen).toBe(false);
  });

  it('toggles the off-canvas drawer on mobile, leaving the rail alone', () => {
    setViewport(false);
    const { result } = renderHook(() => useSidebarState());
    act(() => result.current.toggleSidebar());
    expect(result.current.mobileOpen).toBe(true);
    expect(result.current.collapsed).toBe(false);
  });

  it('persists the desktop rail so it survives a reload', () => {
    const { result, unmount } = renderHook(() => useSidebarState());
    act(() => result.current.toggleSidebar());
    unmount();

    const { result: reloaded } = renderHook(() => useSidebarState());
    expect(reloaded.current.collapsed).toBe(true);
  });

  it('never restores the drawer open — that would cover the page on load', () => {
    setViewport(false);
    const { result, unmount } = renderHook(() => useSidebarState());
    act(() => result.current.toggleSidebar());
    expect(result.current.mobileOpen).toBe(true);
    unmount();

    const { result: reloaded } = renderHook(() => useSidebarState());
    expect(reloaded.current.mobileOpen).toBe(false);
  });

  it('locks page scroll while the drawer is open and restores it after', () => {
    setViewport(false);
    const { result } = renderHook(() => useSidebarState());

    act(() => result.current.toggleSidebar());
    expect(document.body.style.overflow).toBe('hidden');

    act(() => result.current.closeMobile());
    expect(document.body.style.overflow).not.toBe('hidden');
  });
});
