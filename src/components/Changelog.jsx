import { useState, useEffect } from 'react';
import { buildNumber, commitHash, buildDate } from 'virtual:git-info';
import { supabase } from '../supabase';
import { GitCommit, Calendar, ChevronDown, ChevronRight, Package, Sparkles, Loader2, Tag } from 'lucide-react';

const CATEGORY_LABELS = {
  feature: '✨ New Features',
  improvement: '🔧 Improvements',
  bugfix: '🐛 Bug Fixes',
  ui: '🎨 UI/UX Changes',
};

const AREA_LABELS = {
  finance: 'Finance',
  roster: 'Roster',
  schedule: 'Schedule',
  compliance: 'Compliance',
  admin: 'Admin',
  parent: 'Parent',
  general: 'General',
};

const AREA_STYLES = {
  finance: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400',
  roster: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
  schedule: 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400',
  compliance: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
  admin: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400',
  parent: 'bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-400',
  general: 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400',
};

const CATEGORY_STYLES = {
  feature: {
    bg: 'bg-emerald-50 dark:bg-emerald-900/20',
    border: 'border-emerald-200 dark:border-emerald-800',
    dot: 'bg-emerald-500',
  },
  improvement: {
    bg: 'bg-blue-50 dark:bg-blue-900/20',
    border: 'border-blue-200 dark:border-blue-800',
    dot: 'bg-blue-500',
  },
  bugfix: {
    bg: 'bg-amber-50 dark:bg-amber-900/20',
    border: 'border-amber-200 dark:border-amber-800',
    dot: 'bg-amber-500',
  },
  ui: {
    bg: 'bg-violet-50 dark:bg-violet-900/20',
    border: 'border-violet-200 dark:border-violet-800',
    dot: 'bg-violet-500',
  },
};

function groupByDate(entries) {
  const groups = {};
  for (const entry of entries) {
    const day = entry.commit_date.split('T')[0];
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
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showRawLog, setShowRawLog] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [activeArea, setActiveArea] = useState(null);

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from('changelogs')
        .select('*')
        .order('commit_date', { ascending: false })
        .limit(50);
      if (!error && data) setEntries(data);
      setLoading(false);
    }
    load();
  }, []);

  // Collect all AI summaries into one flat list grouped by category
  const allSummaryItems = entries
    .filter((e) => e.ai_summary && Array.isArray(e.ai_summary))
    .flatMap((e) => e.ai_summary);

  // Derive available areas from actual data (only show filter pills that have entries)
  const availableAreas = [...new Set(allSummaryItems.map((i) => i.area).filter(Boolean))].sort();

  const filteredItems = activeArea ? allSummaryItems.filter((i) => i.area === activeArea) : allSummaryItems;

  const categorized = {};
  for (const item of filteredItems) {
    const cat = item.category || 'improvement';
    if (!categorized[cat]) categorized[cat] = [];
    // Deduplicate by description
    if (!categorized[cat].some((existing) => existing.description === item.description)) {
      categorized[cat].push(item);
    }
  }

  const visible = showAll ? entries : entries.slice(0, 15);
  const grouped = groupByDate(visible);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
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
          <p className="text-[10px] text-slate-400 font-mono">{commitHash}</p>
          <p className="text-[10px] text-slate-400">
            {new Date(buildDate).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </p>
        </div>
      </div>

      {/* AI Summary Cards */}
      {allSummaryItems.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles size={14} className="text-amber-500" />
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
              What&apos;s Changed
            </p>
            <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
          </div>

          {/* Area filter pills */}
          {availableAreas.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setActiveArea(null)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold transition-colors ${activeArea === null ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
              >
                <Tag size={10} /> All
              </button>
              {availableAreas.map((area) => (
                <button
                  key={area}
                  onClick={() => setActiveArea(activeArea === area ? null : area)}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition-colors ${activeArea === area ? AREA_STYLES[area] + ' ring-1 ring-current' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
                >
                  {AREA_LABELS[area] || area}
                </button>
              ))}
            </div>
          )}

          {Object.keys(categorized).length > 0 ? (
            Object.entries(categorized).map(([category, items]) => {
              const style = CATEGORY_STYLES[category] || CATEGORY_STYLES.improvement;
              const label = CATEGORY_LABELS[category] || category;
              return (
                <div key={category} className={`rounded-xl border p-4 ${style.bg} ${style.border}`}>
                  <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-2">{label}</h3>
                  <ul className="space-y-1.5">
                    {items.map((item, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className={`w-1.5 h-1.5 rounded-full ${style.dot} mt-1.5 flex-shrink-0`} />
                        <div className="flex items-start gap-1.5 min-w-0">
                          <span className="text-sm text-slate-700 dark:text-slate-300">{item.description}</span>
                          {item.area && !activeArea && (
                            <span
                              className={`shrink-0 text-[9px] font-black px-1.5 py-0.5 rounded-full mt-0.5 ${AREA_STYLES[item.area] || AREA_STYLES.general}`}
                            >
                              {AREA_LABELS[item.area] || item.area}
                            </span>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })
          ) : (
            <p className="text-xs text-slate-400 italic py-2">No entries match this filter.</p>
          )}
        </div>
      )}

      {/* Raw commit log toggle */}
      <button
        onClick={() => setShowRawLog(!showRawLog)}
        className="flex items-center gap-1.5 text-xs font-bold text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
      >
        {showRawLog ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <GitCommit size={12} />
        Commit History ({entries.length})
      </button>

      {/* Timeline */}
      {showRawLog && (
        <div className="space-y-6">
          {grouped.map(([date, dayEntries]) => (
            <div key={date}>
              <div className="flex items-center gap-2 mb-2">
                <Calendar size={12} className="text-slate-400 dark:text-slate-500" />
                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                  {formatDate(date)}
                </p>
                <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
              </div>
              <div className="space-y-1 ml-1">
                {dayEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-start gap-3 px-3 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors group"
                  >
                    <GitCommit size={14} className="text-slate-300 dark:text-slate-600 mt-0.5 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-slate-800 dark:text-slate-200 leading-snug">{entry.commit_message}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <span className="text-[10px] text-slate-400 dark:text-slate-500">#{entry.build_number}</span>
                      <code className="text-[10px] font-mono text-slate-400 dark:text-slate-500">
                        {entry.commit_short}
                      </code>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {!showAll && entries.length > 15 && (
            <button
              onClick={() => setShowAll(true)}
              className="w-full flex items-center justify-center gap-1 py-2 text-xs font-bold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
            >
              <ChevronDown size={14} />
              Show {entries.length - 15} more
            </button>
          )}
        </div>
      )}

      {entries.length === 0 && !loading && (
        <p className="text-center text-sm text-slate-400 py-8">
          No changelog entries yet. They will appear after your next commit.
        </p>
      )}
    </div>
  );
}
