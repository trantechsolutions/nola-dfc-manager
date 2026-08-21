import { createContext, useContext } from 'react';

const PanelHostContext = createContext(false);

/**
 * PanelHost — marks a subtree whose panels are opened and closed by the URL.
 *
 * ResponsiveModal normally claims its own throwaway history entry so that
 * hardware Back dismisses a full-screen panel (see useHistoryDismiss). A
 * route-driven panel already has one: opening it pushed a location. Without
 * this marker both would be outstanding at once and closing the panel would
 * take two Back presses.
 *
 * Wrap the panels, not the whole view — a view can route some panels and keep
 * others in local state, and the ones still in state should keep handling
 * their own history:
 *
 *   <PanelHost>
 *     {panel === PANELS.TX && <TransactionModal onClose={closePanel} ... />}
 *   </PanelHost>
 */
export default function PanelHost({ children }) {
  return <PanelHostContext.Provider value={true}>{children}</PanelHostContext.Provider>;
}

/** True inside a PanelHost — i.e. the surrounding route owns the back stack. */
export function useIsRouteOwnedPanel() {
  return useContext(PanelHostContext);
}
