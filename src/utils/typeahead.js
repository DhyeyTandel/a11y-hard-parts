/**
 * Type-ahead ("first-character navigation") for menus, listboxes and trees.
 *
 * The behaviour users actually expect, which a naive implementation misses:
 *
 *  - **Multi-character**: typing "st" quickly goes to "Stockholm", not to the
 *    first "S" and then the first "T". The buffer clears after a pause.
 *  - **Same character repeated**: typing "s", "s", "s" cycles through every
 *    item starting with "s". This is the one people notice is missing, because
 *    it is how every native list on the platform behaves.
 *  - **Wraps**, and starts searching *after* the current item, so repeating a
 *    character advances rather than re-matching where you already are.
 *  - **Ignores modifiers**, so ⌘S still saves and Tab still moves.
 *  - **Ignores IME composition**, so typing Japanese or Chinese does not jump
 *    the selection around mid-composition.
 */

import { isPrintableCharacter } from './keys.js';

const DEFAULT_TIMEOUT = 500;

export class Typeahead {
  /**
   * @param {object} [options]
   * @param {number} [options.timeout=500] ms before the buffer resets
   */
  constructor({ timeout = DEFAULT_TIMEOUT } = {}) {
    this.timeout = timeout;
    this.buffer = '';
    this.timer = null;
  }

  /**
   * @param {KeyboardEvent} event
   * @param {string[]} labels  the items' text, in DOM order
   * @param {number} currentIndex
   * @returns {number} the index to move to, or -1 for "not a type-ahead key"
   */
  match(event, labels, currentIndex) {
    if (!isPrintableCharacter(event)) return -1;

    clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.buffer = ''; }, this.timeout);
    this.buffer += event.key.toLowerCase();

    // A repeated single character cycles through items starting with it,
    // rather than searching for "ss".
    const allSame = this.buffer.length > 1 && [...this.buffer].every((c) => c === this.buffer[0]);
    const needle = allSame ? this.buffer[0] : this.buffer;

    // Start after the current item so a repeat advances. A fresh multi-char
    // search starts from the current item, so "sto" still matches the item
    // you are standing on if it is the only "Stockholm".
    const offset = this.buffer.length === 1 || allSame ? 1 : 0;
    const count = labels.length;

    for (let step = 0; step < count; step += 1) {
      const index = (currentIndex + offset + step + count) % count;
      if (labels[index]?.trim().toLowerCase().startsWith(needle)) return index;
    }

    return -1;
  }

  reset() {
    clearTimeout(this.timer);
    this.buffer = '';
  }
}
