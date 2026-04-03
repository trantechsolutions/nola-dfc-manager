import { X, GitCommit } from 'lucide-react';
import { useT } from '../i18n/I18nContext';

export default function MobileMenu({
  club,
  selectedTeam,
  appNavItems,
  clubNavItems,
  seasonNavItems,
  teamNavItems,
  selectedSeason,
  setSelectedSeason,
  seasons,
  currentView,
  currentSearch,
  navigate,
  user,
  effectiveRole,
  mobileMenuOpen,
  setMobileMenuOpen,
}) {
  const { t } = useT();

  if (!mobileMenuOpen) return null;

  return (
    <div className="md:hidden fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={() => setMobileMenuOpen(false)} />
      <div className="absolute left-0 top-0 bottom-0 w-72 bg-slate-900 p-5 overflow-y-auto animate-in slide-in-from-left duration-200">
        <div className="flex justify-between items-center mb-6">
          <h2 className="font-black text-white text-sm">{club?.name || 'Team Manager'}</h2>
          <button onClick={() => setMobileMenuOpen(false)} className="text-slate-400">
            <X size={20} />
          </button>
        </div>

        {/* Season section */}
        <div className="flex items-center justify-between mb-2">
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
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl font-bold text-sm transition-all ${
                  isActive ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800'
                }`}
              >
                <item.icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* Team section */}
        <div className="border-t border-slate-800 my-3" />
        <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest px-4 mb-2">
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
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl font-bold text-sm transition-all ${
                currentView === item.id ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800'
              }`}
            >
              <item.icon size={18} />
              <span>{item.label}</span>
            </button>
          ))}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-800 mt-4 pt-3 space-y-1">
          <p className="text-[10px] font-bold text-slate-500 truncate px-4">{user.email}</p>
          <p className="text-[9px] font-bold text-blue-400 uppercase px-4 mb-2">{effectiveRole.replace('_', ' ')}</p>
          <button
            onClick={() => {
              navigate('/changelog');
              setMobileMenuOpen(false);
            }}
            className={`w-full flex items-center gap-3 px-4 py-2 rounded-xl font-bold text-sm transition-all ${
              currentView === 'changelog' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:bg-slate-800'
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
