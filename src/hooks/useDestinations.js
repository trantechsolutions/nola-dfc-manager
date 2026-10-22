import { useT } from '../i18n/I18nContext';
import { useNavigation } from '../context/NavigationContext';
import { buildDestinations, findDestination } from '../utils/navDestinations';

/**
 * The top-level destinations for the signed-in user, and the one the current
 * route sits in. The header tabs, the phone tab bar and the section pills all
 * read this, so the three can never disagree about where the user is.
 */
export function useDestinations() {
  const { appNavItems = [], clubNavItems = [], seasonNavItems = [], teamNavItems = [], currentView } = useNavigation();
  const { t } = useT();

  const destinations = buildDestinations([...seasonNavItems, ...teamNavItems, ...clubNavItems, ...appNavItems], t);
  return { destinations, active: findDestination(destinations, currentView) };
}
