import { FocusTrap } from '../../utils/focus-trap.js';
import { inertBackground } from '../../utils/inert.js';
import { lockScroll, unlockScroll } from '../../utils/scroll-lock.js';
import { ensureId, setDefault, emit } from '../../utils/dom.js';
import { Keys } from '../../utils/keys.js';

/**
 * Modal dialog — APG "Dialog (Modal)".
 *
 * Expected markup (the component adds the ARIA, so the HTML stays readable):
 *
 *   <div class="a11y-dialog" data-a11y-dialog hidden>
 *     <div class="a11y-dialog__backdrop" data-a11y-dialog-backdrop></div>
 *     <div class="a11y-dialog__panel" data-a11y-dialog-panel>
 *       <h2 data-a11y-dialog-title>Title</h2>
 *       ...
 *     </div>
 *   </div>
 *
 * Why not `<dialog showModal()>`? It is genuinely good now and gives you the
 * top layer, background inertness and Escape for free. Two reasons this
 * implementation exists anyway: it works identically wherever a `<div>` works
 * (including inside constrained stacking contexts where the top layer fights
 * your z-index), and the focus behaviour is explicit and testable rather than
 * being UA-defined. See README "Native <dialog>" for when to prefer the
 * platform element instead.
 */
export class Dialog {
  /**
   * @param {Element} root
   * @param {object} [options]
   * @param {boolean} [options.alert=false] Use role="alertdialog".
   * @param {boolean} [options.closeOnEscape=true]
   * @param {boolean} [options.closeOnBackdropClick=true]
   * @param {Element|string|(() => Element)} [options.initialFocus]
   * @param {Element|string|(() => Element)|false} [options.returnFocus]
   */
  constructor(root, options = {}) {
    this.root = root;
    this.options = {
      alert: false,
      closeOnEscape: true,
      closeOnBackdropClick: true,
      ...options,
    };

    this.panel = root.querySelector('[data-a11y-dialog-panel]') ?? root;
    this.backdrop = root.querySelector('[data-a11y-dialog-backdrop]');
    this.isOpen = false;
    this.restoreInert = null;
    /** @type {Element|null} */
    this.trigger = null;

    this._applyStaticAria();

    this.trap = new FocusTrap(this.panel, {
      initialFocus: this.options.initialFocus,
      fallbackFocus: () => document.body,
      onEscape: (event) => {
        if (!this.options.closeOnEscape) return;
        // Stop the keystroke here so one Escape closes one layer: without
        // this, Escape in a dialog opened from a combobox would close both.
        event.preventDefault();
        event.stopPropagation();
        this.close();
      },
    });

    this._onPointerDown = this._onPointerDown.bind(this);
    this._onClose = this._onClose.bind(this);

    root.addEventListener('pointerdown', this._onPointerDown);
    root.addEventListener('click', this._onClose);
  }

  _applyStaticAria() {
    const { panel } = this;

    setDefault(panel, 'role', this.options.alert ? 'alertdialog' : 'dialog');
    // aria-modal tells AT that the rest of the page is unavailable. It is a
    // hint only — the enforcement is `inert`, applied on open.
    setDefault(panel, 'aria-modal', 'true');
    // Needed so the trap can move focus here when the dialog holds no
    // tabbable content, and so the panel is a valid focus target.
    if (!panel.hasAttribute('tabindex')) panel.setAttribute('tabindex', '-1');

    const title = this.root.querySelector('[data-a11y-dialog-title]');
    if (title && !panel.hasAttribute('aria-labelledby') && !panel.hasAttribute('aria-label')) {
      panel.setAttribute('aria-labelledby', ensureId(title, 'dialog-title'));
    }
    if (!panel.hasAttribute('aria-labelledby') && !panel.hasAttribute('aria-label')) {
      console.warn(
        '[Dialog] No accessible name. Add [data-a11y-dialog-title], aria-label, ' +
          'or aria-labelledby — otherwise the dialog is announced as just "dialog".',
        this.root,
      );
    }

    const description = this.root.querySelector('[data-a11y-dialog-description]');
    if (description && !panel.hasAttribute('aria-describedby')) {
      panel.setAttribute('aria-describedby', ensureId(description, 'dialog-desc'));
    }

    if (this.backdrop) {
      // The backdrop is decoration. It must not appear in the a11y tree, and
      // it must not be a click target for keyboard users.
      setDefault(this.backdrop, 'aria-hidden', 'true');
    }

    this.root.hidden = true;
  }

  /**
   * @param {Element} [trigger] Element to restore focus to. Defaults to
   *   whatever had focus when `open()` was called.
   */
  open(trigger) {
    if (this.isOpen) return this;
    if (!emit(this.root, 'a11y-dialog:before-open', { dialog: this })) return this;

    this.trigger = trigger ?? null;
    this.trap.options.returnFocus = this.options.returnFocus ?? trigger ?? undefined;

    this.root.hidden = false;
    // Order matters: inert the background *before* trapping focus, so the
    // trap's tabbable scan already sees a background that cannot be reached.
    this.restoreInert = inertBackground(this.root);
    lockScroll();
    this.trap.activate();

    this.isOpen = true;
    emit(this.root, 'a11y-dialog:open', { dialog: this });
    return this;
  }

  close() {
    if (!this.isOpen) return this;
    if (!emit(this.root, 'a11y-dialog:before-close', { dialog: this })) return this;

    // Un-inert before restoring focus: the element we are focusing may be one
    // of the elements currently marked inert, and focusing an inert element
    // silently does nothing.
    this.restoreInert?.();
    this.restoreInert = null;
    this.root.hidden = true;
    unlockScroll();
    this.trap.deactivate();

    this.isOpen = false;
    this.trigger = null;
    emit(this.root, 'a11y-dialog:close', { dialog: this });
    return this;
  }

  toggle(trigger) {
    return this.isOpen ? this.close() : this.open(trigger);
  }

  destroy() {
    if (this.isOpen) this.close();
    this.root.removeEventListener('pointerdown', this._onPointerDown);
    this.root.removeEventListener('click', this._onClose);
  }

  _onPointerDown(event) {
    // Record where the gesture *started*. A drag that begins on a text
    // selection inside the panel and ends on the backdrop must not close the
    // dialog — a bug that silently destroys work.
    this._pointerDownTarget = event.target;
  }

  _onClose(event) {
    if (event.target.closest('[data-a11y-dialog-close]')) {
      this.close();
      return;
    }

    if (!this.options.closeOnBackdropClick) return;
    if (!this.backdrop) return;
    if (event.target !== this.backdrop) return;
    if (this._pointerDownTarget && this._pointerDownTarget !== this.backdrop) return;

    this.close();
  }
}

/**
 * Wire every `[data-a11y-dialog]` on the page and every
 * `[data-a11y-dialog-open="<id>"]` trigger.
 */
export function initDialogs(scope = document) {
  const dialogs = new Map();

  for (const root of scope.querySelectorAll('[data-a11y-dialog]')) {
    const options = {
      alert: root.hasAttribute('data-a11y-dialog-alert'),
      closeOnBackdropClick: root.dataset.a11yDialogBackdropClose !== 'false',
      closeOnEscape: root.dataset.a11yDialogEscapeClose !== 'false',
      initialFocus: root.dataset.a11yDialogInitialFocus || undefined,
    };
    dialogs.set(ensureId(root, 'dialog'), new Dialog(root, options));
  }

  scope.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-a11y-dialog-open]');
    if (!trigger) return;
    const dialog = dialogs.get(trigger.getAttribute('data-a11y-dialog-open'));
    dialog?.open(trigger);
  });

  return dialogs;
}

export { Keys };
