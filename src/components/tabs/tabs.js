import { Keys } from '../../utils/keys.js';
import { ensureId, setDefault, emit } from '../../utils/dom.js';
import { getTabbables } from '../../utils/focusable.js';

/**
 * Tabs — APG "Tabs".
 *
 * Roving tabindex: the tab list is **one** tab stop. Tab moves into the
 * selected tab and then straight out to the panel; the arrow keys move between
 * tabs. Giving every tab `tabindex="0"` is the common mistake — it turns a
 * ten-tab strip into ten tab stops the keyboard user has to walk through to
 * reach the content.
 *
 * Expected markup:
 *
 *   <div data-a11y-tabs>
 *     <div role="tablist" aria-label="Sections">
 *       <button data-a11y-tab aria-controls="panel-1">One</button>
 *     </div>
 *     <div id="panel-1" data-a11y-tabpanel>...</div>
 *   </div>
 */
export class Tabs {
  /**
   * @param {Element} root
   * @param {object} [options]
   * @param {'automatic'|'manual'} [options.activation='automatic']
   *   `automatic` selects on arrow. `manual` requires Enter/Space. Use manual
   *   when a panel is expensive to render or fetches on show — otherwise
   *   arrowing through the strip fires a request per tab.
   * @param {'horizontal'|'vertical'} [options.orientation='horizontal']
   */
  constructor(root, options = {}) {
    this.root = root;
    this.options = { activation: 'automatic', orientation: 'horizontal', ...options };

    this.tablist = root.querySelector('[role="tablist"]');
    this.tabs = Array.from(root.querySelectorAll('[data-a11y-tab]'));
    this.panels = this.tabs.map((tab) => {
      const id = tab.getAttribute('aria-controls');
      return id ? root.querySelector(`#${CSS.escape(id)}`) : null;
    });

    if (!this.tablist || this.tabs.length === 0) {
      throw new Error('[Tabs] Requires [role="tablist"] and at least one [data-a11y-tab].');
    }

    this.selectedIndex = Math.max(0, this.tabs.findIndex((tab) => tab.hasAttribute('data-a11y-tab-selected')));

    this._applyStaticAria();
    this._bindEvents();
    this.select(this.selectedIndex, { focus: false, emitEvent: false });
  }

  _applyStaticAria() {
    if (this.options.orientation === 'vertical') {
      this.tablist.setAttribute('aria-orientation', 'vertical');
    }
    if (!this.tablist.hasAttribute('aria-label') && !this.tablist.hasAttribute('aria-labelledby')) {
      console.warn(
        '[Tabs] The tablist has no accessible name. Add aria-label so the user ' +
          'knows what this set of tabs controls.',
        this.tablist,
      );
    }

    this.tabs.forEach((tab, index) => {
      setDefault(tab, 'role', 'tab');
      if (tab.tagName === 'BUTTON') setDefault(tab, 'type', 'button');
      ensureId(tab, 'tab');

      const panel = this.panels[index];
      if (!panel) {
        console.warn('[Tabs] Tab has no matching panel via aria-controls.', tab);
        return;
      }
      setDefault(panel, 'role', 'tabpanel');
      setDefault(tab, 'aria-controls', ensureId(panel, 'tabpanel'));
      // The panel takes its name from its tab, so the screen reader announces
      // "Billing, tab panel" when the user lands in it.
      setDefault(panel, 'aria-labelledby', tab.id);
    });
  }

  _bindEvents() {
    this.tablist.addEventListener('keydown', this._onKeydown.bind(this));
    this.tablist.addEventListener('click', (event) => {
      const tab = event.target.closest('[data-a11y-tab]');
      if (!tab) return;
      const index = this.tabs.indexOf(tab);
      if (index !== -1) this.select(index);
    });
  }

  /**
   * @param {number} index
   * @param {object} [options]
   * @param {boolean} [options.focus=true]
   */
  select(index, { focus = true, emitEvent = true } = {}) {
    if (index < 0 || index >= this.tabs.length) return this;

    this.tabs.forEach((tab, i) => {
      const selected = i === index;
      tab.setAttribute('aria-selected', String(selected));
      // Roving tabindex: only the selected tab is in the tab order.
      tab.setAttribute('tabindex', selected ? '0' : '-1');

      const panel = this.panels[i];
      if (!panel) return;
      panel.hidden = !selected;

      if (selected) {
        // APG: a panel with no focusable content of its own needs tabindex="0",
        // so Tab from the tab strip reaches the content and the screen reader
        // can read it. If the panel *does* contain focusable content, adding a
        // stop here just makes the user press Tab one extra time.
        // Computed on show, because panel content can change.
        if (getTabbables(panel).length === 0) panel.setAttribute('tabindex', '0');
        else panel.removeAttribute('tabindex');
      }
    });

    this.selectedIndex = index;
    if (focus) this.tabs[index].focus();
    if (emitEvent) {
      emit(this.root, 'a11y-tabs:change', { index, tab: this.tabs[index], panel: this.panels[index] });
    }
    return this;
  }

  /** Move visual focus without necessarily selecting (manual activation). */
  focusTab(index) {
    const tab = this.tabs[index];
    if (!tab) return;
    if (this.options.activation === 'automatic') {
      this.select(index);
    } else {
      // Manual: keep the roving tabindex on the focused tab so Tab still
      // leaves from where the user is looking.
      this.tabs.forEach((t, i) => t.setAttribute('tabindex', i === index ? '0' : '-1'));
      tab.focus();
    }
  }

  _step(from, delta) {
    const count = this.tabs.length;
    let next = (from + delta + count) % count;
    let guard = 0;
    // Skip disabled tabs rather than landing on a dead stop.
    while (this.tabs[next].disabled && guard < count) {
      next = (next + delta + count) % count;
      guard += 1;
    }
    return next;
  }

  _onKeydown(event) {
    const current = this.tabs.indexOf(event.target.closest('[data-a11y-tab]'));
    if (current === -1) return;

    const vertical = this.options.orientation === 'vertical';
    const next = vertical ? Keys.ArrowDown : Keys.ArrowRight;
    const previous = vertical ? Keys.ArrowUp : Keys.ArrowLeft;

    switch (event.key) {
      case next:
        event.preventDefault();
        this.focusTab(this._step(current, 1));
        return;
      case previous:
        event.preventDefault();
        this.focusTab(this._step(current, -1));
        return;
      case Keys.Home:
        event.preventDefault();
        this.focusTab(this._step(-1, 1));
        return;
      case Keys.End:
        event.preventDefault();
        this.focusTab(this._step(0, -1));
        return;
      case Keys.Enter:
      case Keys.Space:
        if (this.options.activation === 'manual') {
          // Space must be prevented or the page scrolls underneath.
          event.preventDefault();
          this.select(current);
        }
        return;
      default:
        // Every other key — including the arrows for the *other* axis — is
        // left alone, so the user's normal navigation still works.
        break;
    }
  }
}

export function initTabs(scope = document) {
  return Array.from(scope.querySelectorAll('[data-a11y-tabs]')).map(
    (root) =>
      new Tabs(root, {
        activation: root.dataset.a11yTabsActivation === 'manual' ? 'manual' : 'automatic',
        orientation: root.dataset.a11yTabsOrientation === 'vertical' ? 'vertical' : 'horizontal',
      }),
  );
}
