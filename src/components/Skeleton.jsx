/**
 * Reusable skeleton loading components.
 * Use these instead of "LOADING..." text for better UX.
 */

export function SkeletonLine({ width = 'w-full', height = 'h-4', className = '' }) {
  return <div className={`${width} ${height} bg-slate-200 dark:bg-slate-700 rounded-lg animate-pulse ${className}`} />;
}

export function SkeletonCard({ className = '' }) {
  return (
    <div
      className={`bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 space-y-3 ${className}`}
    >
      <SkeletonLine width="w-1/3" height="h-3" />
      <SkeletonLine width="w-2/3" height="h-6" />
      <SkeletonLine width="w-1/2" height="h-3" />
    </div>
  );
}

export function SkeletonRow({ className = '' }) {
  return (
    <div className={`flex items-center gap-3 p-3 ${className}`}>
      <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 animate-pulse shrink-0" />
      <div className="flex-1 space-y-2">
        <SkeletonLine width="w-1/3" height="h-3" />
        <SkeletonLine width="w-1/2" height="h-2" />
      </div>
      <SkeletonLine width="w-16" height="h-4" />
    </div>
  );
}

export function SkeletonDashboard() {
  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
      {/* Content area */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 space-y-3">
          <SkeletonLine width="w-1/4" height="h-4" />
          <SkeletonLine width="w-full" height="h-3" />
          <SkeletonLine width="w-full" height="h-3" />
          <SkeletonLine width="w-3/4" height="h-3" />
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 space-y-3">
          <SkeletonLine width="w-1/4" height="h-4" />
          {[1, 2, 3].map((i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function SkeletonTable({ rows = 5 }) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
      <div className="p-4 border-b border-slate-100 dark:border-slate-800">
        <SkeletonLine width="w-1/4" height="h-4" />
      </div>
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {Array.from({ length: rows }).map((_, i) => (
          <SkeletonRow key={i} />
        ))}
      </div>
    </div>
  );
}

export function SkeletonParentView() {
  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      {/* Player card */}
      <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-white/10 animate-pulse" />
          <div className="space-y-2">
            <SkeletonLine width="w-40" height="h-5" className="bg-white/20" />
            <SkeletonLine width="w-24" height="h-3" className="bg-white/10" />
          </div>
        </div>
      </div>
      {/* Balance */}
      <SkeletonCard />
      {/* Content */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </div>
  );
}
