import { createContext, useContext } from 'react';

export const ScheduleContext = createContext(null);

export function useScheduleContext() {
  const ctx = useContext(ScheduleContext);
  if (!ctx) throw new Error('useScheduleContext must be used inside ScheduleContext.Provider');
  return ctx;
}
