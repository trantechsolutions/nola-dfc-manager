import { createContext, useContext, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useT } from '../../i18n/I18nContext';
import { useCompactViewport } from '../../hooks/useCompactViewport';
import { useHistoryDismiss } from '../../hooks/useHistoryDismiss';
import { useRegisterScreenPanel } from '../../hooks/useScreenPanel';
import { useIsRouteOwnedPanel } from './PanelHost';

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

// The card presentation never goes full-bleed, so its widths apply at every
// size rather than from the breakpoint up.
const CARD_SIZES = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '3xl': 'max-w-3xl',
};

const ModalContext = createContext({ compact: false, card: false, onClose: undefined });

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
 *
 * `fullScreen={false}` opts out of the phone presentation and keeps the centred
 * card at every width. Reserve it for alerts — a yes/no confirm is not a screen
 * you navigated to, and giving it a back chevron and a history entry would
 * misrepresent it.
 *
 * `dismissOnBackdrop` is opt-in because most panels here hold a half-filled
 * form, and a stray click outside it should not throw the work away. Only the
 * panels that already behaved that way before pass it.
 *
 * On a phone the panel is a screen rather than a dialog, and the difference is
 * more than how it looks. AppShell hides the app behind it, so there is no page
 * to lock and nothing left in the accessibility tree to wander into; the panel
 * drops `role="dialog"`/`aria-modal` (nothing is layered over anything), takes
 * focus so a screen reader announces the arrival, and hands focus back to
 * whatever opened it on the way out. As a card on a desktop it stays a dialog,
 * because there it genuinely is one.
 */
export default function ResponsiveModal({
  open = true,
  onClose,
  size = 'lg',
  as = 'div',
  fullScreen = true,
  dismissOnBackdrop = false,
  className,
  overlayClassName,
  children,
  ...rest
}) {
  const Tag = as;
  const card = !fullScreen;
  const compact = useCompactViewport() && fullScreen;

  // "Screen" is the phone presentation actually on screen — the two differ
  // while the panel is closed, and half the behaviour below keys off that.
  const screen = open && compact;

  // A panel inside a PanelHost was opened by a URL change, which already left
  // an entry on the stack — claiming a second one would make Back need two
  // presses to get out of one panel.
  const routeOwned = useIsRouteOwnedPanel();

  // Only the full-screen presentation claims a history entry. As a centred
  // card the panel is plainly an overlay, and hijacking Back there would
  // surprise anyone using it to leave the page.
  useHistoryDismiss(open && compact && !routeOwned, onClose);

  // Tells AppShell to stand down while this is presenting as a screen.
  useRegisterScreenPanel(screen);

  // Lock the page behind the panel so a scroll gesture that runs past the end
  // of the panel doesn't start moving the list underneath it. A screen has no
  // page behind it to lock — the shell is hidden, not covered.
  useEffect(() => (open && !screen ? lockPageScroll() : undefined), [open, screen]);

  // A screen is arrived at, not layered over: focus moves into it the way it
  // would on any navigation, and returns to whatever opened it on the way out.
  // As a card the panel is a dialog the browser already treats as a layer, and
  // moving focus for it is not this component's job.
  const panelRef = useRef(null);
  const returnFocusTo = useRef(null);
  useEffect(() => {
    if (!screen) return undefined;
    returnFocusTo.current = document.activeElement;
    panelRef.current?.focus({ preventScroll: true });

    return () => {
      const target = returnFocusTo.current;
      returnFocusTo.current = null;
      // Only if it is still on the page — the list that opened the panel may
      // have re-rendered the row out from under it while the panel was up.
      if (target?.isConnected) target.focus({ preventScroll: true });
    };
  }, [screen]);

  useEffect(() => {
    if (!open || !onClose) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  // Full-screen there is no backdrop to click, so this only ever applies to
  // the card presentation.
  const onBackdropClick =
    dismissOnBackdrop && onClose && !compact
      ? (e) => (e.target === e.currentTarget ? onClose() : undefined)
      : undefined;

  // Rendered against the body rather than in place. A screen has to sit outside
  // the shell it replaces — AppShell hides its own subtree, and a panel still
  // inside that subtree would go with it.
  return createPortal(
    <div
      onClick={onBackdropClick}
      className={cn(
        // z-1050 clears the AdminLTE shell chrome, which sits in the 1030s —
        // below it the sticky header eats the panel's own header and the mobile
        // tab bar covers the footer, taking the Save button with it.
        // See the stacking table in index.css.
        'fixed inset-0 z-[1050] flex bg-card',
        card
          ? 'items-center justify-center bg-black/60 p-4 backdrop-blur-sm'
          : 'md:items-center md:justify-center md:bg-black/60 md:p-4 md:backdrop-blur-sm',
        overlayClassName,
      )}
    >
      <ModalContext.Provider value={{ compact, card, onClose }}>
        <Tag
          ref={panelRef}
          // A screen is the page, not a layer over it — calling it a dialog
          // would tell a screen reader there is something behind to go back to.
          role={screen ? undefined : 'dialog'}
          aria-modal={screen ? undefined : 'true'}
          tabIndex={screen ? -1 : undefined}
          className={cn(
            'relative flex w-full flex-col overflow-hidden bg-card',
            card
              ? 'h-auto max-h-[90vh] rounded-lg shadow-md'
              : 'h-full md:h-auto md:max-h-[90vh] md:rounded-lg md:shadow-md',
            (card ? CARD_SIZES[size] : SIZES[size]) ?? (card ? CARD_SIZES.lg : SIZES.lg),
            className,
          )}
          {...rest}
        >
          {children}
        </Tag>
      </ModalContext.Provider>
    </div>,
    document.body,
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
  const { compact, card, onClose } = useContext(ModalContext);
  const { t } = useT();

  return (
    <div
      // Full-screen, the header is the topmost thing on the display — under a
      // notch or the iOS status bar without this.
      style={compact ? { paddingTop: 'max(0.75rem, env(safe-area-inset-top))' } : undefined}
      className={cn(
        'flex shrink-0 items-center gap-3',
        card ? 'px-6 pb-4 pt-4' : 'px-4 pb-3 md:px-6 md:pb-4 md:pt-4',
        className,
      )}
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
  const { card } = useContext(ModalContext);
  return (
    <div className={cn('min-h-0 flex-1 overflow-y-auto custom-scrollbar', card ? 'p-6' : 'p-4 md:p-6', className)}>
      {children}
    </div>
  );
}

/**
 * Footer — the action row. Pinned to the bottom edge rather than living at the
 * end of the scroll, which is the whole reason Save was hard to reach on a
 * phone. Padded past the home indicator on gesture-nav devices.
 */
function ModalFooter({ children, className }) {
  const { card } = useContext(ModalContext);
  return (
    <div
      style={{ paddingBottom: card ? undefined : 'max(0.75rem, env(safe-area-inset-bottom))' }}
      className={cn(
        'flex shrink-0 flex-wrap items-center justify-end gap-3 border-t border-border bg-card',
        card ? 'px-6 py-4' : 'px-4 pt-3 md:px-6 md:pt-4',
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
