import { Keys, hasModifier } from '../../utils/keys.js';
import { ensureId, uid, setDefault, emit, scrollIntoViewWithin } from '../../utils/dom.js';
import { createScopedLiveRegion } from '../../utils/live-region.js';

/**
 * Combobox with list autocomplete and manual selection —
 * APG "Combobox" (ARIA 1.2 pattern).
 *
 * The single most important property: **DOM focus never leaves the text
 * input.** The highlighted option is communicated with
 * `aria-activedescendant`, which points at the option's id. This is what lets
 * the user keep typing while a suggestion is highlighted, and it is why the
 * ARIA 1.1 wrapper-as-combobox markup was abandoned — moving real focus into
 * the list breaks typing and breaks the screen reader's reading position.
 *
 * Expected markup:
 *
 *   <div class="a11y-combobox" data-a11y-combobox>
 *     <label for="fruit">Fruit</label>
 *     <div class="a11y-combobox__field">
 *       <input id="fruit" type="text">
 *       <button type="button" data-a11y-combobox-toggle>...</button>
 *     </div>
 *     <ul data-a11y-combobox-listbox></ul>
 *   </div>
 */
export class Combobox {
  /**
   * @param {Element} root
   * @param {object} options
   * @param {Array|((query: string) => Array|Promise<Array>)} options.source
   *   Array of strings, or of `{ value, label, disabled }`, or a function.
   * @param {(query: string, items: Array) => Array} [options.filter]
   * @param {number} [options.minChars=0]
   * @param {boolean} [options.openOnFocus=false]
   * @param {boolean} [options.selectOnTab=true] Commit the highlighted option
   *   when Tab leaves the field.
   * @param {(item: object) => void} [options.onSelect]
   * @param {(count: number) => string} [options.announceResults]
   */
  constructor(root, options = {}) {
    this.root = root;
    this.options = {
      source: [],
      minChars: 0,
      openOnFocus: false,
      selectOnTab: true,
      announceCountDelay: 350,
      announceResults: (count) =>
        count === 0
          ? 'No results available.'
          : `${count} ${count === 1 ? 'result' : 'results'} available. Use the up and down arrow keys to review, Enter to select.`,
      ...options,
    };

    this.input = root.querySelector('input');
    this.listbox = root.querySelector('[data-a11y-combobox-listbox]');
    this.toggleButton = root.querySelector('[data-a11y-combobox-toggle]');

    if (!this.input || !this.listbox) {
      throw new Error('[Combobox] Requires an <input> and [data-a11y-combobox-listbox].');
    }

    this.expanded = false;
    /** Index into `this.items` of the visually focused option, or -1. */
    this.activeIndex = -1;
    this.items = [];
    /** @type {object|null} */
    this.selected = null;
    this._requestToken = 0;
    this._announceTimer = null;

    this._applyStaticAria();
    this.liveRegion = createScopedLiveRegion(root, 'polite');
    this._bindEvents();
  }

  _applyStaticAria() {
    const { input, listbox, toggleButton, root } = this;

    this.listboxId = ensureId(listbox, 'combobox-listbox');
    ensureId(input, 'combobox-input');

    // ARIA 1.2: the *input itself* is the combobox.
    setDefault(input, 'role', 'combobox');
    setDefault(input, 'aria-expanded', 'false');
    setDefault(input, 'aria-controls', this.listboxId);
    // "list" = the popup offers suggestions but does not complete the value
    // inline. Use "both" only if you actually select the completed text range.
    setDefault(input, 'aria-autocomplete', 'list');
    setDefault(input, 'aria-haspopup', 'listbox');
    // Stop the browser's own autofill dropdown from covering the listbox.
    setDefault(input, 'autocomplete', 'off');
    setDefault(input, 'autocapitalize', 'none');
    setDefault(input, 'spellcheck', 'false');

    setDefault(listbox, 'role', 'listbox');

    const label = root.querySelector(`label[for="${CSS.escape(input.id)}"]`);
    if (label) {
      // The listbox needs its own name; it is a separate node in the a11y tree
      // and "listbox" alone tells the user nothing.
      setDefault(listbox, 'aria-label', label.textContent.trim());
    } else if (!input.hasAttribute('aria-label') && !input.hasAttribute('aria-labelledby')) {
      console.warn('[Combobox] Input has no label.', input);
    }

    if (toggleButton) {
      // tabindex="-1": the button duplicates Alt+ArrowDown, so making it a tab
      // stop just adds a stop that announces nothing new.
      setDefault(toggleButton, 'tabindex', '-1');
      setDefault(toggleButton, 'type', 'button');
      setDefault(toggleButton, 'aria-label', 'Show suggestions');
      // Deliberately no aria-expanded here: the input already carries it, and
      // duplicating it makes the state announce twice. Deliberately not
      // aria-hidden either — it stays discoverable in browse mode, per the
      // APG reference implementation.
    }

    listbox.hidden = true;
  }

