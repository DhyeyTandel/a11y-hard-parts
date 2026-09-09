/**
 * Make everything outside `element` inert while a modal is open.
 *
 * Why this exists even though the dialog already has `aria-modal="true"`:
 * `aria-modal` is a hint to assistive technology about the *accessibility
 * tree*. It does nothing for the tab order, nothing for pointer events, and
 * historically VoiceOver has still allowed the user to navigate outside the
 * dialog with VO+arrow keys. `inert` is the actual enforcement: it removes the
 * subtree from sequential focus navigation, from hit testing, and from the
 * accessibility tree.
 *
 * The subtree is walked as siblings-up-the-ancestor-chain rather than "every
 * top-level element", so a dialog rendered in place (not portalled to <body>)
 * still correctly inerts its own ancestors' siblings.
 */

const SUPPORTS_INERT = typeof HTMLElement !== 'undefined' && 'inert' in HTMLElement.prototype;

/** Elements that never render and so never need inerting. */
const NON_RENDERED = new Set(['SCRIPT', 'STYLE', 'LINK', 'TEMPLATE', 'NOSCRIPT', 'META', 'TITLE', 'HEAD']);

/**
 * @param {Element} element - the subtree that stays interactive
 * @param {Element} [boundary=document.body]
 * @returns {() => void} restore function
 */
export function inertBackground(element, boundary = document.body) {
  /** @type {{ node: Element, hadInert: boolean, hadAriaHidden: string | null }[]} */
  const touched = [];

  let node = element;
  while (node && node !== boundary.parentElement) {
    const parent = node.parentElement;
    if (!parent) break;

    for (const sibling of parent.children) {
      if (sibling === node) continue;
      if (NON_RENDERED.has(sibling.tagName)) continue;
      // Someone else (a nested modal) already inerted this; leave it alone.
      if (sibling.hasAttribute('inert')) continue;

      touched.push({
        node: sibling,
        hadInert: false,
        hadAriaHidden: sibling.getAttribute('aria-hidden'),
      });

      sibling.setAttribute('inert', '');
      // Fallback only: in browsers with `inert`, adding aria-hidden as well is
      // redundant. In browsers without it, aria-hidden is what keeps the
      // background out of the screen reader's virtual cursor.
      if (!SUPPORTS_INERT) sibling.setAttribute('aria-hidden', 'true');
    }

    if (node === boundary) break;
    node = parent;
  }

  return function restore() {
    for (const { node: touchedNode, hadAriaHidden } of touched) {
      touchedNode.removeAttribute('inert');
      if (hadAriaHidden === null) touchedNode.removeAttribute('aria-hidden');
      else touchedNode.setAttribute('aria-hidden', hadAriaHidden);
    }
    touched.length = 0;
  };
}

export { SUPPORTS_INERT };
