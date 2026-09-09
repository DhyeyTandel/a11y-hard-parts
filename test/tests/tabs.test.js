import { describe, it, assert, mount, press, click } from '../harness.js';
import { Tabs } from '../../src/components/tabs/tabs.js';
import { Keys } from '../../src/utils/keys.js';

const MARKUP = `
  <div data-a11y-tabs>
    <div class="a11y-tabs__list" role="tablist" aria-label="Account settings">
      <button class="a11y-tabs__tab" data-a11y-tab aria-controls="p1">Profile</button>
      <button class="a11y-tabs__tab" data-a11y-tab aria-controls="p2">Billing</button>
      <button class="a11y-tabs__tab" data-a11y-tab aria-controls="p3">Sessions</button>
    </div>
    <div class="a11y-tabs__panel" id="p1" data-a11y-tabpanel><a href="#x">a link</a></div>
    <div class="a11y-tabs__panel" id="p2" data-a11y-tabpanel>Just text, nothing focusable.</div>
    <div class="a11y-tabs__panel" id="p3" data-a11y-tabpanel><button>Revoke</button></div>
  </div>
`;

function setup(options = {}) {
  const root = mount(MARKUP);
  const tabs = new Tabs(root.querySelector('[data-a11y-tabs]'), options);
  return { root, tabs, buttons: Array.from(root.querySelectorAll('[data-a11y-tab]')) };
}

describe('Tabs — structure', () => {
  it('applies tab and tabpanel roles and links them both ways', () => {
    const { root, buttons } = setup();
    assert.attribute(buttons[0], 'role', 'tab');
    assert.attribute(root.querySelector('#p1'), 'role', 'tabpanel');
    assert.attribute(root.querySelector('#p1'), 'aria-labelledby', buttons[0].id);
    assert.attribute(buttons[0], 'aria-controls', 'p1');
  });

  it('shows only the selected panel', () => {
    const { root } = setup();
    assert.notOk(root.querySelector('#p1').hidden);
    assert.ok(root.querySelector('#p2').hidden);
    assert.ok(root.querySelector('#p3').hidden);
  });
});

describe('Tabs — roving tabindex', () => {
  it('keeps the tab list to a single tab stop', () => {
    const { buttons } = setup();
    assert.attribute(buttons[0], 'tabindex', '0');
    assert.attribute(buttons[1], 'tabindex', '-1');
    assert.attribute(buttons[2], 'tabindex', '-1');
  });

  it('moves the tab stop with the selection', () => {
    const { tabs, buttons } = setup();
    tabs.select(2);
    assert.attribute(buttons[0], 'tabindex', '-1');
    assert.attribute(buttons[2], 'tabindex', '0');
  });

  it('marks exactly one tab aria-selected', () => {
    const { tabs, buttons } = setup();
    tabs.select(1);
    assert.deepEqual(
      buttons.map((b) => b.getAttribute('aria-selected')),
      ['false', 'true', 'false'],
    );
  });
});

describe('Tabs — keyboard (automatic activation)', () => {
  it('moves and selects with ArrowRight / ArrowLeft', () => {
    const { tabs, buttons } = setup();
    buttons[0].focus();

    press(buttons[0], Keys.ArrowRight);
    assert.focused(buttons[1]);
    assert.attribute(buttons[1], 'aria-selected', 'true');

    press(buttons[1], Keys.ArrowLeft);
    assert.focused(buttons[0]);
    assert.attribute(buttons[0], 'aria-selected', 'true');
  });

  it('wraps at both ends', () => {
    const { buttons } = setup();
    buttons[0].focus();
    press(buttons[0], Keys.ArrowLeft);
    assert.focused(buttons[2]);

    press(buttons[2], Keys.ArrowRight);
    assert.focused(buttons[0]);
  });

  it('jumps to first and last with Home and End', () => {
    const { buttons } = setup();
    buttons[1].focus();
    press(buttons[1], Keys.End);
    assert.focused(buttons[2]);

    press(buttons[2], Keys.Home);
    assert.focused(buttons[0]);
  });

  it('ignores the arrows for the other axis', () => {
    const { buttons } = setup();
    buttons[0].focus();
    const { defaultPrevented } = press(buttons[0], Keys.ArrowDown);
    assert.notOk(defaultPrevented, 'a horizontal tablist must leave ArrowDown to the page');
    assert.focused(buttons[0]);
  });
});

describe('Tabs — keyboard (manual activation)', () => {
  it('moves focus without changing the selection', () => {
    const { buttons } = setup({ activation: 'manual' });
    buttons[0].focus();
    press(buttons[0], Keys.ArrowRight);

    assert.focused(buttons[1]);
    assert.attribute(buttons[1], 'aria-selected', 'false');
    assert.attribute(buttons[0], 'aria-selected', 'true');
  });

  it('keeps the tab stop on the focused tab so Tab leaves from where the user is', () => {
    const { buttons } = setup({ activation: 'manual' });
    buttons[0].focus();
    press(buttons[0], Keys.ArrowRight);
    assert.attribute(buttons[1], 'tabindex', '0');
  });

  it('selects on Enter and on Space', () => {
    const { buttons } = setup({ activation: 'manual' });
    buttons[0].focus();
    press(buttons[0], Keys.ArrowRight);
    press(buttons[1], Keys.Enter);
    assert.attribute(buttons[1], 'aria-selected', 'true');

    press(buttons[1], Keys.ArrowRight);
    const { defaultPrevented } = press(buttons[2], Keys.Space);
    assert.ok(defaultPrevented, 'Space must be prevented or the page scrolls');
    assert.attribute(buttons[2], 'aria-selected', 'true');
  });
});

describe('Tabs — vertical orientation', () => {
  it('advertises the orientation and swaps the arrow axis', () => {
    const { root, buttons } = setup({ orientation: 'vertical' });
    assert.attribute(root.querySelector('[role="tablist"]'), 'aria-orientation', 'vertical');

    buttons[0].focus();
    press(buttons[0], Keys.ArrowDown);
    assert.focused(buttons[1]);

    const { defaultPrevented } = press(buttons[1], Keys.ArrowRight);
    assert.notOk(defaultPrevented);
  });
});

describe('Tabs — panel focusability', () => {
  it('makes a panel with no focusable content reachable with Tab', () => {
    const { root, tabs } = setup();
    tabs.select(1);
    assert.attribute(root.querySelector('#p2'), 'tabindex', '0');
  });

  it('leaves a panel that already contains focusable content alone', () => {
    const { root, tabs } = setup();
    tabs.select(2);
    assert.noAttribute(
      root.querySelector('#p3'),
      'tabindex',
      'adding a stop here costs the user an extra Tab for nothing',
    );
  });
});
