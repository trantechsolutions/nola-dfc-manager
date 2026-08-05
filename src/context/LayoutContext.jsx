import { createContext, useContext } from 'react';

/**
 * LayoutContext
 *
 * Owns the AdminLTE shell chrome state — the minified ("sidebar-mini")
 * desktop rail and the off-canvas mobile drawer. Kept separate from
 * NavigationContext so shell chrome can re-render without dragging the
 * whole nav payload along with it.
 */
export const LayoutContext = createContext(null);

export function useLayout() {
  const ctx = useContext(LayoutContext);
  if (!ctx) throw new Error('useLayout must be used inside LayoutContext.Provider');
  return ctx;
}
