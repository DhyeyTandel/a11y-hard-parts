import { Keys } from '../../utils/keys.js';
import { ensureId, setDefault, emit, scrollIntoViewWithin } from '../../utils/dom.js';
import { Typeahead } from '../../utils/typeahead.js';

/**
 * Listbox — APG "Listbox", single- and multi-select.
 *
 * The listbox itself is the tab stop (`tabindex="0"`) and the active option is
 * tracked with `aria-activedescendant`, the same technique the combobox uses.
 * A roving tabindex would work too, but activedescendant is the better fit here
 * for two reasons: a long list stays one tab stop no matter how it is
 * virtualised, and the selection model stays independent of focus, which is
 * what multi-select needs.
 *
 * The distinction that matters:
 *
 *  - **Single-select**: selection follows focus. Arrowing changes the value.
 *    This is right unless selecting has a side effect (a network request, a
 *    destructive change) — in that case use `followFocus: false` and require
 *    Enter or Space.
 *  - **Multi-select**: focus and selection are separate. Arrowing moves the
 *    highlight without changing what is selected; Space toggles.
 *
 * Expected markup:
 *
 *   <div data-a11y-listbox>
 *     <span id="lb-label">Time zone</span>
 *     <ul data-a11y-listbox-list aria-labelledby="lb-label">
 *       <li data-a11y-listbox-option>London</li>
 *     </ul>
 *   </div>
 */
export class Listbox {
  /**
   * @param {Element} root
   * @param {object} [options]
   * @param {boolean} [options.multiple=false]
   * @param {boolean} [options.followFocus=true] Single-select only.
   * @param {(detail: object) => void} [options.onChange]
   */
  constructor(root, options = {}) {
    this.root = root;
    this.options = { multiple: false, followFocus: true, ...options };

    this.list = root.querySelector('[data-a11y-listbox-list]') ?? root;
    this.options_ = Array.from(root.querySelectorAll('[data-a11y-listbox-option]'));
    this.activeIndex = -1;
    /** Anchor for Shift+Arrow range selection. */
    this.anchorIndex = -1;
    this.typeahead = new Typeahead();

    this._applyStaticAria();
    this._bindEvents();

    const preselected = this.options_.findIndex((o) => o.getAttribute('aria-selected') === 'true');
    this.setActive(preselected === -1 ? 0 : preselected);
  }

  _applyStaticAria() {
    const { list } = this;

    setDefault(list, 'role', 'listbox');
    // The list is the tab stop; the options never are.
    setDefault(list, 'tabindex', '0');
    if (this.options.multiple) setDefault(list, 'aria-multiselectable', 'true');

    if (!list.hasAttribute('aria-label') && !list.hasAttribute('aria-labelledby')) {
      console.warn(
        '[Listbox] No accessible name. Point aria-labelledby at the visible ' +
          'label, or the user hears only "list box".',
        list,
      );
    }

    this.options_.forEach((option, index) => {
      setDefault(option, 'role', 'option');
      option.id ||= `${ensureId(list, 'listbox')}-option-${index}`;
      // In a multi-select listbox every option carries an explicit
      // aria-selected, so "not selected" is stated rather than inferred. In a
      // single-select one, only the selected option has it — an option without
      // the attribute is simply not the current value.
      if (this.options.multiple) setDefault(option, 'aria-selected', 'false');
    });
  }

  _bindEvents() {
    this.list.addEventListener('keydown', this._onKeydown.bind(this));
    this.list.addEventListener('click', this._onClick.bind(this));
    // Focusing the list must not scroll the page to the active option if the
    // user got here by clicking.
    this.list.addEventListener('focus', () => {
      if (this.activeIndex === -1) this.setActive(0);
    });
  }

  get selectedIndexes() {
    return this.options_.reduce((acc, option, index) => {
      if (option.getAttribute('aria-selected') === 'true') acc.push(index);
      return acc;
    }, []);
  }

  get value() {
    const selected = this.selectedIndexes.map((i) => this.options_[i].dataset.value ?? this.options_[i].textContent.trim());
    return this.options.multiple ? selected : (selected[0] ?? null);
  }

  /** Move the highlight. Does not change selection. */
  setActive(index) {
    const count = this.options_.length;
    if (count === 0) return this;
    const next = Math.max(0, Math.min(count - 1, index));

    this.options_[this.activeIndex]?.classList.remove('is-active');
    this.activeIndex = next;

    const option = this.options_[next];
    option.classList.add('is-active');
    this.list.setAttribute('aria-activedescendant', option.id);
    scrollIntoViewWithin(option, this.list);
    return this;
  }

