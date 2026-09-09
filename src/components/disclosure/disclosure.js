import { ensureId, setDefault, emit } from '../../utils/dom.js';

/**
 * Disclosure — APG "Disclosure (Show/Hide)".
 *
 * Deceptively simple, and still usually wrong. The three failures:
 *
 *  1. A `<div>` or `<a>` as the trigger. It must be a `<button>` (or have
 *     `role="button"` plus Enter/Space handling plus `tabindex`), because a
 *     link promises navigation and a div promises nothing at all.
 *  2. `aria-expanded` on the wrong element. It belongs on the *control*, not
 *     on the region being shown.
 *  3. `aria-hidden` used to hide the panel instead of `hidden`/`display:none`.
 *     That leaves the content in the tab order while hiding it from the screen
 *     reader — the worst of both worlds.
 *
 * There is deliberately no `aria-controls` requirement debate here: it is set,
 * because it costs nothing, but note that VoiceOver and most screen readers
 * do not expose a "jump to controlled element" affordance, so it is a hint
 * rather than a feature.
 */
export class Disclosure {
  /**
   * @param {Element} trigger a <button>
   * @param {object} [options]
   * @param {Element} [options.panel] defaults to `#${aria-controls}`
   * @param {boolean} [options.expanded=false]
   */
  constructor(trigger, options = {}) {
    this.trigger = trigger;
    this.options = options;

    const controls = trigger.getAttribute('aria-controls');
    this.panel =
      options.panel ??
      (controls ? document.getElementById(controls) : trigger.nextElementSibling);

    if (!this.panel) throw new Error('[Disclosure] No panel found.');

    if (trigger.tagName !== 'BUTTON' && trigger.getAttribute('role') !== 'button') {
      console.warn('[Disclosure] Trigger should be a <button>.', trigger);
    }
    if (trigger.tagName === 'BUTTON') setDefault(trigger, 'type', 'button');
    setDefault(trigger, 'aria-controls', ensureId(this.panel, 'disclosure-panel'));

    this.expanded = options.expanded ?? trigger.getAttribute('aria-expanded') === 'true';
    this._render();

    this._onClick = () => this.toggle();
    trigger.addEventListener('click', this._onClick);
    // No keydown handler: a real <button> already fires click on Enter and
    // Space. Adding one causes double activation.
  }

  _render() {
    this.trigger.setAttribute('aria-expanded', String(this.expanded));
    this.panel.hidden = !this.expanded;
  }

  open() {
    if (this.expanded) return this;
    this.expanded = true;
    this._render();
    emit(this.trigger, 'a11y-disclosure:change', { expanded: true, disclosure: this });
    return this;
  }

  close() {
    if (!this.expanded) return this;
    this.expanded = false;
    this._render();
    emit(this.trigger, 'a11y-disclosure:change', { expanded: false, disclosure: this });
    return this;
  }

  toggle() {
    return this.expanded ? this.close() : this.open();
  }

  destroy() {
    this.trigger.removeEventListener('click', this._onClick);
  }
}

export function initDisclosures(scope = document) {
  return Array.from(scope.querySelectorAll('[data-a11y-disclosure]')).map(
    (trigger) => new Disclosure(trigger),
  );
}
