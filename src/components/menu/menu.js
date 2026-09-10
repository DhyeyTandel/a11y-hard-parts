import { Keys, hasModifier } from '../../utils/keys.js';
import { ensureId, setDefault, emit } from '../../utils/dom.js';
import { Typeahead } from '../../utils/typeahead.js';

/**
 * Menu button — APG "Menu Button" plus "Menu".
 *
 * A menu is a list of *actions*, and `role="menu"` is a promise about
 * behaviour: real focus moves into it, arrow keys navigate, type-ahead works,
 * and Escape returns focus to the button. If you are building site navigation,
 * do not use this — a `<nav>` full of links marked `role="menuitem"` breaks
 * every link affordance a screen reader user relies on, and is the single most
 * common misuse of the role.
 *
 * Note the contrast with the combobox: there, focus stays in the input and the
 * active option is tracked with `aria-activedescendant`. Here, focus really
 * moves, because there is no text field to keep it in.
 *
 * Expected markup:
 *
 *   <div data-a11y-menu>
 *     <button data-a11y-menu-trigger>Actions</button>
 *     <ul data-a11y-menu-list>
 *       <li><button data-a11y-menu-item>Rename</button></li>
 *       <li role="separator"></li>
 *       <li><button data-a11y-menu-item data-a11y-menu-checkbox>Show hidden</button></li>
 *     </ul>
 *   </div>
 */
export class Menu {
  /**
   * @param {Element} root
   * @param {object} [options]
   * @param {(detail: { item: Element, value: string }) => void} [options.onSelect]
   * @param {boolean} [options.closeOnSelect=true]
   */
  constructor(root, options = {}) {
    this.root = root;
    this.options = { closeOnSelect: true, ...options };

    this.trigger = root.querySelector('[data-a11y-menu-trigger]');
    this.list = root.querySelector('[data-a11y-menu-list]');
    if (!this.trigger || !this.list) {
      throw new Error('[Menu] Requires [data-a11y-menu-trigger] and [data-a11y-menu-list].');
    }

    this.items = Array.from(root.querySelectorAll('[data-a11y-menu-item]'));
    this.expanded = false;
    this.typeahead = new Typeahead();

    this._applyStaticAria();
    this._bindEvents();
  }

  _applyStaticAria() {
    const { trigger, list } = this;

    if (trigger.tagName === 'BUTTON') setDefault(trigger, 'type', 'button');
    ensureId(trigger, 'menu-trigger');
    // "menu" rather than the bare "true": it tells the user *what* opens, so
    // they hear "Actions, menu pop up button" instead of just "pop up button".
    setDefault(trigger, 'aria-haspopup', 'menu');
    setDefault(trigger, 'aria-expanded', 'false');
    setDefault(trigger, 'aria-controls', ensureId(list, 'menu-list'));

    setDefault(list, 'role', 'menu');
    // The menu takes its name from the button that opened it.
    setDefault(list, 'aria-labelledby', trigger.id);

    for (const item of this.items) {
      if (item.tagName === 'BUTTON') setDefault(item, 'type', 'button');

      // menuitemcheckbox / menuitemradio carry their state in aria-checked.
      // Using a visual tick with no aria-checked is the usual half-measure.
      if (item.hasAttribute('data-a11y-menu-checkbox')) {
        setDefault(item, 'role', 'menuitemcheckbox');
        setDefault(item, 'aria-checked', 'false');
      } else if (item.hasAttribute('data-a11y-menu-radio')) {
        setDefault(item, 'role', 'menuitemradio');
        setDefault(item, 'aria-checked', 'false');
      } else {
        setDefault(item, 'role', 'menuitem');
      }

      // Roving tabindex: the whole menu is reached by moving focus into it
      // programmatically, never by tabbing item to item.
      item.setAttribute('tabindex', '-1');
    }

    // A <li> that only exists to hold a menuitem must not be announced as a
    // list item — role="menu" children should be menuitems (or groups and
    // separators), and an intervening presentational <li> keeps the markup
    // valid HTML without adding a layer to the accessibility tree.
    for (const item of this.items) {
      const wrapper = item.closest('li');
      if (wrapper && wrapper.parentElement === this.list) setDefault(wrapper, 'role', 'none');
    }
    for (const separator of this.list.querySelectorAll('[role="separator"]')) {
      // A separator is not focusable and is skipped by arrow navigation.
      separator.setAttribute('aria-orientation', 'horizontal');
    }

    this.list.hidden = true;
  }

  _bindEvents() {
    this.trigger.addEventListener('click', () => this.toggle());
    this.trigger.addEventListener('keydown', this._onTriggerKeydown.bind(this));
    this.list.addEventListener('keydown', this._onMenuKeydown.bind(this));
    this.list.addEventListener('click', (event) => {
      const item = event.target.closest('[data-a11y-menu-item]');
      if (item && this.items.includes(item)) this.activate(item);
    });

    // pointerdown, not click: a click outside that lands on another button
    // should close this menu *before* that button's own handler runs.
    this._onPointerDownOutside = (event) => {
      if (!this.expanded) return;
      if (this.root.contains(event.target)) return;
      this.close({ restoreFocus: false });
    };
    document.addEventListener('pointerdown', this._onPointerDownOutside, true);

    // Focus leaving the menu entirely (Tab, or a click into a text field)
    // closes it without stealing focus back.
    this.root.addEventListener('focusout', (event) => {
      if (!this.expanded) return;
      if (this.root.contains(event.relatedTarget)) return;
      this.close({ restoreFocus: false });
    });
  }

