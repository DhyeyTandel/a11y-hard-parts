/**
 * Screen reader announcements for things that have no visible focus change:
 * "3 results available", "sorted by name, ascending", "message sent".
 *
 * The rules that make live regions actually work, and that most
 * implementations break:
 *
 *  1. The region must be in the DOM *before* the text goes into it. A region
 *     that is created and populated in the same task is usually not announced
 *     at all — the AT never observed a mutation, it just saw new DOM.
 *
 *  2. Re-setting the same string is a no-op mutation and will not re-announce.
 *     Clearing first, then setting on a later frame, fixes it.
 *
 *  3. `aria-atomic="true"` is right for a single-message region (read the whole
 *     thing) and wrong for an append-only log (re-reads everything each time).
 *
 *  4. `role="status"` / `role="alert"` are used *in addition to* `aria-live`,
 *     because support for the roles and for the bare property differs across
 *     AT/browser pairs, and the combination is the reliable one.
 *
 *  5. `assertive` interrupts whatever the user is currently listening to.
 *     Reserve it for errors and things that block the user's task. Everything
 *     else is `polite`.
 */

import { afterPaint } from './dom.js';

const regions = new Map();

function createRegion(politeness) {
  const region = document.createElement('div');
  region.className = 'a11y-visually-hidden';
  region.setAttribute('aria-live', politeness);
  region.setAttribute('aria-atomic', 'true');
  region.setAttribute('role', politeness === 'assertive' ? 'alert' : 'status');
  region.dataset.a11yLiveRegion = politeness;
  document.body.appendChild(region);
  return region;
}

/**
 * Mount the shared regions early — ideally at app start, so rule (1) holds for
 * the very first announcement. Safe to call repeatedly.
 */
export function mountLiveRegions() {
  for (const politeness of ['polite', 'assertive']) {
    const existing = regions.get(politeness);
    if (existing && existing.isConnected) continue;
    regions.set(politeness, createRegion(politeness));
  }
}

/**
 * @param {string} message
 * @param {object} [options]
 * @param {'polite'|'assertive'} [options.politeness='polite']
 * @param {number} [options.clearAfter=7000] ms until the region is emptied.
 */
export function announce(message, { politeness = 'polite', clearAfter = 7000 } = {}) {
  mountLiveRegions();
  const region = regions.get(politeness);
  if (!region) return;

  clearTimeout(region._clearTimer);
  region.textContent = '';

  // A gap between the clear and the write, so they are two observable
  // mutations rather than one coalesced no-op.
  afterPaint(() => {
    region.textContent = message;
    if (clearAfter > 0) {
      region._clearTimer = setTimeout(() => {
        region.textContent = '';
      }, clearAfter);
    }
  });
}

/**
 * A component-scoped live region, for announcements that belong to one widget
 * (a combobox's result count) rather than to the page.
 */
export function createScopedLiveRegion(parent, politeness = 'polite') {
  const region = createRegion(politeness);
  parent.appendChild(region);

  let timer;
  return {
    element: region,
    announce(message, { clearAfter = 7000 } = {}) {
      clearTimeout(timer);
      region.textContent = '';
      afterPaint(() => {
        region.textContent = message;
        if (clearAfter > 0) timer = setTimeout(() => { region.textContent = ''; }, clearAfter);
      });
    },
    destroy() {
      clearTimeout(timer);
      region.remove();
    },
  };
}

/** Test seam. */
export function getLiveRegion(politeness = 'polite') {
  return regions.get(politeness) ?? null;
}
