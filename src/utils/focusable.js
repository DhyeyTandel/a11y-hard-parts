/**
 * Sequential focus navigation ("what does Tab actually reach?").
 *
 * There is no DOM API for this, so every focus trap has to reimplement the
 * browser's own rules. The subtleties that most implementations miss are
 * called out inline; each one is a real bug that reaches a keyboard user.
 */

/** Elements that can be focusable. Attribute presence only — filtering happens below. */
const CANDIDATES = [
  'a[href]',
  'area[href]',
  'button',
  'input',
  'select',
  'textarea',
  'details > summary:first-of-type',
  'details',
  'iframe',
  'object',
  'embed',
  'audio[controls]',
  'video[controls]',
  '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]',
].join(',');

/**
 * `disabled` is not just an attribute check: a disabled <fieldset> disables all
 * its descendants *except* those inside its first <legend>.
 */
export function isDisabled(element) {
  if (element.disabled) return true;

  const fieldset = element.closest('fieldset[disabled]');
  if (!fieldset) return false;

  const firstLegend = fieldset.querySelector(':scope > legend');
  return !(firstLegend && firstLegend.contains(element));
}

/**
 * Hidden means "not rendered", which covers `display:none`, the `hidden`
 * attribute, an ancestor `<details>` that is closed, and detachment from the
 * document — all of which produce zero client rects.
 *
 * `visibility: hidden|collapse` still produces layout boxes in some cases, so
 * it needs its own check.
 *
 * Deliberately NOT treated as hidden: the visually-hidden clip pattern. Those
 * elements (skip links, live regions with focusable content) are 1x1 but are
 * genuinely reachable, and excluding them would break skip navigation.
 */
export function isHidden(element) {
  if (element.hidden) return true;
  if (element.getClientRects().length === 0) return true;

  const { visibility } = getComputedStyle(element);
  return visibility === 'hidden' || visibility === 'collapse';
}

/** `inert` is inherited by descendants, so an ancestor check is required. */
export function isInert(element) {
  return element.closest('[inert]') !== null;
}

/**
 * A radio group is a single tab stop. If any radio in the group is checked,
 * only that one is tabbable; otherwise only the first focusable one is.
 *
 * Missing this makes a focus trap "leak" tab stops and makes a roving-tabindex
 * widget count its stops wrong.
 */
function isUntabbableRadio(element) {
  if (element.tagName !== 'INPUT' || element.type !== 'radio') return false;
  if (!element.name) return false;

  // Radios are grouped by form when inside one, otherwise by tree scope.
  const scope = element.form || element.getRootNode();
  const selector = `input[type="radio"][name="${CSS.escape(element.name)}"]`;
  const group = Array.from(scope.querySelectorAll(selector)).filter(
    (radio) => (radio.form || radio.getRootNode()) === scope,
  );

  const checked = group.find((radio) => radio.checked);
  if (checked) return checked !== element;

  const firstAvailable = group.find((radio) => !isDisabled(radio) && !isHidden(radio));
  return firstAvailable !== element;
}

/** Can this element receive focus at all (including programmatically)? */
export function isFocusable(element) {
  if (!(element instanceof Element)) return false;
  if (element.tabIndex < 0 && !element.matches(CANDIDATES)) return false;
  return !isDisabled(element) && !isHidden(element) && !isInert(element);
}

/** Can Tab reach this element? */
export function isTabbable(element) {
  if (element.tabIndex < 0) return false;
  if (isDisabled(element) || isHidden(element) || isInert(element)) return false;
  if (isUntabbableRadio(element)) return false;
  // A <details> is only itself tabbable when it has no <summary>.
  if (element.tagName === 'DETAILS' && element.querySelector(':scope > summary')) return false;
  return true;
}

/**
 * All tabbable descendants of `root` (and `root` itself if tabbable), in the
 * order Tab will actually visit them.
 *
 * Positive tabindex values come first in ascending order, then everything at
 * tabindex="0" in document order — matching the spec's sequential focus
 * navigation order. Positive tabindex is an antipattern, but a focus trap that
 * ignores it will wrap to the wrong element on pages that use it.
 */
export function getTabbables(root) {
  const candidates = Array.from(root.querySelectorAll(CANDIDATES));
  if (root instanceof Element && root.matches(CANDIDATES)) candidates.unshift(root);

  const tabbables = candidates.filter(isTabbable);

  // Stable partition: decorate with document order so equal tabindex keeps it.
  return tabbables
    .map((element, index) => ({ element, index, tabIndex: element.tabIndex }))
    .sort((a, b) => {
      if (a.tabIndex === b.tabIndex) return a.index - b.index;
      if (a.tabIndex === 0) return 1;
      if (b.tabIndex === 0) return -1;
      return a.tabIndex - b.tabIndex;
    })
    .map(({ element }) => element);
}

/**
 * The element that currently has focus, looking through open shadow roots.
 * `document.activeElement` stops at the shadow host.
 */
export function getActiveElement(root = document) {
  const active = root.activeElement;
  if (active && active.shadowRoot && active.shadowRoot.activeElement) {
    return getActiveElement(active.shadowRoot);
  }
  return active;
}