  _bindEvents() {
    this.input.addEventListener('input', this._onInput.bind(this));
    this.input.addEventListener('keydown', this._onKeydown.bind(this));
    this.input.addEventListener('focus', () => {
      if (this.options.openOnFocus) this.open();
    });

    // focusout on the root (not blur on the input) so moving between the input
    // and the toggle button does not close the popup.
    this.root.addEventListener('focusout', (event) => {
      if (this.root.contains(event.relatedTarget)) return;
      this.close({ announce: false });
    });

    // mousedown, not click: preventDefault here stops the input from losing
    // focus at all, so no focusout/close race with the click that follows.
    this.listbox.addEventListener('mousedown', (event) => event.preventDefault());
    this.listbox.addEventListener('click', (event) => {
      const option = event.target.closest('[role="option"]');
      if (!option || option.getAttribute('aria-disabled') === 'true') return;
      const index = Number(option.dataset.index);
      this.setActive(index);
      this.selectActive();
    });

    this.toggleButton?.addEventListener('mousedown', (event) => event.preventDefault());
    this.toggleButton?.addEventListener('click', () => {
      if (this.expanded) this.close();
      else this.open();
      this.input.focus();
    });
  }

  // ---- data -------------------------------------------------------------

  async _resolveItems(query) {
    const { source, filter } = this.options;
    const raw = typeof source === 'function' ? await source(query) : source;
    const normalised = raw.map((item) =>
      typeof item === 'string' ? { value: item, label: item } : { label: item.value, ...item },
    );

    if (typeof source === 'function') return normalised;
    if (filter) return filter(query, normalised);
    if (!query) return normalised;

    const needle = query.toLowerCase();
    return normalised.filter((item) => item.label.toLowerCase().includes(needle));
  }

  async refresh({ announce = true } = {}) {
    const query = this.input.value;
    const token = ++this._requestToken;
    const items = await this._resolveItems(query);
    // Drop stale async results: without this, a slow response for "ap"
    // overwrites the list the user is already navigating for "apple".
    if (token !== this._requestToken) return;

    this.items = items;
    this._render();
    if (announce) this._announceCount(items.length);
  }

  _render() {
    const optionIdBase = this.listboxId;
    this.listbox.textContent = '';

    this.items.forEach((item, index) => {
      const option = document.createElement('li');
      option.id = `${optionIdBase}-option-${index}`;
      option.setAttribute('role', 'option');
      option.dataset.index = String(index);
      option.className = 'a11y-combobox__option';
      option.textContent = item.label;

      if (item.disabled) option.setAttribute('aria-disabled', 'true');
      // Exactly one option carries aria-selected="true" — the highlighted one.
      // Setting it on every option, or on none, is the usual mistake.
      option.setAttribute('aria-selected', 'false');

      this.listbox.appendChild(option);
    });
  }

  _announceCount(count) {
    clearTimeout(this._announceTimer);
    // Debounced: announcing on every keystroke floods the speech queue and the
    // user never hears the count that matters.
    this._announceTimer = setTimeout(() => {
      this.liveRegion.announce(this.options.announceResults(count));
    }, this.options.announceCountDelay);
  }

  // ---- state ------------------------------------------------------------

  async open({ activeIndex = -1 } = {}) {
    if (this.input.value.length < this.options.minChars) return this;
    await this.refresh();
    if (this.items.length === 0) {
      // Nothing to show: stay collapsed rather than opening an empty popup that
      // aria-expanded="true" promises has content.
      this.close({ announce: false });
      return this;
    }

    this.expanded = true;
    this.listbox.hidden = false;
    this.input.setAttribute('aria-expanded', 'true');
    this.setActive(activeIndex);
    emit(this.root, 'a11y-combobox:open', { combobox: this });
    return this;
  }

  close({ announce = true } = {}) {
    if (!this.expanded && this.activeIndex === -1) return this;
    this.expanded = false;
    this.listbox.hidden = true;
    this.input.setAttribute('aria-expanded', 'false');
    this.setActive(-1);
    if (!announce) clearTimeout(this._announceTimer);
    emit(this.root, 'a11y-combobox:close', { combobox: this });
    return this;
  }

