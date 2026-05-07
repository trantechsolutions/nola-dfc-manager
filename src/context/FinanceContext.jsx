import { createContext, useContext } from 'react';

export const FinanceContext = createContext(null);

export function useFinanceContext() {
  const ctx = useContext(FinanceContext);
  if (!ctx) throw new Error('useFinanceContext must be used inside FinanceContext.Provider');
  return ctx;
}
