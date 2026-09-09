/**
 * Named key values from the UI Events spec.
 * Always compare against `event.key`, never `keyCode`/`which` (deprecated),
 * and never `event.code` (that is physical position, which breaks on
 * non-QWERTY layouts and for users of alternative keyboards).
 */
export const Keys = Object.freeze({
  Enter: 'Enter',
  Space: ' ',
  Escape: 'Escape',
  Tab: 'Tab',
  Home: 'Home',
  End: 'End',
  ArrowUp: 'ArrowUp',
  ArrowDown: 'ArrowDown',
  ArrowLeft: 'ArrowLeft',
  ArrowRight: 'ArrowRight',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  Backspace: 'Backspace',
  Delete: 'Delete',
});

/**
 * True when the event carries a modifier that means "this keystroke belongs to
 * the browser or the OS, not to my widget". Widgets must not swallow those.
 */
export function hasModifier(event) {
  return event.ctrlKey || event.metaKey || event.altKey;
}

/**
 * True for a single printable character (so widgets can implement typeahead
 * without also catching Tab, F5, Escape, or IME composition).
 */
export function isPrintableCharacter(event) {
  return event.key.length === 1 && !hasModifier(event) && !event.isComposing;
}
