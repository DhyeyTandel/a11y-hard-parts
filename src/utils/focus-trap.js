import { getTabbables, isFocusable, getActiveElement } from './focusable.js';
import { Keys } from './keys.js';

/**
 * A focus trap.
 *
 * Three mechanisms, because any one of them alone has a hole:
 *
 *  1. `inert` on the background (applied by the caller, e.g. Dialog). This is
 *     the primary mechanism and the only one that also hides the background
 *     from the screen reader's virtual cursor.
 *
 *  2. A Tab/Shift+Tab keydown handler that wraps at the edges. Needed because
 *     `inert` still lets Tab move focus out of the *document* into browser
 *     chrome (address bar, tab strip) and back in at the top of the page.
 *
 *  3. A `focusin` backstop. Needed because focus can move without a Tab
 *     keypress at all: a click on a still-focusable element, a script calling
 *     `.focus()`, an autofocusing embed, or focus returning from browser
 *     chrome. Without this, traps built only on keydown are trivially escaped.
 *
 * Only the topmost trap on the stack responds, so nested dialogs behave.
 */

/** @type {FocusTrap[]} */
const stack = [];

export class FocusTrap {
  /**
   * @param {Element} container
   * @param {object} [options]
   * @param {Element|string|(() => Element)} [options.initialFocus]
   *   Where focus goes on activate. Defaults to `[autofocus]`, then the first
   *   tabbable element, then the container itself.
   * @param {Element|string|(() => Element)|false} [options.returnFocus]
   *   Where focus goes on deactivate. Defaults to whatever had focus at
   *   activation time. `false` disables restoration.
   * @param {Element|string|(() => Element)} [options.fallbackFocus]
   *   Used when the return target has been removed from the DOM.
   * @param {(event: KeyboardEvent) => void} [options.onEscape]
   */
  constructor(container, options = {}) {
    this.container = container;
    this.options = options;
    this.active = false;

    /** @type {Element|null} */
    this.previouslyFocused = null;
    this.restoreInert = null;

    this._onKeydown = this._onKeydown.bind(this);
    this._onFocusIn = this._onFocusIn.bind(this);
  }

  get isTopmost() {
    return stack[stack.length - 1] === this;
  }

  activate() {
    if (this.active) return this;
    this.active = true;

    this.previouslyFocused = getActiveElement();
    stack.push(this);

    // Capture phase so the trap sees the event before page-level handlers, and
    // before anything can stop propagation.
    document.addEventListener('keydown', this._onKeydown, true);
    document.addEventListener('focusin', this._onFocusIn, true);

    this._focusInitial();
    return this;
  }

  deactivate() {
    if (!this.active) return this;
    this.active = false;

    const index = stack.indexOf(this);
    if (index !== -1) stack.splice(index, 1);

    document.removeEventListener('keydown', this._onKeydown, true);
    document.removeEventListener('focusin', this._onFocusIn, true);

    this._restoreFocus();
    return this;
  }

  /** Recompute the tab cycle. Content inside a dialog changes; cache nothing. */
  getTabbables() {
    return getTabbables(this.container);
  }

  _resolve(target) {
    if (!target) return null;
    if (typeof target === 'function') return target();
    if (typeof target === 'string') return this.container.querySelector(target);
    return target;
  }

  _focusInitial() {
    const explicit = this._resolve(this.options.initialFocus);
    if (explicit && isFocusable(explicit)) {
      explicit.focus();
      return;
    }

    const autofocus = this.container.querySelector('[autofocus]');
    if (autofocus && isFocusable(autofocus)) {
      autofocus.focus();
      return;
    }

    const [first] = this.getTabbables();
    if (first) {
      first.focus();
      return;
    }

    // Nothing tabbable inside: focus the container itself so the screen reader
    // lands on the dialog and reads its accessible name. The container must
    // carry tabindex="-1" for this; assert loudly rather than silently
    // leaving focus on the (now inert) background.
    if (this.container.tabIndex < 0 || this.container.tabIndex === 0) {
      this.container.focus();
    }
    if (!this.container.contains(getActiveElement())) {
      console.warn(
        '[FocusTrap] Container has no tabbable content and could not receive ' +
          'focus. Add tabindex="-1" to the trap container.',
        this.container,
      );
    }
  }

  _restoreFocus() {
    if (this.options.returnFocus === false) return;

    const explicit = this._resolve(this.options.returnFocus);
    const candidates = [explicit, this.previouslyFocused, this._resolve(this.options.fallbackFocus)];

    for (const candidate of candidates) {
      // `isConnected` matters: the trigger may have been removed while the
      // dialog was open (deleted a row, then closed the confirm dialog).
      if (candidate && candidate.isConnected && isFocusable(candidate)) {
        candidate.focus();
        return;
      }
    }

    // Last resort. Focusing <body> is not great — the virtual cursor jumps to
    // the top of the page — but it beats leaving focus on a detached node,
    // which drops the user into a completely unnavigable state.
    document.body.focus?.();
  }

  _onKeydown(event) {
    if (!this.isTopmost) return;

    if (event.key === Keys.Escape && this.options.onEscape) {
      this.options.onEscape(event);
      return;
    }

    if (event.key !== Keys.Tab) return;

    const tabbables = this.getTabbables();

    if (tabbables.length === 0) {
      // Nothing to tab to: pin focus to the container rather than letting Tab
      // walk out into the background.
      event.preventDefault();
      this.container.focus();
      return;
    }

    const first = tabbables[0];
    const last = tabbables[tabbables.length - 1];
    const active = getActiveElement();

    if (event.shiftKey) {
      if (active === first || !this.container.contains(active)) {
        event.preventDefault();
        last.focus();
      }
      return;
    }

    if (active === last || !this.container.contains(active)) {
      event.preventDefault();
      first.focus();
    }
  }

  _onFocusIn(event) {
    if (!this.isTopmost) return;
    if (this.container.contains(event.target)) return;
    // Focus escaped by some route other than Tab. Pull it back.
    event.stopPropagation();
    this._focusInitial();
  }
}

/** Test seam: the live trap stack. */
export function getTrapStack() {
  return stack;
}
