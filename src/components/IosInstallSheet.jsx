import { Share, SquarePlus, X, Bell } from 'lucide-react';

/**
 * Walkthrough shown to iOS Safari users, who get no programmatic install
 * prompt. Framed around notifications because that is the capability they
 * actually unlock — iOS withholds Web Push until the app is on the Home Screen.
 */
export default function IosInstallSheet({ onClose }) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-end sm:items-center z-[300] p-4">
      <div className="bg-card rounded-lg p-6 w-full max-w-sm shadow-md animate-in fade-in slide-in-from-bottom duration-200">
        <div className="flex items-start gap-3 mb-5">
          <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center shrink-0">
            <Bell size={18} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-bold text-foreground">Install to get notifications</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              On iPhone and iPad, alerts only work once Cantera is on your Home Screen.
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-muted-foreground hover:text-foreground shrink-0">
            <X size={16} />
          </button>
        </div>

        <ol className="space-y-3">
          <li className="flex items-center gap-3">
            <span className="w-6 h-6 rounded-full bg-muted text-foreground text-xs font-bold flex items-center justify-center shrink-0">
              1
            </span>
            <span className="text-sm text-foreground flex items-center gap-1.5 flex-wrap">
              Tap the Share button
              <Share size={15} className="text-blue-500" />
              in Safari&apos;s toolbar
            </span>
          </li>
          <li className="flex items-center gap-3">
            <span className="w-6 h-6 rounded-full bg-muted text-foreground text-xs font-bold flex items-center justify-center shrink-0">
              2
            </span>
            <span className="text-sm text-foreground flex items-center gap-1.5 flex-wrap">
              Choose
              <SquarePlus size={15} className="text-blue-500" />
              <strong className="font-semibold">Add to Home Screen</strong>
            </span>
          </li>
          <li className="flex items-center gap-3">
            <span className="w-6 h-6 rounded-full bg-muted text-foreground text-xs font-bold flex items-center justify-center shrink-0">
              3
            </span>
            <span className="text-sm text-foreground">
              Open Cantera from your Home Screen, then enable notifications
            </span>
          </li>
        </ol>

        <button
          onClick={onClose}
          className="w-full mt-6 bg-muted hover:bg-muted/80 text-muted-foreground text-xs font-semibold py-2.5 px-3 rounded-lg transition-colors"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