  get enabledItems() {
    return this.items.filter(
      (item) => !item.disabled && item.getAttribute('aria-disabled') !== 'true' && !item.hidden,
    );
  }

  open({ focus = 'first' } = {}) {
    if (this.expanded) return this;
    this.expanded = true;
    this.list.hidden = false;
    this.trigger.setAttribute('aria-expanded', 'true');

    const items = this.enabledItems;
    if (items.length) {
      const target = focus === 'last' ? items[items.length - 1] : items[0];
      target.focus();
    }

    emit(this.root, 'a11y-menu:open', { menu: this });
    return this;
  }

  /**
   * @param {object} [options]
   * @param {boolean} [options.restoreFocus=true] Return focus to the trigger.
   *   False when the menu is closing *because* focus went somewhere else —
   *   yanking it back would fight the user.
   */
  close({ restoreFocus = true } = {}) {
    if (!this.expanded) return this;
    this.expanded = false;
    this.list.hidden = true;
    this.trigger.setAttribute('aria-expanded', 'false');
    this.typeahead.reset();

    if (restoreFocus) this.trigger.focus();
    emit(this.root, 'a11y-menu:close', { menu: this });
    return this;
  }

  toggle() {
    return this.expanded ? this.close() : this.open();
  }

  activate(item) {
    if (item.disabled || item.getAttribute('aria-disabled') === 'true') return this;

    const role = item.getAttribute('role');
    if (role === 'menuitemcheckbox') {
      item.setAttribute('aria-checked', item.getAttribute('aria-checked') === 'true' ? 'false' : 'true');
    } else if (role === 'menuitemradio') {
      // Radios are exclusive within their group, or within the menu if there
      // is no explicit group.
      const scope = item.closest('[role="group"]') ?? this.list;
      for (const sibling of scope.querySelectorAll('[role="menuitemradio"]')) {
        sibling.setAttribute('aria-checked', String(sibling === item));
      }
    }

    const detail = { item, value: item.dataset.value ?? item.textContent.trim(), menu: this };
    this.options.onSelect?.(detail);
    emit(this.root, 'a11y-menu:select', detail);

    // A checkbox item stays open by convention, so several can be toggled in
    // one visit. Everything else closes.
    if (this.options.closeOnSelect && role !== 'menuitemcheckbox') this.close();
    return this;
  }

  _focusItem(index) {
    const items = this.enabledItems;
    if (!items.length) return;
    const wrapped = (index + items.length) % items.length;
    items[wrapped].focus();
  }

  _currentIndex() {
    return this.enabledItems.indexOf(document.activeElement);
  }

  _onTriggerKeydown(event) {
    if (hasModifier(event)) return;

    switch (event.key) {
      case Keys.ArrowDown:
      case Keys.Enter:
      case Keys.Space:
        // Space and Enter are prevented because the click handler already
        // opens the menu; letting the default through would fire it twice and
        // the menu would open and immediately close.
        event.preventDefault();
        this.open({ focus: 'first' });
        return;
      case Keys.ArrowUp:
        event.preventDefault();
        this.open({ focus: 'last' });
        return;
      default:
    }
  }

  _onMenuKeydown(event) {
    const current = this._currentIndex();

    switch (event.key) {
      case Keys.ArrowDown:
        event.preventDefault();
        this._focusItem(current + 1);
        return;
      case Keys.ArrowUp:
        event.preventDefault();
        this._focusItem(current - 1);
        return;
      case Keys.Home:
        event.preventDefault();
        this._focusItem(0);
        return;
      case Keys.End:
        event.preventDefault();
        this._focusItem(this.enabledItems.length - 1);
        return;
      case Keys.Escape:
        event.preventDefault();
        // Stop here, so Escape inside a menu that is inside a dialog closes
        // only the menu.
        event.stopPropagation();
        this.close();
        return;
      case Keys.Tab:
        // APG: Tab closes the menu and moves focus onward. Not prevented — the
        // browser should complete the move.
        this.close({ restoreFocus: false });
        return;
      case Keys.Enter:
      case Keys.Space: {
        const item = event.target.closest('[data-a11y-menu-item]');
        if (!item) return;
        event.preventDefault();
        this.activate(item);
        return;
      }
      default: {
        const items = this.enabledItems;
        const index = this.typeahead.match(event, items.map((i) => i.textContent), current);
        if (index === -1) return;
        event.preventDefault();
        items[index].focus();
      }
    }
  }

  destroy() {
    document.removeEventListener('pointerdown', this._onPointerDownOutside, true);
  }
}

export function initMenus(scope = document) {
  return Array.from(scope.querySelectorAll('[data-a11y-menu]')).map((root) => new Menu(root));
}
