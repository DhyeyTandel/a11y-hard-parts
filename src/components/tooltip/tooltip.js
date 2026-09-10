import { Keys } from '../../utils/keys.js';
import { ensureId, setDefault, emit } from '../../utils/dom.js';

/**
 * Tooltip — WCAG 2.1 SC 1.4.13, "Content on Hover or Focus".
 *
 * Like toasts, this has no APG pattern, and like toasts almost every
 * implementation fails the same three requirements. 1.4.13 says that content
 * which appears on hover or focus must be:
 *
 *  1. **Dismissible** — Escape hides it *without moving the pointer or focus*.
 *     A tooltip that can only be dismissed by moving away can permanently
 *     obscure the content underneath for a screen-magnifier user, who may be
 *     looking at a 4x zoom of the exact region the tooltip is covering.
 *  2. **Hoverable** — the pointer can travel onto the tooltip and it stays.
 *     This is why hiding on `mouseleave` with no grace period fails: the
 *     tooltip vanishes as the pointer crosses the gap, so a magnifier user can
 *     never read a tooltip longer than their viewport.
 *  3. **Persistent** — it stays until dismissed, until hover and focus are
 *     both gone, or until it stops being valid. No auto-hide timer.
 *
 * Two more things that are not in 1.4.13 but matter as much:
 *
 *  - **Never the `title` attribute.** It cannot be styled, it appears after an
 *    uncontrollable delay, most screen readers treat it inconsistently, and on
 *    touch it does not appear at all.
 *  - **Never anything interactive inside.** A tooltip is not focusable, so a
 *    link or button in one is unreachable by keyboard. If it needs interaction,
 *    it is a popover or a dialog, not a tooltip.
 *
 * Expected markup:
 *
 *   <span data-a11y-tooltip>
 *     <button data-a11y-tooltip-trigger>Save</button>
 *     <span data-a11y-tooltip-content>Saves to your drafts</span>
 *   </span>
 */
export class Tooltip {
  /**
   * @param {Element} root
   * @param {object} [options]
   * @param {number} [options.showDelay=400] ms before a hover opens it. Focus
   *   is always immediate — a keyboard user has already committed.
   * @param {number} [options.hideDelay=200] grace period so the pointer can
   *   travel from the trigger onto the tooltip.
   * @param {'describes'|'labels'} [options.relationship='describes']
   */
  constructor(root, options = {}) {
    this.root = root;
    this.options = { showDelay: 400, hideDelay: 200, relationship: 'describes', ...options };

    this.trigger = root.querySelector('[data-a11y-tooltip-trigger]');
    this.content = root.querySelector('[data-a11y-tooltip-content]');
    if (!this.trigger || !this.content) {
      throw new Error('[Tooltip] Requires [data-a11y-tooltip-trigger] and [data-a11y-tooltip-content].');
    }

    this.visible = false;
    /** Set by Escape; blocks re-showing until hover and focus have both left. */
    this.dismissed = false;
    this.showTimer = null;
    this.hideTimer = null;

    this._applyStaticAria();
    this._bindEvents();
  }

  _applyStaticAria() {
    const { trigger, content } = this;

    setDefault(content, 'role', 'tooltip');
    const id = ensureId(content, 'tooltip');

    // aria-describedby is nearly always right: the trigger already has a name
    // and the tooltip adds detail. Use aria-labelledby only for an icon-only
    // control with no other accessible name — using both gives the element two
    // competing names.
    const relation = this.options.relationship === 'labels' ? 'aria-labelledby' : 'aria-describedby';
    const existing = trigger.getAttribute(relation);
    if (!existing?.split(/\s+/).includes(id)) {
      trigger.setAttribute(relation, existing ? `${existing} ${id}` : id);
    }

    if (trigger.hasAttribute('title')) {
      console.warn(
        '[Tooltip] The trigger also has a title attribute, which will produce a ' +
          'second, native tooltip and a duplicated description. Remove it.',
        trigger,
      );
      trigger.removeAttribute('title');
    }

    const interactive = content.querySelector('a[href], button, input, select, textarea, [tabindex]');
    if (interactive) {
      console.warn(
        '[Tooltip] The tooltip contains interactive content, which is ' +
          'unreachable by keyboard because a tooltip is not focusable. Use a ' +
          'popover or a dialog instead.',
        interactive,
      );
    }

    // The trigger must be focusable, or keyboard users never see this at all.
    if (this.trigger.tabIndex < 0) {
      console.warn(
        '[Tooltip] The trigger is not focusable, so the tooltip is ' +
          'mouse-only. Use a button, or add tabindex="0".',
        trigger,
      );
    }

    content.hidden = true;
  }

