import { StrictMode } from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';

import { I18nProvider } from '../../i18n/I18nContext';
import ResponsiveModal from '../../components/layout/ResponsiveModal';

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

/** A hardware Back press, minus jsdom's asynchronous history unwind. */
const pressBack = () => act(() => void window.dispatchEvent(new PopStateEvent('popstate')));

describe('ResponsiveModal', () => {
  beforeEach(async () => {
    localStorage.clear();
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
