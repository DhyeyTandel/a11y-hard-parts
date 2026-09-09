import { uid, emit, prefersReducedMotion, afterPaint } from '../../utils/dom.js';
import { getTabbables } from '../../utils/focusable.js';

/**
 * Toast notifications.
 *
 * There is no APG "toast" pattern, which is part of why this is the component
 * people get wrong most often. The failures, in the order they cause damage:
 *
 *  1. **Announcing by inserting the live region itself.** Creating a
 *     `<div role="alert">` and putting text in it in the same task usually
 *     announces nothing: assistive technology reacts to *mutations inside* a
 *     region it is already observing. The regions here are created empty at
 *     construction time and only ever have their text swapped.
 *
 *  2. **Making the visible toast stack the live region.** The stack mutates
 *     constantly — enter animations, dismiss buttons, timers removing nodes.
 *     Every one of those mutations is a change the AT may announce, so the
 *     user hears fragments and re-reads. Worse, `role="alert"` implies
 *     `aria-atomic="true"`, so a second toast re-announces the first one too.
 *     Here the visible stack is inert to AT-as-a-live-region (it is a plain
 *     labelled `region` landmark) and announcements are mirrored into separate
 *     single-message regions.
 *
 *  3. **`assertive` for everything.** `assertive` interrupts the user
 *     mid-sentence — including mid-sentence in the thing they were reading to
 *     decide what to do. It is correct for "your session expires in 60
 *     seconds" and wrong for "Saved". Default here is `polite`; `assertive` is
 *     opt-in and is what `error` uses.
 *
 *  4. **Auto-dismiss that cannot be paused** (WCAG 2.2.1 Timing Adjustable) or
 *     that is too short to read (WCAG 2.2.3). Timers here pause on hover and
 *     on focus, and errors do not auto-dismiss at all.
 *
 *  5. **Focus vanishing.** If a toast auto-dismisses while the user is tabbed
 *     into its action button, focus falls back to `<body>` and the screen
 *     reader jumps to the top of the page. Timers pause on focus, and manual
 *     dismissal moves focus deliberately.
 */
export class ToastRegion {
  /**
   * @param {object} [options]
   * @param {Element} [options.container] defaults to a container appended to <body>
   * @param {string} [options.label='Notifications']
   * @param {number} [options.duration=6000] ms; 0 disables auto-dismiss
   * @param {number} [options.max=4] visible toasts before the oldest is dropped
   */
  constructor(options = {}) {
    this.options = { label: 'Notifications', duration: 6000, max: 4, ...options };
    this.toasts = new Set();

    this.container = options.container ?? document.createElement('div');
    this.container.classList.add('a11y-toasts');
    // A landmark, not a live region: the user can jump here with the rotor to
    // review or dismiss notifications at their own pace.
    this.container.setAttribute('role', 'region');
    this.container.setAttribute('aria-label', this.options.label);
    if (!this.container.isConnected) document.body.appendChild(this.container);

    // Created empty, now, before any message exists. See failure (1).
    this.politeRegion = this._createLiveRegion('polite');
    this.assertiveRegion = this._createLiveRegion('assertive');

    // WCAG 2.2.1: hovering or focusing anywhere in the stack pauses every
    // timer, so a user reading with a screen magnifier does not lose the
    // message mid-read.
    this.container.addEventListener('pointerenter', () => this.pauseAll());
    this.container.addEventListener('pointerleave', () => this.resumeAll());
    this.container.addEventListener('focusin', () => this.pauseAll());
    this.container.addEventListener('focusout', (event) => {
      if (!this.container.contains(event.relatedTarget)) this.resumeAll();
    });
  }

  _createLiveRegion(politeness) {
    const region = document.createElement('div');
    region.className = 'a11y-visually-hidden';
    region.setAttribute('aria-live', politeness);
    region.setAttribute('aria-atomic', 'true');
    region.setAttribute('role', politeness === 'assertive' ? 'alert' : 'status');
    document.body.appendChild(region);
    return region;
  }

  _announce(message, politeness) {
    const region = politeness === 'assertive' ? this.assertiveRegion : this.politeRegion;
    clearTimeout(region._timer);
    // Clear first: setting the same text twice is not a mutation, so an
    // identical repeat message ("Copied", "Copied") would be silent.
    region.textContent = '';
    afterPaint(() => {
      region.textContent = message;
      region._timer = setTimeout(() => { region.textContent = ''; }, 7000);
    });
  }

