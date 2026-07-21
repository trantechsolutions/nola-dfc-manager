import { X, GitCommit, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { useT } from '../i18n/I18nContext';
import { useNavigation } from '../context/NavigationContext';

export default function MobileMenu() {
  const [showSeasonPicker, setShowSeasonPicker] = useState(false);
  const {
    club,
    selectedTeam,
    seasonNavItems,
    teamNavItems,
    selectedSeason,
    setSelectedSeason,
    seasons,
    currentView,
    navigate,
    user,
    effectiveRole,
    mobileMenuOpen,
    setMobileMenuOpen,
  } = useNavigation();
  const { t } = useT();

  if (!mobileMenuOpen) return null;

  return (
    <div className="md:hidden fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={() => setMobileMenuOpen(false)} />
      <div className="absolute left-0 top-0 bottom-0 w-72 bg-sidebar text-sidebar-foreground p-5 overflow-y-auto animate-in slide-in-from-left duration-200 border-r border-sidebar-border">
        <div className="flex justify-between items-center mb-6">
          <h2 className="font-bold text-sidebar-foreground text-sm">{club?.name || 'Touchline'}</h2>
          <button onClick={() => setMobileMenuOpen(false)} className="text-muted-foreground">
            <X size={20} />
          </button>
        </div>

        {/* Season picker — matches team picker pattern */}
        <div className="relative mb-3">
          <button
            type="button"
            onClick={() => setShowSeasonPicker((v) => !v)}
            className="w-full p-2.5 bg-sidebar-accent rounded-lg text-left flex items-center justify-between hover:bg-sidebar-accent/80 transition-colors"
          >
            <div className="min-w-0">
              <p className="text-xs font-semibold text-muted-foreground">{t('common.season')}</p>
              <p className="text-sm font-semibold text-primary truncate">{selectedSeason}</p>
            </div>
            <ChevronDown
              size={14}
              className={`text-muted-foreground transition-transform ${showSeasonPicker ? 'rotate-180' : ''}`}
            />
          </button>
          {showSeasonPicker && (
            <div className="absolute left-0 right-0 top-full mt-1 bg-card rounded-lg border border-border shadow-md z-50 overflow-hidden max-h-60 overflow-y-auto">
              {seasons.map((s) => {
                const isSelected = s.id === selectedSeason;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      setSelectedSeason(s.id);
                      setShowSeasonPicker(false);
                    }}
                    className={`w-full text-left px-3 py-2.5 text-sm font-semibold transition-colors ${
                      isSelected ? 'bg-muted text-primary' : 'text-foreground hover:bg-muted'
                    }`}
                  >
                    {s.id}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div className="space-y-1 mb-4">
          {seasonNavItems.map((item) => {
            const isActive = currentView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  navigate(`/${item.id}`);
                  setMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg font-semibold text-sm transition-all ${
                  isActive ? 'bg-primary text-primary-foreground' : 'text-sidebar-foreground hover:bg-sidebar-accent'
                }`}
              >
                <item.icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* Team section */}
        <div className="border-t border-sidebar-border my-3" />
        <p className="text-xs font-semibold text-muted-foreground px-4 mb-2">
          {selectedTeam?.name || t('common.team')}
        </p>
        <div className="space-y-1">
          {teamNavItems.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                navigate(`/${item.id}`);
                setMobileMenuOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg font-semibold text-sm transition-all ${
                currentView === item.id
                  ? 'bg-primary text-primary-foreground'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent'
              }`}
            >
              <item.icon size={18} />
              <span>{item.label}</span>
            </button>
          ))}
        </div>

        {/* Footer */}
        <div className="border-t border-sidebar-border mt-4 pt-3 space-y-1">
          <p className="text-xs font-semibold text-muted-foreground truncate px-4">{user.email}</p>
          <p className="text-xs font-semibold text-primary px-4 mb-2">{effectiveRole.replace('_', ' ')}</p>
          <button
            onClick={() => {
              navigate('/changelog');
              setMobileMenuOpen(false);
            }}
            className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg font-semibold text-sm transition-all ${
              currentView === 'changelog'
                ? 'bg-sidebar-accent text-sidebar-foreground'
                : 'text-sidebar-foreground hover:bg-sidebar-accent'
            }`}
          >
            <GitCommit size={16} />
            <span>Update Log</span>
          </button>
        </div>
      </div>
    </div>
  );
}