  select(index, { additive = false, range = false } = {}) {
    const option = this.options_[index];
    if (!option || option.getAttribute('aria-disabled') === 'true') return this;

    if (!this.options.multiple) {
      for (const other of this.options_) other.removeAttribute('aria-selected');
      option.setAttribute('aria-selected', 'true');
      this.anchorIndex = index;
    } else if (range && this.anchorIndex !== -1) {
      const [from, to] = [this.anchorIndex, index].sort((a, b) => a - b);
      this.options_.forEach((o, i) => o.setAttribute('aria-selected', String(i >= from && i <= to)));
    } else if (additive) {
      option.setAttribute('aria-selected', option.getAttribute('aria-selected') === 'true' ? 'false' : 'true');
      this.anchorIndex = index;
    } else {
      for (const other of this.options_) other.setAttribute('aria-selected', 'false');
      option.setAttribute('aria-selected', 'true');
      this.anchorIndex = index;
    }

    const detail = { value: this.value, index, listbox: this };
    this.options.onChange?.(detail);
    emit(this.root, 'a11y-listbox:change', detail);
    return this;
  }

  selectAll() {
    if (!this.options.multiple) return this;
    // Ctrl/Cmd+A toggles: if everything is already selected, clear it. That is
    // what the platform does, and a select-all with no way back is a trap.
    const allSelected = this.selectedIndexes.length === this.options_.length;
    for (const option of this.options_) option.setAttribute('aria-selected', String(!allSelected));

    const detail = { value: this.value, index: -1, listbox: this };
    this.options.onChange?.(detail);
    emit(this.root, 'a11y-listbox:change', detail);
    return this;
  }

  _move(index, event) {
    this.setActive(index);
    if (this.options.multiple) {
      // Shift+Arrow extends the selection as it moves; a plain arrow only
      // moves the highlight.
      if (event.shiftKey) this.select(this.activeIndex, { range: true });
    } else if (this.options.followFocus) {
      this.select(this.activeIndex);
    }
  }

  _onKeydown(event) {
    const count = this.options_.length;
    const isSelectAll = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a';

    if (isSelectAll && this.options.multiple) {
      event.preventDefault();
      this.selectAll();
      return;
    }

    switch (event.key) {
      case Keys.ArrowDown:
        event.preventDefault();
        this._move(Math.min(count - 1, this.activeIndex + 1), event);
        return;
      case Keys.ArrowUp:
        event.preventDefault();
        this._move(Math.max(0, this.activeIndex - 1), event);
        return;
      case Keys.Home:
        event.preventDefault();
        this._move(0, event);
        return;
      case Keys.End:
        event.preventDefault();
        this._move(count - 1, event);
        return;
      case Keys.Space:
        // Always prevented: Space in a focusable list scrolls the page, which
        // moves the list out from under the user.
        event.preventDefault();
        if (this.options.multiple) this.select(this.activeIndex, { additive: true });
        else this.select(this.activeIndex);
        return;
      case Keys.Enter:
        if (!this.options.multiple && !this.options.followFocus) {
          event.preventDefault();
          this.select(this.activeIndex);
        }
        return;
      default: {
        const index = this.typeahead.match(
          event,
          this.options_.map((o) => o.textContent),
          this.activeIndex,
        );
        if (index === -1) return;
        event.preventDefault();
        this._move(index, event);
      }
    }
  }

  _onClick(event) {
    const option = event.target.closest('[data-a11y-listbox-option]');
    if (!option) return;
    const index = this.options_.indexOf(option);
    if (index === -1) return;

    this.setActive(index);
    this.select(index, {
      additive: this.options.multiple && (event.metaKey || event.ctrlKey),
      range: this.options.multiple && event.shiftKey,
    });
    // Clicking an option must leave focus on the list, not on the <li>, or
    // aria-activedescendant stops being the source of truth.
    this.list.focus();
  }
}

export function initListboxes(scope = document) {
  return Array.from(scope.querySelectorAll('[data-a11y-listbox]')).map(
    (root) =>
      new Listbox(root, {
        multiple: root.dataset.a11yListboxMultiple === 'true',
        followFocus: root.dataset.a11yListboxFollowFocus !== 'false',
      }),
  );
}
