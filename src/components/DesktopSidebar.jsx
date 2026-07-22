import { ChevronDown, Globe, LogOut, Settings, GitCommit, Bell } from 'lucide-react';
import { useT } from '../i18n/I18nContext';
import { useState } from 'react';
import { useNavigation } from '../context/NavigationContext';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { pushService } from '../services/pushService';

export default function DesktopSidebar() {
  const {
    club,
    teams,
    selectedTeamId,
    setSelectedTeamId,
    appNavItems,
    clubNavItems,
    seasonNavItems,
    teamNavItems,
    selectedSeason,
    setSelectedSeason,
    seasons,
    currentView,
    navigate,
    user,
    toggleLocale,
    locale,
    cycleTheme,
    theme,
    ThemeIcon,
    sidebarSettingsOpen,
    setSidebarSettingsOpen,
    supabase,
    singleTeam,
  } = useNavigation();
  const { t } = useT();
  const [showTeamPicker, setShowTeamPicker] = useState(false);
  const [showSeasonPicker, setShowSeasonPicker] = useState(false);
  const [broadcastMsg, setBroadcastMsg] = useState('');
  const [showBroadcast, setShowBroadcast] = useState(false);
  const [broadcastSending, setBroadcastSending] = useState(false);
  const selectedTeam = teams.find((t) => t.id === selectedTeamId) || teams[0] || null;
  const { isSubscribed, isSupported, subscribe } = usePushNotifications();

  const handleBroadcast = async () => {
    if (!broadcastMsg.trim()) return;
    setBroadcastSending(true);
    try {
      await pushService.broadcast({
        teamId: selectedTeamId || undefined,
        title: selectedTeam?.name || 'Team Update',
        body: broadcastMsg.trim(),
        url: '/dashboard',
      });
      setBroadcastMsg('');
      setShowBroadcast(false);
    } catch (e) {
      console.error('[broadcast]', e);
    } finally {
      setBroadcastSending(false);
    }
  };

  return (
    <aside className="hidden md:flex w-64 bg-sidebar text-sidebar-foreground flex-col sticky top-0 h-screen border-r border-sidebar-border">
      <div className="p-6">
        <h1 className="text-xl font-bold tracking-tighter uppercase text-sidebar-foreground">
          {club?.name || 'Cantera'}
        </h1>

        {!singleTeam && teams.length > 1 && (
          <div className={`mt-3 relative ${showTeamPicker ? 'z-[60]' : ''}`}>
            <button
              onClick={() => setShowTeamPicker(!showTeamPicker)}
              className="w-full p-2.5 bg-sidebar-accent rounded-lg text-left flex items-center justify-between hover:bg-sidebar-accent/80 transition-colors"
            >
              <div className="min-w-0">
                <p className="text-xs font-semibold text-muted-foreground">{t('common.team')}</p>
                <p className="text-sm font-semibold text-primary truncate">{selectedTeam?.name || t('common.team')}</p>
              </div>
              <ChevronDown
                size={14}
                className={`text-muted-foreground transition-transform ${showTeamPicker ? 'rotate-180' : ''}`}
              />
            </button>
            {showTeamPicker && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-card rounded-lg border border-border shadow-md overflow-hidden max-h-60 overflow-y-auto">
                {teams.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      setSelectedTeamId(t.id);
                      setShowTeamPicker(false);
                    }}
                    className={`w-full text-left px-3 py-2.5 flex items-center gap-2 hover:bg-muted transition-colors ${t.id === selectedTeamId ? 'bg-muted' : ''}`}
                  >
                    <div
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: t.colorPrimary || 'var(--primary)' }}
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-foreground truncate">{t.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {t.ageGroup} · {t.gender} · {t.tier}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {(singleTeam || teams.length === 1) && selectedTeam && (
          <div className="mt-3 p-2.5 bg-sidebar-accent rounded-lg">
            <p className="text-xs font-semibold text-muted-foreground">{t('common.team')}</p>
            <p className="text-sm font-semibold text-primary">{selectedTeam?.name}</p>
          </div>
        )}

        {/* SEASON picker — matches team picker pattern */}
        {selectedTeam && seasons.length > 0 && (
          <div className={`mt-3 relative ${showSeasonPicker ? 'z-[60]' : ''}`}>
            <button
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
              <div className="absolute left-0 right-0 top-full mt-1 bg-card rounded-lg border border-border shadow-md overflow-hidden max-h-60 overflow-y-auto">
                {seasons.map((s) => {
                  const isSelected = s.id === selectedSeason;
                  return (
                    <button
                      key={s.id}
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
        )}
      </div>

      <nav className="flex-grow px-4 space-y-1 overflow-y-auto">
        {appNavItems.length > 0 && (
          <>
            <p className="text-xs font-semibold text-accent px-4 pt-2 pb-1">APP</p>
            {appNavItems.map((item) => (
              <button
                key={item.id}
                onClick={() => navigate(`/${item.id}`)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg font-semibold transition-all text-sm ${
                  currentView === item.id
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent'
                }`}
              >
                <item.icon size={18} />
                <span>{item.label}</span>
              </button>
            ))}
            <div className="border-t border-sidebar-border my-2" />
          </>
        )}
        {clubNavItems.length > 0 && (
          <>
            <p className="text-xs font-semibold text-muted-foreground px-4 pt-2 pb-1">{t('common.club')}</p>
            {clubNavItems.map((item) => (
              <button
                key={item.id}
                onClick={() => navigate(`/${item.id}`)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg font-semibold transition-all text-sm ${
                  currentView === item.id
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent'
                }`}
              >
                <item.icon size={18} />
                <span>{item.label}</span>
              </button>
            ))}
            <div className="border-t border-sidebar-border my-2" />
          </>
        )}

        {seasonNavItems.map((item) => {
          const isActive = currentView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => navigate(`/${item.id}`)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg font-semibold transition-all text-sm ${
                isActive
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent'
              }`}
            >
              <item.icon size={18} />
              <span>{item.label}</span>
            </button>
          );
        })}

        {/* TEAM section */}
        <div className="border-t border-sidebar-border my-2" />
        <p className="text-xs font-semibold text-muted-foreground px-4 pt-1 pb-1">
          {selectedTeam?.name || t('common.team')}
        </p>
        {teamNavItems.map((item) => (
          <button
            key={item.id}
            onClick={() => navigate(`/${item.id}`)}
            className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg font-semibold transition-all text-sm ${
              currentView === item.id
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-sidebar-foreground hover:bg-sidebar-accent'
            }`}
          >
            <item.icon size={18} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="border-t border-sidebar-border">
        <button
          onClick={() => setSidebarSettingsOpen(!sidebarSettingsOpen)}
          className="w-full flex items-center justify-between px-4 py-3 text-muted-foreground hover:bg-sidebar-accent transition-all"
        >
          <div className="flex items-center gap-2 min-w-0">
            <Settings size={14} />
            <p className="text-xs font-semibold text-muted-foreground truncate">{user.email}</p>
          </div>
          <ChevronDown
            size={14}
            className={`transition-transform duration-200 flex-shrink-0 ${sidebarSettingsOpen ? 'rotate-180' : ''}`}
          />
        </button>
        {sidebarSettingsOpen && (
          <div className="px-4 pb-3 space-y-1">
            <button
              onClick={toggleLocale}
              className="w-full flex items-center gap-3 px-4 py-2 rounded-lg font-semibold text-sidebar-foreground hover:bg-sidebar-accent transition-all"
            >
              <Globe size={16} />
              <span className="text-sm">{locale === 'en' ? 'Español' : 'English'}</span>
            </button>
            <button
              onClick={cycleTheme}
              className="w-full flex items-center gap-3 px-4 py-2 rounded-lg font-semibold text-sidebar-foreground hover:bg-sidebar-accent transition-all"
            >
              <ThemeIcon size={16} />
              <span className="text-sm capitalize">{theme}</span>
            </button>
            <button
              onClick={() => {
                navigate('/changelog');
                setSidebarSettingsOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg font-semibold transition-all ${
                currentView === 'changelog'
                  ? 'bg-sidebar-accent text-sidebar-foreground'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent'
              }`}
            >
              <GitCommit size={16} />
              <span className="text-sm">Update Log</span>
            </button>
            {/* Push notifications toggle */}
            {isSupported &&
              (isSubscribed ? (
                <div className="px-4 py-2 flex items-center gap-3">
                  <Bell size={16} className="text-success shrink-0" />
                  <span className="text-xs text-success font-semibold">Notifications on</span>
                </div>
              ) : (
                <button
                  onClick={subscribe}
                  className="w-full flex items-center gap-3 px-4 py-2 rounded-lg font-semibold text-sidebar-foreground hover:bg-sidebar-accent transition-all"
                >
                  <Bell size={16} />
                  <span className="text-sm">Enable Notifications</span>
                </button>
              ))}

            {/* Broadcast to team (staff only) */}
            {selectedTeamId &&
              (showBroadcast ? (
                <div className="space-y-1 px-1">
                  <textarea
                    value={broadcastMsg}
                    onChange={(e) => setBroadcastMsg(e.target.value)}
                    placeholder="Message to team…"
                    rows={2}
                    className="w-full bg-sidebar-accent text-sidebar-foreground text-xs rounded-lg px-3 py-2 resize-none border border-sidebar-border focus:border-ring focus:outline-none"
                  />
                  <div className="flex gap-1">
                    <button
                      onClick={handleBroadcast}
                      disabled={broadcastSending || !broadcastMsg.trim()}
                      className="flex-1 bg-primary disabled:opacity-40 text-primary-foreground text-xs font-bold py-1.5 rounded-lg"
                    >
                      {broadcastSending ? 'Sending…' : 'Send'}
                    </button>
                    <button
                      onClick={() => {
                        setShowBroadcast(false);
                        setBroadcastMsg('');
                      }}
                      className="flex-1 bg-sidebar-accent text-muted-foreground text-xs font-semibold py-1.5 rounded-lg"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowBroadcast(true)}
                  className="w-full flex items-center gap-3 px-4 py-2 rounded-lg font-semibold text-sidebar-foreground hover:bg-sidebar-accent transition-all"
                >
                  <Bell size={16} />
                  <span className="text-sm">Broadcast to Team</span>
                </button>
              ))}

            <button
              onClick={() => supabase.auth.signOut()}
              className="w-full flex items-center gap-3 px-4 py-2 rounded-lg font-semibold text-destructive hover:bg-destructive/10 transition-all"
            >
              <LogOut size={16} />
              <span className="text-sm">{t('common.logout')}</span>
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