  /**
   * @param {string} message
   * @param {object} [options]
   * @param {'info'|'success'|'warning'|'error'} [options.variant='info']
   * @param {'polite'|'assertive'} [options.politeness]
   * @param {number} [options.duration]
   * @param {{ label: string, onClick: () => void }} [options.action]
   */
  show(message, options = {}) {
    const variant = options.variant ?? 'info';
    // Errors interrupt and never time out: the user has to be able to read
    // what went wrong, and act on it.
    const politeness = options.politeness ?? (variant === 'error' ? 'assertive' : 'polite');
    const duration = options.duration ?? (variant === 'error' ? 0 : this.options.duration);

    const element = document.createElement('div');
    element.className = `a11y-toast a11y-toast--${variant}`;
    element.id = uid('toast');
    if (prefersReducedMotion()) element.dataset.reducedMotion = '';

    const text = document.createElement('p');
    text.className = 'a11y-toast__message';
    text.textContent = message;
    element.appendChild(text);

    if (options.action) {
      const actionButton = document.createElement('button');
      actionButton.type = 'button';
      actionButton.className = 'a11y-toast__action';
      actionButton.textContent = options.action.label;
      actionButton.addEventListener('click', () => {
        options.action.onClick();
        this.dismiss(element);
      });
      element.appendChild(actionButton);
    }

    const dismissButton = document.createElement('button');
    dismissButton.type = 'button';
    dismissButton.className = 'a11y-toast__dismiss';
    // Not just "Dismiss": with several toasts open, a screen reader's button
    // list would show four identical entries with no way to tell them apart.
    dismissButton.setAttribute('aria-label', `Dismiss notification: ${message}`);
    dismissButton.innerHTML = '<span aria-hidden="true">×</span>';
    dismissButton.addEventListener('click', () => this.dismiss(element));
    element.appendChild(dismissButton);

    const toast = { element, duration, remaining: duration, timer: null, startedAt: 0 };
    this.toasts.add(toast);
    element._toast = toast;

    this.container.appendChild(element);
    this._announce(message, politeness);
    this._enforceMax();
    this._start(toast);

    emit(this.container, 'a11y-toast:show', { message, variant, element });
    return element;
  }

  info(message, options) { return this.show(message, { ...options, variant: 'info' }); }
  success(message, options) { return this.show(message, { ...options, variant: 'success' }); }
  warning(message, options) { return this.show(message, { ...options, variant: 'warning' }); }
  error(message, options) { return this.show(message, { ...options, variant: 'error' }); }

  _enforceMax() {
    const dismissible = [...this.toasts].filter((toast) => toast.duration > 0);
    while (dismissible.length > this.options.max) {
      const oldest = dismissible.shift();
      // Never silently drop a toast the user is interacting with.
      if (oldest.element.contains(document.activeElement)) continue;
      this.dismiss(oldest.element);
    }
  }

  _start(toast) {
    if (toast.duration <= 0) return;
    toast.startedAt = Date.now();
    toast.timer = setTimeout(() => this.dismiss(toast.element), toast.remaining);
  }

  pauseAll() {
    for (const toast of this.toasts) {
      if (!toast.timer) continue;
      clearTimeout(toast.timer);
      toast.timer = null;
      // Track the remainder so resuming does not restart the full duration —
      // otherwise a passing mouse gives the toast a fresh lease every time.
      toast.remaining = Math.max(0, toast.remaining - (Date.now() - toast.startedAt));
    }
  }

  resumeAll() {
    for (const toast of this.toasts) {
      if (toast.timer || toast.duration <= 0) continue;
      this._start(toast);
    }
  }

  dismiss(element) {
    const toast = element?._toast;
    if (!toast || !this.toasts.has(toast)) return;

    clearTimeout(toast.timer);
    this.toasts.delete(toast);

    // If focus is inside the toast being removed, move it somewhere sensible
    // *before* the node leaves the DOM. Otherwise focus resets to <body> and
    // the screen reader's reading position jumps to the top of the page.
    if (element.contains(document.activeElement)) {
      const siblings = [...this.toasts].map((t) => t.element);
      const nextTarget = siblings.length
        ? getTabbables(siblings[siblings.length - 1])[0]
        : this._returnFocusTarget();
      nextTarget?.focus();
    }

    element.remove();
    emit(this.container, 'a11y-toast:dismiss', { element });
  }

  /**
   * Where focus goes when the last toast is dismissed from the keyboard.
   * Overridable: the right answer is usually "the control that triggered the
   * action", which only the caller knows.
   */
  _returnFocusTarget() {
    return this.options.returnFocus ?? null;
  }

  dismissAll() {
    for (const toast of [...this.toasts]) this.dismiss(toast.element);
  }

  destroy() {
    this.dismissAll();
    this.politeRegion.remove();
    this.assertiveRegion.remove();
    this.container.remove();
  }
}

/** Lazily-created shared instance, mounted early so its regions exist. */
let shared = null;
export function toasts() {
  if (!shared) shared = new ToastRegion();
  return shared;
}
