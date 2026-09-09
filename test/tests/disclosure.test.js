import { describe, it, assert, mount, press, click } from '../harness.js';
import { Disclosure } from '../../src/components/disclosure/disclosure.js';
import { Accordion } from '../../src/components/accordion/accordion.js';
import { Keys } from '../../src/utils/keys.js';

describe('Disclosure', () => {
  const MARKUP = `
    <button id="trigger" data-a11y-disclosure aria-controls="panel">Shipping options</button>
    <div id="panel">Panel content</div>
  `;

  it('starts collapsed with aria-expanded on the control', () => {
    const root = mount(MARKUP);
    new Disclosure(root.querySelector('#trigger'));
    assert.attribute(root.querySelector('#trigger'), 'aria-expanded', 'false');
    assert.ok(root.querySelector('#panel').hidden);
  });

  it('toggles both the state and the panel on click', () => {
    const root = mount(MARKUP);
    const trigger = root.querySelector('#trigger');
    new Disclosure(trigger);

    click(trigger);
    assert.attribute(trigger, 'aria-expanded', 'true');
    assert.notOk(root.querySelector('#panel').hidden);

    click(trigger);
    assert.attribute(trigger, 'aria-expanded', 'false');
    assert.ok(root.querySelector('#panel').hidden);
  });

  it('hides the panel from everyone, not just from sighted users', () => {
    const root = mount(MARKUP);
    new Disclosure(root.querySelector('#trigger'));
    const panel = root.querySelector('#panel');

    assert.ok(panel.hidden, 'hidden removes it from the tab order and the a11y tree');
    assert.noAttribute(
      panel,
      'aria-hidden',
      'aria-hidden alone would leave the content tabbable but unreadable',
    );
  });
});

describe('Accordion', () => {
  const MARKUP = `
    <div data-a11y-accordion>
      <h3 class="a11y-accordion__heading"><button data-a11y-accordion-trigger aria-controls="s1">One</button></h3>
      <div id="s1">First</div>
      <h3 class="a11y-accordion__heading"><button data-a11y-accordion-trigger aria-controls="s2">Two</button></h3>
      <div id="s2">Second</div>
      <h3 class="a11y-accordion__heading"><button data-a11y-accordion-trigger aria-controls="s3">Three</button></h3>
      <div id="s3">Third</div>
    </div>
  `;

  function setup(options = {}) {
    const root = mount(MARKUP);
    const accordion = new Accordion(root.querySelector('[data-a11y-accordion]'), options);
    return { root, accordion, triggers: Array.from(root.querySelectorAll('[data-a11y-accordion-trigger]')) };
  }

  it('keeps each trigger inside a real heading', () => {
    const { triggers } = setup();
    for (const trigger of triggers) {
      assert.ok(
        trigger.closest('h1, h2, h3, h4, h5, h6'),
        'heading navigation is how screen reader users move through a long page',
      );
    }
  });

  it('labels each panel from its trigger and exposes it as a region', () => {
    const { root, triggers } = setup();
    assert.attribute(root.querySelector('#s1'), 'role', 'region');
    assert.attribute(root.querySelector('#s1'), 'aria-labelledby', triggers[0].id);
  });

  it('can omit the region role when there are too many panels to be useful', () => {
    const root = mount(MARKUP);
    new Accordion(root.querySelector('[data-a11y-accordion]'), { regionPanels: false });
    assert.noAttribute(root.querySelector('#s1'), 'role');
  });

  it('opens and closes independently by default', () => {
    const { accordion, triggers } = setup();
    accordion.open(0);
    accordion.open(1);
    assert.deepEqual(
      triggers.map((t) => t.getAttribute('aria-expanded')),
      ['true', 'true', 'false'],
    );
  });

  it('closes the others in single-select mode', () => {
    const { accordion, triggers } = setup({ multiple: false });
    accordion.open(0);
    accordion.open(2);
    assert.deepEqual(
      triggers.map((t) => t.getAttribute('aria-expanded')),
      ['false', 'false', 'true'],
    );
  });

  it('uses aria-disabled, not disabled, to pin the last open panel', () => {
    const { accordion, triggers } = setup({ multiple: false, allowCollapseAll: false });
    accordion.open(1);

    assert.attribute(triggers[1], 'aria-disabled', 'true');
    assert.notOk(triggers[1].disabled, 'a disabled button would drop out of the tab order');

    accordion.close(1);
    assert.attribute(triggers[1], 'aria-expanded', 'true', 'the sole open panel stays open');
  });

  it('moves between headers with the arrow keys, Home and End', () => {
    const { triggers } = setup();
    triggers[0].focus();

    press(triggers[0], Keys.ArrowDown);
    assert.focused(triggers[1]);

    press(triggers[1], Keys.End);
    assert.focused(triggers[2]);

    press(triggers[2], Keys.ArrowDown);
    assert.focused(triggers[0], 'arrow navigation wraps');

    press(triggers[0], Keys.ArrowUp);
    assert.focused(triggers[2]);

    press(triggers[2], Keys.Home);
    assert.focused(triggers[0]);
  });
});
