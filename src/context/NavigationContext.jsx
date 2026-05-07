import { createContext, useContext } from 'react';

/**
 * NavigationContext
 *
 * Provides nav-related state and callbacks to sidebar and mobile nav components,
 * eliminating the 11-19 prop drilling chains from App.jsx.
 *
 * Consumers read this context instead of receiving the values as props.
 * App.jsx remains the single source of truth — it provides the values here.
 */
export const NavigationContext = createContext(null);

export function useNavigation() {
  const ctx = useContext(NavigationContext);
  if (!ctx) throw new Error('useNavigation must be used inside NavigationContext.Provider');
  return ctx;
}