  /** Move the *visual* focus. DOM focus stays in the input. */
  setActive(index) {
    const options = this.listbox.querySelectorAll('[role="option"]');

    if (this.activeIndex >= 0 && options[this.activeIndex]) {
      options[this.activeIndex].setAttribute('aria-selected', 'false');
      options[this.activeIndex].classList.remove('is-active');
    }

    this.activeIndex = index;

    if (index < 0 || !options[index]) {
      this.input.removeAttribute('aria-activedescendant');
      return;
    }

    const option = options[index];
    option.setAttribute('aria-selected', 'true');
    option.classList.add('is-active');
    this.input.setAttribute('aria-activedescendant', option.id);
    scrollIntoViewWithin(option, this.listbox);
  }

  _move(delta) {
    if (!this.expanded) return;
    const count = this.items.length;
    if (count === 0) return;

    let next = this.activeIndex + delta;
    // Wrap, per APG: Down from the last option returns to the first.
    if (next < 0) next = count - 1;
    if (next >= count) next = 0;

    // Skip disabled options in the direction of travel.
    const step = delta > 0 ? 1 : -1;
    let guard = 0;
    while (this.items[next]?.disabled && guard < count) {
      next = (next + step + count) % count;
      guard += 1;
    }

    this.setActive(next);
  }

  selectActive() {
    const item = this.items[this.activeIndex];
    if (!item || item.disabled) return this;

    this.selected = item;
    this.input.value = item.label;
    this.close({ announce: false });
    // Caret to the end so the next keystroke appends rather than replacing.
    this.input.setSelectionRange(item.label.length, item.label.length);

    this.options.onSelect?.(item);
    emit(this.root, 'a11y-combobox:select', { item, combobox: this });
    return this;
  }

  // ---- keyboard ---------------------------------------------------------

  _onInput() {
    this.selected = null;
    if (this.input.value.length < this.options.minChars) {
      this.close();
      return;
    }
    // Reopen on every keystroke, with nothing highlighted: highlighting the
    // first result automatically would make Enter commit something the user
    // never chose.
    this.open({ activeIndex: -1 });
  }

  _onKeydown(event) {
    const { key, altKey } = event;

    switch (key) {
      case Keys.ArrowDown:
        event.preventDefault();
        if (!this.expanded) {
          // Alt+Down opens *without* moving into the list, so the user can see
          // the options while keeping the caret where it is.
          this.open({ activeIndex: altKey ? -1 : 0 });
        } else if (!altKey) {
          this._move(1);
        }
        return;

      case Keys.ArrowUp:
        event.preventDefault();
        if (altKey) {
          // Alt+Up closes the popup and keeps the current value.
          if (this.expanded) this.close();
          return;
        }
        if (!this.expanded) this.open({ activeIndex: -1 }).then(() => this._move(-1));
        else this._move(-1);
        return;

      case Keys.Enter:
        if (this.expanded && this.activeIndex >= 0) {
          // Only swallow Enter when it means something here; otherwise let it
          // submit the form, which is what the user expects.
          event.preventDefault();
          this.selectActive();
        }
        return;

      case Keys.Escape:
        if (this.expanded) {
          event.preventDefault();
          event.stopPropagation();
          this.close();
        } else if (this.input.value !== '') {
          // Second Escape clears the field, per APG. Stop propagation only when
          // we handled it, so Escape still closes a surrounding dialog once the
          // combobox has nothing left to undo.
          event.preventDefault();
          event.stopPropagation();
          this.input.value = '';
          this.selected = null;
          emit(this.root, 'a11y-combobox:clear', { combobox: this });
        }
        return;

      case Keys.Home:
      case Keys.End:
        // APG: in an editable combobox these move the *text cursor*, they do
        // not jump within the list. Let the browser do it, and drop the
        // highlight so Enter cannot commit a stale option.
        if (this.expanded) this.setActive(-1);
        return;

      case Keys.Tab:
        if (this.expanded && this.activeIndex >= 0 && this.options.selectOnTab) {
          this.selectActive();
        } else {
          this.close({ announce: false });
        }
        return;

      default:
        if (hasModifier(event)) return;
    }
  }

  destroy() {
    this.liveRegion.destroy();
    clearTimeout(this._announceTimer);
  }
}

export function initComboboxes(scope = document, optionsById = {}) {
  const instances = new Map();
  for (const root of scope.querySelectorAll('[data-a11y-combobox]')) {
    const id = ensureId(root, 'combobox');
    instances.set(id, new Combobox(root, optionsById[root.dataset.a11yCombobox] ?? optionsById[id] ?? {}));
  }
  return instances;
}
