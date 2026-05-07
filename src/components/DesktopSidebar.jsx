import { ChevronDown, Globe, LogOut, Settings, GitCommit, Bell } from 'lucide-react';
import { useT } from '../i18n/I18nContext';
import { useState } from 'react';
import { isSingleTeamMode } from '../utils/singleTeamMode';
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
  } = useNavigation();
  const { t } = useT();
  const [showTeamPicker, setShowTeamPicker] = useState(false);
  const [broadcastMsg, setBroadcastMsg] = useState('');
  const [showBroadcast, setShowBroadcast] = useState(false);
  const [broadcastSending, setBroadcastSending] = useState(false);
  const selectedTeam = teams.find((t) => t.id === selectedTeamId) || teams[0] || null;
  const singleTeam = isSingleTeamMode();
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
    <aside className="hidden md:flex w-64 bg-slate-900 text-white flex-col sticky top-0 h-screen">
      <div className="p-6">
        <h1 className="text-xl font-black tracking-tighter uppercase">{club?.name || 'Team Manager'}</h1>

        {!singleTeam && teams.length > 1 && (
          <div className="mt-3 relative">
            <button
              onClick={() => setShowTeamPicker(!showTeamPicker)}
              className="w-full p-2.5 bg-slate-800 rounded-xl text-left flex items-center justify-between hover:bg-slate-700 transition-colors"
            >
              <div className="min-w-0">
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{t('common.team')}</p>
                <p className="text-sm font-bold text-blue-400 truncate">{selectedTeam?.name || t('common.team')}</p>
              </div>
              <ChevronDown
                size={14}
                className={`text-slate-400 transition-transform ${showTeamPicker ? 'rotate-180' : ''}`}
              />
            </button>
            {showTeamPicker && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-slate-800 rounded-xl border border-slate-700 shadow-2xl z-50 overflow-hidden max-h-60 overflow-y-auto">
                {teams.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      setSelectedTeamId(t.id);
                      setShowTeamPicker(false);
                    }}
                    className={`w-full text-left px-3 py-2.5 flex items-center gap-2 hover:bg-slate-700 transition-colors ${t.id === selectedTeamId ? 'bg-slate-700' : ''}`}
                  >
                    <div
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: t.colorPrimary || '#3b82f6' }}
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-white truncate">{t.name}</p>
                      <p className="text-[9px] text-slate-400">
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
          <div className="mt-3 p-2.5 bg-slate-800 rounded-xl">
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{t('common.team')}</p>
            <p className="text-sm font-bold text-blue-400">{selectedTeam?.name}</p>
          </div>
        )}
      </div>

      <nav className="flex-grow px-4 space-y-1 overflow-y-auto">
        {appNavItems.length > 0 && (
          <>
            <p className="text-[9px] font-bold text-violet-400 uppercase tracking-widest px-4 pt-2 pb-1">APP</p>
            {appNavItems.map((item) => (
              <button
                key={item.id}
                onClick={() => navigate(`/${item.id}`)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl font-bold transition-all text-sm ${
                  currentView === item.id
                    ? 'bg-violet-600 text-white shadow-lg shadow-violet-900/20'
                    : 'text-slate-400 hover:bg-slate-800'
                }`}
              >
                <item.icon size={18} />
                <span>{item.label}</span>
              </button>
            ))}
            <div className="border-t border-slate-800 my-2" />
          </>
        )}
        {clubNavItems.length > 0 && (
          <>
            <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest px-4 pt-2 pb-1">
              {t('common.club')}
            </p>
            {clubNavItems.map((item) => (
              <button
                key={item.id}
                onClick={() => navigate(`/${item.id}`)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl font-bold transition-all text-sm ${
                  currentView === item.id
                    ? 'bg-violet-600 text-white shadow-lg shadow-violet-900/20'
                    : 'text-slate-400 hover:bg-slate-800'
                }`}
              >
                <item.icon size={18} />
                <span>{item.label}</span>
              </button>
            ))}
            <div className="border-t border-slate-800 my-2" />
          </>
        )}

        {/* SEASON section */}
        {selectedTeam && (
          <div className="flex items-center justify-between px-4 pt-1 pb-1">
            <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">{t('common.season')}</p>
            <select
              value={selectedSeason}
              onChange={(e) => setSelectedSeason(e.target.value)}
              className="bg-transparent border-none text-blue-400 font-bold text-[10px] p-0 focus:ring-0 cursor-pointer text-right"
            >
              {seasons.map((s) => (
                <option key={s.id} value={s.id} className="text-slate-900">
                  {s.id}
                </option>
              ))}
            </select>
          </div>
        )}
        {seasonNavItems.map((item) => {
          const isActive = currentView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => navigate(`/${item.id}`)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl font-bold transition-all text-sm ${
                isActive ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'text-slate-400 hover:bg-slate-800'
              }`}
            >
              <item.icon size={18} />
              <span>{item.label}</span>
            </button>
          );
        })}

        {/* TEAM section */}
        <div className="border-t border-slate-800 my-2" />
        <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest px-4 pt-1 pb-1">
          {selectedTeam?.name || t('common.team')}
        </p>
        {teamNavItems.map((item) => (
          <button
            key={item.id}
            onClick={() => navigate(`/${item.id}`)}
            className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl font-bold transition-all text-sm ${
              currentView === item.id
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20'
                : 'text-slate-400 hover:bg-slate-800'
            }`}
          >
            <item.icon size={18} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="border-t border-slate-800">
        <button
          onClick={() => setSidebarSettingsOpen(!sidebarSettingsOpen)}
          className="w-full flex items-center justify-between px-4 py-3 text-slate-400 hover:bg-slate-800 transition-all"
        >
          <div className="flex items-center gap-2 min-w-0">
            <Settings size={14} />
            <p className="text-[10px] font-bold text-slate-500 truncate">{user.email}</p>
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
              className="w-full flex items-center gap-3 px-4 py-2 rounded-xl font-bold text-slate-400 hover:bg-slate-800 transition-all"
            >
              <Globe size={16} />
              <span className="text-sm">{locale === 'en' ? 'Español' : 'English'}</span>
            </button>
            <button
              onClick={cycleTheme}
              className="w-full flex items-center gap-3 px-4 py-2 rounded-xl font-bold text-slate-400 hover:bg-slate-800 transition-all"
            >
              <ThemeIcon size={16} />
              <span className="text-sm capitalize">{theme}</span>
            </button>
            <button
              onClick={() => {
                navigate('/changelog');
                setSidebarSettingsOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-4 py-2 rounded-xl font-bold transition-all ${
                currentView === 'changelog' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:bg-slate-800'
              }`}
            >
              <GitCommit size={16} />
              <span className="text-sm">Update Log</span>
            </button>
            {/* Push notifications toggle */}
            {isSupported &&
              (isSubscribed ? (
                <div className="px-4 py-2 flex items-center gap-3">
                  <Bell size={16} className="text-green-400 shrink-0" />
                  <span className="text-xs text-green-400 font-bold">Notifications on</span>
                </div>
              ) : (
                <button
                  onClick={subscribe}
                  className="w-full flex items-center gap-3 px-4 py-2 rounded-xl font-bold text-slate-400 hover:bg-slate-800 transition-all"
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
                    className="w-full bg-slate-800 text-white text-xs rounded-xl px-3 py-2 resize-none border border-slate-700 focus:border-blue-500 focus:outline-none"
                  />
                  <div className="flex gap-1">
                    <button
                      onClick={handleBroadcast}
                      disabled={broadcastSending || !broadcastMsg.trim()}
                      className="flex-1 bg-blue-600 disabled:opacity-40 text-white text-xs font-black py-1.5 rounded-lg"
                    >
                      {broadcastSending ? 'Sending…' : 'Send'}
                    </button>
                    <button
                      onClick={() => {
                        setShowBroadcast(false);
                        setBroadcastMsg('');
                      }}
                      className="flex-1 bg-slate-800 text-slate-400 text-xs font-bold py-1.5 rounded-lg"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowBroadcast(true)}
                  className="w-full flex items-center gap-3 px-4 py-2 rounded-xl font-bold text-slate-400 hover:bg-slate-800 transition-all"
                >
                  <Bell size={16} />
                  <span className="text-sm">Broadcast to Team</span>
                </button>
              ))}

            <button
              onClick={() => supabase.auth.signOut()}
              className="w-full flex items-center gap-3 px-4 py-2 rounded-xl font-bold text-red-400 hover:bg-red-900/20 transition-all"
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
