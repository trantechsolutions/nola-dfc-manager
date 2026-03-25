import { useState } from 'react';
import { changelog, buildNumber, buildDate } from 'virtual:changelog';
import { GitCommit, Calendar, ChevronDown, Package } from 'lucide-react';

const ITEMS_PER_PAGE = 15;

// Group commits by date (YYYY-MM-DD)
function groupByDate(entries) {
  const groups = {};
  for (const entry of entries) {
    const day = entry.date.split('T')[0];
    if (!groups[day]) groups[day] = [];
    groups[day].push(entry);
  }
  return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
}

function formatDate(iso) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function Changelog() {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? changelog : changelog.slice(0, ITEMS_PER_PAGE);
  const grouped = groupByDate(visible);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
            <Package size={20} className="text-blue-500" />
            Update Log
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Application version history</p>
        </div>
        <div className="text-right">
          <p className="text-xs font-bold text-blue-600 dark:text-blue-400">Build #{buildNumber}</p>
          <p className="text-[10px] text-slate-400">
            {new Date(buildDate).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        </div>
      </div>

      {/* Timeline */}
      <div className="space-y-6">
        {grouped.map(([date, entries]) => (
          <div key={date}>
            <div className="flex items-center gap-2 mb-2">
              <Calendar size={12} className="text-slate-400 dark:text-slate-500" />
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                {formatDate(date)}
              </p>
              <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
            </div>
            <div className="space-y-1 ml-1">
              {entries.map((entry) => (
                <div
                  key={entry.hash}
                  className="flex items-start gap-3 px-3 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors group"
                >
                  <GitCommit size={14} className="text-slate-300 dark:text-slate-600 mt-0.5 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-800 dark:text-slate-200 leading-snug">{entry.message}</p>
                  </div>
                  <code className="text-[10px] font-mono text-slate-400 dark:text-slate-500 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    {entry.short}
                  </code>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Show more */}
      {!showAll && changelog.length > ITEMS_PER_PAGE && (
        <button
          onClick={() => setShowAll(true)}
          className="w-full flex items-center justify-center gap-1 py-2 text-xs font-bold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
        >
          <ChevronDown size={14} />
          Show {changelog.length - ITEMS_PER_PAGE} more updates
        </button>
      )}

      {changelog.length === 0 && (
        <p className="text-center text-sm text-slate-400 py-8">No changelog data available.</p>
      )}
    </div>
  );
}
