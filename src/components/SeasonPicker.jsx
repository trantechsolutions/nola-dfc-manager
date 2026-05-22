import { ChevronDown } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

export default function SeasonPicker({ seasons = [], selectedSeason, onSeasonChange, compact = false }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  if (seasons.length === 0) return null;

  const sizeClasses = compact ? 'text-xs px-3 py-1.5' : 'text-sm px-4 py-2';

  return (
    <div className={`flex items-center gap-2 ${compact ? '' : 'mb-4'}`}>
      <div ref={ref} className={`relative ${open ? 'z-[60]' : ''}`}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={`flex items-center gap-2 font-semibold bg-muted text-foreground border border-border rounded-lg cursor-pointer hover:bg-muted/80 transition-colors focus:outline-none focus:ring-2 focus:ring-ring ${sizeClasses}`}
        >
          <span>{selectedSeason}</span>
          <ChevronDown
            size={compact ? 12 : 14}
            className={`text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </button>
        {open && (
          <div className="absolute left-0 top-full mt-1 bg-card rounded-lg border border-border shadow-md overflow-hidden max-h-60 overflow-y-auto min-w-full">
            {seasons.map((s) => {
              const isSelected = s.id === selectedSeason;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    onSeasonChange(s.id);
                    setOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 text-sm font-semibold whitespace-nowrap transition-colors ${
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
    </div>
  );
}
