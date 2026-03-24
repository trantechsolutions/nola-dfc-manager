import { ChevronDown } from 'lucide-react';

export default function SeasonPicker({ seasons = [], selectedSeason, onSeasonChange, compact = false }) {
  if (seasons.length === 0) return null;

  return (
    <div className={`flex items-center gap-2 ${compact ? '' : 'mb-4'}`}>
      <div className="relative">
        <select
          value={selectedSeason}
          onChange={(e) => onSeasonChange(e.target.value)}
          className={`appearance-none font-black bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-white border-none rounded-xl cursor-pointer focus:ring-2 focus:ring-blue-500 pr-8 ${
            compact ? 'text-xs px-3 py-1.5' : 'text-sm px-4 py-2'
          }`}
        >
          {seasons.map((s) => (
            <option key={s.id} value={s.id}>
              {s.id}
            </option>
          ))}
        </select>
        <ChevronDown
          size={compact ? 12 : 14}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
        />
      </div>
    </div>
  );
}
