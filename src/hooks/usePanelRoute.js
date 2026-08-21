import { useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { readPanel, withPanel, withoutPanel } from '../utils/panelRoute';

// Whether the panel currently showing was opened from inside this session
// rather than arrived at directly (a shared link, a reload). It decides what
// closing means: rewind our own push, or replace a URL we did not push.
//
// Module-level rather than a ref, because only one panel is open at a time and
// the component that opens it is often not the one that closes it — the mobile
// FAB opens the transaction panel from any route, and AppRoutes is what renders
// and dismisses it. Per-instance state would miss that push and leave the entry
// behind, putting the dismissed panel one Back press away.
let pushedByUs = false;

/**
 * usePanelRoute — opens and closes panels through the URL.
 *
 * A view calls this instead of holding `showThingForm` in state:
 *
 *   const { panel, panelParams, openPanel, closePanel } = usePanelRoute();
 *   ...
 *   <button onClick={() => openPanel(PANELS.TX, { id: tx.id })}>Edit</button>
 *   {panel === PANELS.TX && <TransactionModal onClose={closePanel} ... />}
 *
 * Opening pushes, so hardware Back closes the panel without any help from
 * ResponsiveModal's own history handling — which is why a view that routes its
 * panels wraps them in <PanelHost>, so the two do not each claim an entry.
 */
export function usePanelRoute() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const { name, params } = useMemo(() => readPanel(searchParams), [searchParams]);

  const openPanel = useCallback(
    (panelName, panelParams) => {
      pushedByUs = true;
      setSearchParams(withPanel(searchParams, panelName, panelParams));
    },
    [searchParams, setSearchParams],
  );

  /**
   * Replace rather than push, so re-opening a panel with different params
   * (picking a second player from a list) does not stack a history entry per
   * step — Back should leave the panel, not walk back through the ones before.
   */
  const replacePanel = useCallback(
    (panelName, panelParams) => {
      setSearchParams(withPanel(searchParams, panelName, panelParams), { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const closePanel = useCallback(() => {
    if (pushedByUs) {
      // Rewind our own entry. Replacing instead would leave it in place, and
      // the next Back press would re-open the panel the user just dismissed.
      pushedByUs = false;
      navigate(-1);
      return;
    }
    // Landed here on a shared link or a reload: there is no entry of ours to
    // rewind, and going back would leave the app entirely.
    setSearchParams(withoutPanel(searchParams), { replace: true });
  }, [navigate, searchParams, setSearchParams]);

  return { panel: name, panelParams: params, openPanel, replacePanel, closePanel };
}
