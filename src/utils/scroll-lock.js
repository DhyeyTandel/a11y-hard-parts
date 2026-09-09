/**
 * Prevent the page behind a modal from scrolling, without the layout shift that
 * comes from removing the scrollbar.
 *
 * Reference-counted, so nested modals do not unlock early.
 */

let locks = 0;
let previousOverflow = '';
let previousPaddingRight = '';

export function lockScroll() {
  locks += 1;
  if (locks > 1) return;

  const { documentElement, body } = document;
  const scrollbarWidth = window.innerWidth - documentElement.clientWidth;

  previousOverflow = body.style.overflow;
  previousPaddingRight = body.style.paddingRight;

  body.style.overflow = 'hidden';
  if (scrollbarWidth > 0) {
    const current = parseFloat(getComputedStyle(body).paddingRight) || 0;
    body.style.paddingRight = `${current + scrollbarWidth}px`;
  }
}

export function unlockScroll() {
  locks = Math.max(0, locks - 1);
  if (locks > 0) return;

  document.body.style.overflow = previousOverflow;
  document.body.style.paddingRight = previousPaddingRight;
}

export function getLockCount() {
  return locks;
}
