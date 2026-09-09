import { Keys } from '../../utils/keys.js';
import { ensureId, setDefault, emit } from '../../utils/dom.js';

/**
 * Accordion — APG "Accordion".
 *
 * The part people skip: **heading structure**. Each accordion header must be a
 * real heading element at the correct level, wrapping a button:
 *
 *   <h3><button data-a11y-accordion-trigger>Shipping</button></h3>
 *
 * Not the other way round, and not a `<div role="heading">` unless you have
 * no choice. Screen reader users navigate long pages by pulling up a list of
 * headings; an accordion whose sections are not headings is invisible to that
 * workflow, and the user has to arrow through the whole page to find anything.
 *
 * The level must fit the surrounding outline — if the accordion sits under an
 * `<h2>`, its headers are `<h3>`. This component checks and warns rather than
 * rewriting the level, because only the page author knows the outline.
 */
export class Accordion {
  /**
   * @param {Element} root
   * @param {object} [options]
   * @param {boolean} [options.multiple=true] Allow several panels open at once.
   * @param {boolean} [options.allowCollapseAll=true]
   * @param {boolean} [options.regionPanels=true] Give panels `role="region"`.
   */
  constructor(root, options = {}) {
    this.root = root;
    this.options = { multiple: true, allowCollapseAll: true, regionPanels: true, ...options };

    this.triggers = Array.from(root.querySelectorAll('[data-a11y-accordion-trigger]'));
    this.panels = this.triggers.map((trigger) => {
      const id = trigger.getAttribute('aria-controls');
      return id ? root.querySelector(`#${CSS.escape(id)}`) : trigger.parentElement?.nextElementSibling;
    });

    this._applyStaticAria();
    root.addEventListener('click', this._onClick.bind(this));
    root.addEventListener('keydown', this._onKeydown.bind(this));
    this._syncDisabledState();
  }

  _applyStaticAria() {
    this.triggers.forEach((trigger, index) => {
      const panel = this.panels[index];
      if (!panel) {
        console.warn('[Accordion] Trigger has no panel.', trigger);
        return;
      }

      if (trigger.tagName === 'BUTTON') setDefault(trigger, 'type', 'button');
      ensureId(trigger, 'accordion-trigger');
      setDefault(trigger, 'aria-controls', ensureId(panel, 'accordion-panel'));
      setDefault(trigger, 'aria-expanded', 'false');

      const heading = trigger.closest('h1, h2, h3, h4, h5, h6');
      if (!heading) {
        console.warn(
          '[Accordion] Trigger is not inside a heading element. Wrap it in an ' +
            '<h2>–<h6> that matches the surrounding document outline, or screen ' +
            'reader users cannot navigate this accordion by headings.',
          trigger,
        );
      } else if (heading.firstElementChild !== trigger || heading.children.length !== 1) {
        console.warn(
          '[Accordion] The heading should contain the button and nothing else.',
          heading,
        );
      }

      if (this.options.regionPanels) {
        // role="region" makes each panel a landmark, so it appears in the
        // rotor's landmark list. Worth it for a handful of substantial
        // sections; skip it (regionPanels: false) for a long FAQ, where
        // 40 landmarks is noise rather than navigation.
        setDefault(panel, 'role', 'region');
        setDefault(panel, 'aria-labelledby', trigger.id);
      }

      panel.hidden = trigger.getAttribute('aria-expanded') !== 'true';
    });
  }

  get openIndexes() {
    return this.triggers.reduce((acc, trigger, index) => {
      if (trigger.getAttribute('aria-expanded') === 'true') acc.push(index);
      return acc;
    }, []);
  }

  isOpen(index) {
    return this.triggers[index]?.getAttribute('aria-expanded') === 'true';
  }

  open(index) {
    const trigger = this.triggers[index];
    const panel = this.panels[index];
    if (!trigger || !panel || this.isOpen(index)) return this;

    if (!this.options.multiple) {
      this.openIndexes.forEach((i) => i !== index && this._setState(i, false));
    }
    this._setState(index, true);
    this._syncDisabledState();
    emit(this.root, 'a11y-accordion:change', { index, expanded: true, accordion: this });
    return this;
  }

  close(index) {
    if (!this.isOpen(index)) return this;
    if (!this.options.allowCollapseAll && this.openIndexes.length === 1) return this;

    this._setState(index, false);
    this._syncDisabledState();
    emit(this.root, 'a11y-accordion:change', { index, expanded: false, accordion: this });
    return this;
  }

  toggle(index) {
    return this.isOpen(index) ? this.close(index) : this.open(index);
  }

  _setState(index, expanded) {
    this.triggers[index].setAttribute('aria-expanded', String(expanded));
    this.panels[index].hidden = !expanded;
  }

  _syncDisabledState() {
    if (this.options.allowCollapseAll) return;
    const open = this.openIndexes;
    this.triggers.forEach((trigger, index) => {
      // aria-disabled, never the `disabled` attribute: a disabled button is
      // removed from the tab order, so the user would tab into an accordion
      // and find the currently open section mysteriously unreachable.
      const soleOpen = open.length === 1 && open[0] === index;
      if (soleOpen) trigger.setAttribute('aria-disabled', 'true');
      else trigger.removeAttribute('aria-disabled');
    });
  }

  _onClick(event) {
    const trigger = event.target.closest('[data-a11y-accordion-trigger]');
    if (!trigger || !this.root.contains(trigger)) return;
    const index = this.triggers.indexOf(trigger);
    if (index !== -1) this.toggle(index);
  }

  _onKeydown(event) {
    const trigger = event.target.closest('[data-a11y-accordion-trigger]');
    if (!trigger) return;
    const current = this.triggers.indexOf(trigger);
    if (current === -1) return;

    const count = this.triggers.length;
    let next = null;

    switch (event.key) {
      // Arrow navigation between headers is optional in the APG, but it is
      // what makes a long accordion usable: without it the only way from
      // section 1 to section 8 is tabbing through everything inside them.
      case Keys.ArrowDown: next = (current + 1) % count; break;
      case Keys.ArrowUp: next = (current - 1 + count) % count; break;
      case Keys.Home: next = 0; break;
      case Keys.End: next = count - 1; break;
      default: return;
    }

    event.preventDefault();
    this.triggers[next].focus();
  }
}

export function initAccordions(scope = document) {
  return Array.from(scope.querySelectorAll('[data-a11y-accordion]')).map(
    (root) =>
      new Accordion(root, {
        multiple: root.dataset.a11yAccordionMultiple !== 'false',
        allowCollapseAll: root.dataset.a11yAccordionCollapseAll !== 'false',
        regionPanels: root.dataset.a11yAccordionRegions !== 'false',
      }),
  );
}
