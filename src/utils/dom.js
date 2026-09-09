let counter = 0;

/** Stable-ish unique id for wiring aria-controls / aria-labelledby. */
export function uid(prefix = 'a11y') {
  counter += 1;
  return `${prefix}-${counter}`;
}

/** Give `element` an id if it lacks one, and return it. */
export function ensureId(element, prefix = 'a11y') {
  if (!element.id) element.id = uid(prefix);
  return element.id;
}

/** Set an attribute only if the author has not already set it. */
export function setDefault(element, name, value) {
  if (!element.hasAttribute(name)) element.setAttribute(name, value);
}

/** Dispatch a cancelable, bubbling CustomEvent; returns false if prevented. */
export function emit(element, type, detail = {}) {
  return element.dispatchEvent(
    new CustomEvent(type, { detail, bubbles: true, cancelable: true }),
  );
}

/**
 * Scroll `element` into view *within its scrolling container only*.
 *
 * `scrollIntoView({ block: 'nearest' })` also scrolls every ancestor scroll
 * container, including the page. In a combobox that means picking an option
 * with the arrow keys can yank the whole page around, which is disorienting
 * for low-vision users and users with vestibular disorders.
 */
export function scrollIntoViewWithin(element, container) {
  const elementTop = element.offsetTop;
  const elementBottom = elementTop + element.offsetHeight;
  const viewTop = container.scrollTop;
  const viewBottom = viewTop + container.clientHeight;

  if (elementTop < viewTop) container.scrollTop = elementTop;
  else if (elementBottom > viewBottom) container.scrollTop = elementBottom - container.clientHeight;
}

/** Honour the user's motion preference. */
export function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Run `callback` after the browser has had a chance to paint.
 *
 * Live-region updates need a gap between clearing the region and writing the
 * new text, or the two mutations coalesce and nothing is announced. A double
 * `requestAnimationFrame` is the usual way to get that gap — but rAF does not
 * fire at all in a backgrounded tab, so an announcement queued there would
 * never be written, and the region would be left permanently empty. Fall back
 * to a timer whenever the document is hidden.
 */
export function afterPaint(callback) {
  if (document.visibilityState === 'hidden') {
    // Not setTimeout: browsers clamp timers to roughly one per second in a
    // backgrounded tab, which would delay every announcement by a second and
    // reorder announcements against each other. A MessageChannel message is a
    // real macrotask and is not throttled, which is all the separation the
    // clear-then-write needs when nothing is being painted anyway.
    postTask(callback);
    return;
  }
  requestAnimationFrame(() => requestAnimationFrame(callback));
}

/** Queue a macrotask that background-tab timer throttling does not delay. */
export function postTask(callback) {
  const channel = new MessageChannel();
  channel.port1.onmessage = () => {
    channel.port1.close();
    callback();
  };
  channel.port2.postMessage(undefined);
}