  _bindEvents() {
    const { trigger, content, root } = this;

    trigger.addEventListener('pointerenter', () => this._scheduleShow(this.options.showDelay));
    trigger.addEventListener('pointerleave', () => this._scheduleHide());
    // Focus opens immediately and with no dismissal memory reset delay: a
    // keyboard user asked for this explicitly by landing on the control.
    trigger.addEventListener('focus', () => { this.dismissed = false; this.show(); });
    trigger.addEventListener('blur', () => this.hide());

    // Requirement 2: the pointer can rest on the tooltip itself.
    content.addEventListener('pointerenter', () => clearTimeout(this.hideTimer));
    content.addEventListener('pointerleave', () => this._scheduleHide());

    // Requirement 1: Escape dismisses without moving pointer or focus. The
    // listener is on the document because the pointer may be over the trigger
    // while focus is somewhere else entirely.
    this._onDocumentKeydown = (event) => {
      if (event.key !== Keys.Escape || !this.visible) return;
      event.stopPropagation();
      this.dismissed = true;
      this.hide({ immediate: true });
    };
    document.addEventListener('keydown', this._onDocumentKeydown, true);

    // Once the pointer has left the whole widget, a later hover may show it
    // again — the dismissal applied to that one appearance.
    root.addEventListener('pointerleave', () => { this.dismissed = false; });
  }

  _scheduleShow(delay) {
    if (this.dismissed) return;
    clearTimeout(this.hideTimer);
    clearTimeout(this.showTimer);
    this.showTimer = setTimeout(() => this.show(), delay);
  }

  _scheduleHide() {
    clearTimeout(this.showTimer);
    clearTimeout(this.hideTimer);
    // Deliberately not immediate: the gap between trigger and tooltip must be
    // crossable. See requirement 2.
    this.hideTimer = setTimeout(() => this.hide(), this.options.hideDelay);
  }

  show() {
    clearTimeout(this.showTimer);
    if (this.visible || this.dismissed) return this;
    this.visible = true;
    this.content.hidden = false;
    this._position();
    emit(this.root, 'a11y-tooltip:show', { tooltip: this });
    return this;
  }

  hide({ immediate = false } = {}) {
    if (immediate) clearTimeout(this.hideTimer);
    clearTimeout(this.showTimer);
    if (!this.visible) return this;

    // Never hide while the pointer is still on the trigger or the tooltip, or
    // while the trigger has focus — requirement 3.
    if (!immediate && (this.root.matches(':hover') || this.trigger.matches(':focus'))) return this;

    this.visible = false;
    this.content.hidden = true;
    this.content.removeAttribute('data-placement');
    emit(this.root, 'a11y-tooltip:hide', { tooltip: this });
    return this;
  }

  /** Flip below the trigger when there is no room above. */
  _position() {
    this.content.dataset.placement = 'top';
    const rect = this.content.getBoundingClientRect();
    if (rect.top < 8) this.content.dataset.placement = 'bottom';
  }

  destroy() {
    document.removeEventListener('keydown', this._onDocumentKeydown, true);
    clearTimeout(this.showTimer);
    clearTimeout(this.hideTimer);
  }
}

export function initTooltips(scope = document) {
  return Array.from(scope.querySelectorAll('[data-a11y-tooltip]')).map(
    (root) =>
      new Tooltip(root, {
        relationship: root.dataset.a11yTooltipRelationship === 'labels' ? 'labels' : 'describes',
      }),
  );
}
