import { createContext, useContext, useEffect } from 'react';
import { ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useT } from '../../i18n/I18nContext';
import { useCompactViewport } from '../../hooks/useCompactViewport';
import { useHistoryDismiss } from '../../hooks/useHistoryDismiss';

// Desktop widths only — below the breakpoint every panel is the full viewport,
// so a max-width there would just letterbox it.
const SIZES = {
  sm: 'md:max-w-sm',
  md: 'md:max-w-md',
  lg: 'md:max-w-lg',
  xl: 'md:max-w-xl',
  '2xl': 'md:max-w-2xl',
  '3xl': 'md:max-w-3xl',
};

const ModalContext = createContext({ compact: false, onClose: undefined });

// Reference-counted rather than save-and-restore per panel. Sibling effects
// clean up in mount order, so two stacked panels each restoring the value they
// captured would hand the page back its locked state and leave it unscrollable.
let lockCount = 0;
let overflowBeforeLock = '';

function lockPageScroll() {
  if (lockCount === 0) {
    overflowBeforeLock = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  lockCount += 1;

  return () => {
    lockCount -= 1;
    if (lockCount === 0) document.body.style.overflow = overflowBeforeLock;
  };
}

/**
 * ResponsiveModal — one panel, two presentations.
 *
 * Desktop keeps the centred card this app has always used. Below the shell's
 * breakpoint the same panel fills the viewport as its own screen: a back
 * chevron instead of a close ✕, the action row pinned to the bottom edge
 * rather than scrolled off it, and a history entry so hardware Back dismisses
 * the panel instead of the app (see useHistoryDismiss).
 *
 * Compose it as Header / Body / Footer. Pass `as="form"` to make the panel
 * itself the form element — that is what lets a pinned Footer hold the submit
 * button while the fields scroll independently above it.
 */
export default function ResponsiveModal({
  open = true,
  onClose,
  size = 'lg',
  as = 'div',
  className,
  overlayClassName,
  children,
  ...rest
}) {
  const Tag = as;
  const compact = useCompactViewport();

  // Only the full-screen presentation claims a history entry. As a centred
  // card the panel is plainly an overlay, and hijacking Back there would
  // surprise anyone using it to leave the page.
  useHistoryDismiss(open && compact, onClose);

  // Lock the page behind the panel so a scroll gesture that runs past the end
  // of the panel doesn't start moving the list underneath it.
  useEffect(() => (open ? lockPageScroll() : undefined), [open]);

  useEffect(() => {
    if (!open || !onClose) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className={cn(
        // z-1050 clears the AdminLTE shell chrome, which sits in the 1030s —
        // below it the sticky header eats the panel's own header and the mobile
        // tab bar covers the footer, taking the Save button with it.
        // See the stacking table in index.css.
        'fixed inset-0 z-[1050] flex bg-card md:items-center md:justify-center md:bg-black/60 md:p-4 md:backdrop-blur-sm',
        overlayClassName,
      )}
    >
      <ModalContext.Provider value={{ compact, onClose }}>
        <Tag
          role="dialog"
          aria-modal="true"
          className={cn(
            'relative flex h-full w-full flex-col overflow-hidden bg-card md:h-auto md:max-h-[90vh] md:rounded-lg md:shadow-md',
            SIZES[size] ?? SIZES.lg,
            className,
          )}
          {...rest}
        >
          {children}
        </Tag>
      </ModalContext.Provider>
    </div>
  );
}

/**
 * Header — title area plus the dismiss control, which swaps shape with the
 * presentation: a leading back chevron on a full screen, a trailing ✕ on a
 * card. `actions` sits between the two on both.
 *
 * Colour it by passing the same classes the modal's old header carried; the
 * dismiss button inherits the text colour rather than assuming a light header.
 */
function ModalHeader({ children, className, actions, dismissible = true }) {
  const { compact, onClose } = useContext(ModalContext);
  const { t } = useT();

  return (
    <div
      // Full-screen, the header is the topmost thing on the display — under a
      // notch or the iOS status bar without this.
      style={compact ? { paddingTop: 'max(0.75rem, env(safe-area-inset-top))' } : undefined}
      className={cn('flex shrink-0 items-center gap-3 px-4 pb-3 md:px-6 md:pb-4 md:pt-4', className)}
    >
      {compact && dismissible && onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label={t('common.back')}
          className="-ml-1.5 shrink-0 rounded-lg p-1.5 opacity-70 transition-opacity hover:opacity-100"
        >
          <ChevronLeft size={22} />
        </button>
      )}

      <div className="min-w-0 flex-1">{children}</div>

      <div className="flex shrink-0 items-center gap-2">
        {actions}
        {!compact && dismissible && onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="text-xl font-semibold leading-none opacity-60 transition-opacity hover:opacity-100"
          >
            &times;
          </button>
        )}
      </div>
    </div>
  );
}

/** Body — the only scrolling region, so the header and footer stay put. */
function ModalBody({ children, className }) {
  return <div className={cn('min-h-0 flex-1 overflow-y-auto custom-scrollbar p-4 md:p-6', className)}>{children}</div>;
}

/**
 * Footer — the action row. Pinned to the bottom edge rather than living at the
 * end of the scroll, which is the whole reason Save was hard to reach on a
 * phone. Padded past the home indicator on gesture-nav devices.
 */
function ModalFooter({ children, className }) {
  return (
    <div
      style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
      className={cn(
        'flex shrink-0 flex-wrap items-center justify-end gap-3 border-t border-border bg-card px-4 pt-3 md:px-6 md:pt-4',
        className,
      )}
    >
      {children}
    </div>
  );
}

ResponsiveModal.Header = ModalHeader;
ResponsiveModal.Body = ModalBody;
ResponsiveModal.Footer = ModalFooter;
