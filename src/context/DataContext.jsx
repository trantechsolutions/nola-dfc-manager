import { createContext, useContext } from 'react';

export const DataContext = createContext(null);

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used inside DataContext.Provider');
  return ctx;
}

// Convenience hook for mutation-only consumers that need optimistic setters
export function useDataMutations() {
  const { setPlayers, setTransactions, fetchData } = useData();
  return { setPlayers, setTransactions, fetchData };
}
