import { LayoutDashboard, Users, Calendar, Plus, ReceiptText } from 'lucide-react';
import { useT } from '../i18n/I18nContext';
import { useNavigation } from '../context/NavigationContext';

export default function MobileBottomNav() {
  const {
    seasonNavItems,
    teamNavItems,
    effectiveIsStaff,
    currentView,
    navigate,
    canEditLedger,
    setTxToEdit,
    setShowTxForm,
    isClubAdmin,
    clubNavItems,
    singleTeam,
  } = useNavigation();
  const { t } = useT();

  return (
    <>
      {/* Club strip -- only visible to club admins, sits above the team bar */}
      {isClubAdmin && clubNavItems.length > 0 && (
        <div className="md:hidden fixed bottom-20 left-0 right-0 bg-violet-950 border-t border-violet-800 h-11 flex items-center z-40">
          <span className="text-xs font-bold text-violet-700 dark:text-violet-400 px-3 shrink-0">
            {t('common.club')}
          </span>
          <div className="flex items-center flex-1 justify-around pr-2">
            {clubNavItems.map((item) => (
              <button
                key={item.id}
                onClick={() => navigate(`/${item.id}`)}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg transition-colors ${
                  currentView === item.id
                    ? 'text-violet-200 bg-violet-800/60'
                    : 'text-violet-700 dark:text-violet-400 hover:text-violet-300'
                }`}
              >
                <item.icon size={13} strokeWidth={currentView === item.id ? 2.5 : 2} />
                <span className="text-xs font-semibold">{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Team bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-card border-t border-border h-20 flex items-center justify-around px-2 z-50">
        {!singleTeam && isClubAdmin && clubNavItems.length > 0 && (
          <span className="absolute top-1 left-1/2 -translate-x-1/2 text-xs font-bold text-muted-foreground pointer-events-none">
            Team
          </span>
        )}
        {(effectiveIsStaff
          ? [
              { id: 'dashboard', label: t('nav.seasonOverview'), icon: LayoutDashboard },
              { id: 'finance/ledger', label: t('nav.ledger'), icon: ReceiptText },
              // Plus button goes here (rendered separately below)
              { id: 'people', label: t('nav.players'), icon: Users },
              { id: 'schedule', label: t('nav.schedule'), icon: Calendar },
            ]
          : [
              { id: 'dashboard', label: t('nav.myPlayer'), icon: Users },
              { id: 'schedule', label: t('nav.schedule'), icon: Calendar },
            ]
        ).map((item) => {
          const isActive = currentView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => navigate(`/${item.id}`)}
              className={`flex flex-col items-center gap-1 flex-1 ${isActive ? 'text-blue-700 dark:text-blue-400' : 'text-muted-foreground'}`}
            >
              <item.icon size={20} strokeWidth={isActive ? 3 : 2} />
              <span className="text-xs font-semibold">{item.label}</span>
            </button>
          );
        })}
        {canEditLedger && effectiveIsStaff && (
          <button
            onClick={() => {
              setTxToEdit(null);
              setShowTxForm(true);
            }}
            className="mb-10 bg-accent text-accent-foreground p-4 rounded-full shadow-md border-4 border-card active:scale-90 transition-transform"
            aria-label="Add transaction"
          >
            <Plus size={24} strokeWidth={3} />
          </button>
        )}
      </nav>
    </>
  );
}
