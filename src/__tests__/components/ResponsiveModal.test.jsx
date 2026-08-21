import { StrictMode } from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';

import { I18nProvider } from '../../i18n/I18nContext';
import ResponsiveModal from '../../components/layout/ResponsiveModal';
import PanelHost from '../../components/layout/PanelHost';
import { resetScreenPanels, useScreenPanelActive } from '../../hooks/useScreenPanel';

const originalMatchMedia = window.matchMedia;

/** Swap in a matchMedia whose `matches` we control, mimicking a breakpoint. */
function setViewport(isDesktop) {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: isDesktop,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

const renderModal = (props = {}) => {
  const onClose = props.onClose ?? vi.fn();
  const view = render(
    <I18nProvider>
      <ResponsiveModal onClose={onClose} {...props}>
        <ResponsiveModal.Header>
          <h3>Edit player</h3>
        </ResponsiveModal.Header>
        <ResponsiveModal.Body>fields</ResponsiveModal.Body>
        <ResponsiveModal.Footer>
          <button type="button">Save</button>
        </ResponsiveModal.Footer>
      </ResponsiveModal>
    </I18nProvider>,
  );
  return { onClose, ...view };
};

/**
 * The panel's outermost node — the one the portal put straight under <body>,
 * which is the backdrop in the card presentation. Walked up to from content
 * rather than matched on a class, so it survives styling changes.
 */
function overlay() {
  let node = screen.getByText('fields');
  while (node.parentElement && node.parentElement !== document.body) node = node.parentElement;
  return node;
}

/** A hardware Back press, minus jsdom's asynchronous history unwind. */
const pressBack = () => act(() => void window.dispatchEvent(new PopStateEvent('popstate')));

describe('ResponsiveModal', () => {
  beforeEach(async () => {
    localStorage.clear();
    // Before rather than after: Testing Library's own cleanup unmounts panels
    // in its afterEach, and whether that lands before or after ours is not
    // something this file should depend on.
    resetScreenPanels();
    const i18n = (await import('../../i18n/config')).default;
    await act(async () => {
      await i18n.changeLanguage('en');
    });
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  describe('on a wide viewport', () => {
    beforeEach(() => setViewport(true));

    it('dismisses with a close control rather than a back control', () => {
      renderModal();
      expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
    });

    it('leaves history alone, so Back still leaves the page', () => {
      const before = window.history.length;
      const { onClose } = renderModal();
      expect(window.history.length).toBe(before);

      pressBack();
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe('on a narrow viewport', () => {
    beforeEach(() => setViewport(false));

    it('dismisses with a back control rather than a close control', () => {
      renderModal();
      expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
    });

    it('closes on Back instead of navigating away', () => {
      const { onClose } = renderModal();
      pressBack();
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    // StrictMode mounts effects, tears them down, and mounts them again. A
    // panel that retracted its history entry on teardown left the browser
    // popping an entry the remounted panel was already using, and the panel
    // read its own retraction as a Back press — it closed the instant it
    // opened. jsdom traverses history synchronously and so never delivers that
    // popstate, which is why this asserts the mechanism rather than the
    // symptom: the entry is reclaimed, so nothing is retracted while a panel
    // is still on screen, and only one entry is ever outstanding.
    it('reclaims its history entry when StrictMode remounts its effects', async () => {
      const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
      const pushState = vi.spyOn(window.history, 'pushState');
      const onClose = vi.fn();

      render(
        <StrictMode>
          <I18nProvider>
            <ResponsiveModal onClose={onClose}>
              <ResponsiveModal.Body>fields</ResponsiveModal.Body>
            </ResponsiveModal>
          </I18nProvider>
        </StrictMode>,
      );

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      expect(back).not.toHaveBeenCalled();
      expect(pushState).toHaveBeenCalledTimes(1);
      expect(onClose).not.toHaveBeenCalled();
      expect(screen.getByText('fields')).toBeInTheDocument();

      back.mockRestore();
      pushState.mockRestore();
    });

    it('hands a single Back press to the topmost panel only', () => {
      const onOuterClose = vi.fn();
      const onInnerClose = vi.fn();

      render(
        <I18nProvider>
          <ResponsiveModal onClose={onOuterClose}>
            <ResponsiveModal.Body>detail</ResponsiveModal.Body>
          </ResponsiveModal>
          <ResponsiveModal onClose={onInnerClose}>
            <ResponsiveModal.Body>form</ResponsiveModal.Body>
          </ResponsiveModal>
        </I18nProvider>,
      );

      pressBack();
      expect(onInnerClose).toHaveBeenCalledTimes(1);
      expect(onOuterClose).not.toHaveBeenCalled();

      pressBack();
      expect(onOuterClose).toHaveBeenCalledTimes(1);
    });
  });

  // `fullScreen={false}` is what an alert opts into: no back chevron, no
  // history entry, the same centred card at every width.
  describe('as a card on a narrow viewport', () => {
    beforeEach(() => setViewport(false));

    it('keeps the close control rather than swapping in a back control', () => {
      renderModal({ fullScreen: false });
      expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
    });

    it('leaves history alone, so Back still leaves the page', () => {
      const pushState = vi.spyOn(window.history, 'pushState');
      const { onClose } = renderModal({ fullScreen: false });

      expect(pushState).not.toHaveBeenCalled();
      pressBack();
      expect(onClose).not.toHaveBeenCalled();

      pushState.mockRestore();
    });
  });

  // A route-driven panel already has a history entry: opening it pushed a
  // location. PanelHost is how ResponsiveModal is told not to add a second one.
  describe('inside a PanelHost', () => {
    beforeEach(() => setViewport(false));

    it('leaves the history entry to the route that opened it', () => {
      const pushState = vi.spyOn(window.history, 'pushState');

      render(
        <I18nProvider>
          <PanelHost>
            <ResponsiveModal onClose={vi.fn()}>
              <ResponsiveModal.Body>fields</ResponsiveModal.Body>
            </ResponsiveModal>
          </PanelHost>
        </I18nProvider>,
      );

      expect(pushState).not.toHaveBeenCalled();
      pushState.mockRestore();
    });

    it('does not close itself on Back — the route below it does that', () => {
      const onClose = vi.fn();

      render(
        <I18nProvider>
          <PanelHost>
            <ResponsiveModal onClose={onClose}>
              <ResponsiveModal.Body>fields</ResponsiveModal.Body>
            </ResponsiveModal>
          </PanelHost>
        </I18nProvider>,
      );

      pressBack();
      expect(onClose).not.toHaveBeenCalled();
    });

    it('still presents as a full screen, back chevron and all', () => {
      render(
        <I18nProvider>
          <PanelHost>
            <ResponsiveModal onClose={vi.fn()}>
              <ResponsiveModal.Header>
                <h3>Edit player</h3>
              </ResponsiveModal.Header>
              <ResponsiveModal.Body>fields</ResponsiveModal.Body>
            </ResponsiveModal>
          </PanelHost>
        </I18nProvider>,
      );

      expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
    });
  });

  describe('backdrop dismissal', () => {
    beforeEach(() => setViewport(true));

    it('is off by default, so a stray click cannot discard a half-filled form', () => {
      const { onClose } = renderModal();
      fireEvent.click(overlay());
      expect(onClose).not.toHaveBeenCalled();
    });

    it('closes on a backdrop click when opted in', () => {
      const { onClose } = renderModal({ dismissOnBackdrop: true });
      fireEvent.click(overlay());
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('ignores clicks that started inside the panel', () => {
      const { onClose } = renderModal({ dismissOnBackdrop: true });
      fireEvent.click(screen.getByText('fields'));
      expect(onClose).not.toHaveBeenCalled();
    });

    it('does nothing full-screen, where there is no backdrop to click', () => {
      setViewport(false);
      const { onClose } = renderModal({ dismissOnBackdrop: true });
      fireEvent.click(overlay());
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  // The phone presentation is a screen, not an overlay: nothing is layered over
  // anything, so it neither claims dialog semantics nor locks a page behind it.
  describe('as a screen on a narrow viewport', () => {
    beforeEach(() => setViewport(false));

    it('is not announced as a dialog — it is the page', () => {
      renderModal();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('takes focus, the way arriving on a screen does', () => {
      renderModal();
      expect(screen.getByText('fields').closest('[tabindex="-1"]')).toBe(document.activeElement);
    });

    it('hands focus back to whatever opened it', () => {
      const opener = document.createElement('button');
      document.body.appendChild(opener);
      opener.focus();

      const { unmount } = renderModal();
      expect(document.activeElement).not.toBe(opener);

      unmount();
      expect(document.activeElement).toBe(opener);

      opener.remove();
    });

    // The list that opened the panel may have re-rendered the row away while
    // the panel was up; restoring focus to a detached node throws it to <body>.
    it('does not chase an opener that has left the page', () => {
      const opener = document.createElement('button');
      document.body.appendChild(opener);
      opener.focus();

      const { unmount } = renderModal();
      opener.remove();

      expect(() => unmount()).not.toThrow();
    });

    it('leaves the page unlocked, having hidden the page rather than covered it', () => {
      renderModal();
      expect(document.body.style.overflow).not.toBe('hidden');
    });

    it('tells the shell it is presenting, and stops when it closes', () => {
      const Probe = () => <span data-testid="shell-standing-down">{String(useScreenPanelActive())}</span>;
      const { unmount } = render(
        <I18nProvider>
          <Probe />
          <ResponsiveModal onClose={vi.fn()}>
            <ResponsiveModal.Body>fields</ResponsiveModal.Body>
          </ResponsiveModal>
        </I18nProvider>,
      );
      expect(screen.getByTestId('shell-standing-down')).toHaveTextContent('true');

      unmount();

      render(
        <I18nProvider>
          <Probe />
        </I18nProvider>,
      );
      expect(screen.getByTestId('shell-standing-down')).toHaveTextContent('false');
    });
  });

  describe('as a card, which really is a dialog', () => {
    beforeEach(() => setViewport(true));

    it('keeps dialog semantics', () => {
      renderModal();
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
    });

    it('locks the page it is layered over', () => {
      renderModal();
      expect(document.body.style.overflow).toBe('hidden');
    });

    it('leaves the shell alone — it is an overlay, not a screen', () => {
      const Probe = () => <span data-testid="shell-standing-down">{String(useScreenPanelActive())}</span>;
      render(
        <I18nProvider>
          <Probe />
          <ResponsiveModal onClose={vi.fn()}>
            <ResponsiveModal.Body>fields</ResponsiveModal.Body>
          </ResponsiveModal>
        </I18nProvider>,
      );
      expect(screen.getByTestId('shell-standing-down')).toHaveTextContent('false');
    });
  });

  describe('page scroll lock', () => {
    beforeEach(() => setViewport(true));

    it('releases when the panel closes', () => {
      const { unmount } = renderModal();
      expect(document.body.style.overflow).toBe('hidden');

      unmount();
      expect(document.body.style.overflow).not.toBe('hidden');
    });

    it('survives a stacked panel closing before the one beneath it', () => {
      const { unmount } = render(
        <I18nProvider>
          <ResponsiveModal onClose={vi.fn()}>
            <ResponsiveModal.Body>detail</ResponsiveModal.Body>
          </ResponsiveModal>
          <ResponsiveModal onClose={vi.fn()}>
            <ResponsiveModal.Body>form</ResponsiveModal.Body>
          </ResponsiveModal>
        </I18nProvider>,
      );
      expect(document.body.style.overflow).toBe('hidden');

      unmount();
      expect(document.body.style.overflow).not.toBe('hidden');
    });
  });
});
