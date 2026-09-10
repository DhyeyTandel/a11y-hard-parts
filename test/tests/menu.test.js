import { describe, it, assert, mount, press, click, focus } from '../harness.js';
import { Menu } from '../../src/components/menu/menu.js';
import { Typeahead } from '../../src/utils/typeahead.js';
import { Keys } from '../../src/utils/keys.js';

const MARKUP = `
  <button id="before">before</button>
  <div class="a11y-menu" data-a11y-menu>
    <button data-a11y-menu-trigger>Actions</button>
    <ul class="a11y-menu__list" data-a11y-menu-list>
      <li><button class="a11y-menu__item" data-a11y-menu-item>Rename</button></li>
      <li><button class="a11y-menu__item" data-a11y-menu-item>Duplicate</button></li>
      <li><button class="a11y-menu__item" data-a11y-menu-item aria-disabled="true">Move</button></li>
      <li role="separator" class="a11y-menu__separator"></li>
      <li><button class="a11y-menu__item" data-a11y-menu-item data-a11y-menu-checkbox>Show hidden</button></li>
      <li><button class="a11y-menu__item" data-a11y-menu-item>Delete</button></li>
    </ul>
  </div>
`;

function setup(options = {}) {
  const root = mount(MARKUP);
  const menu = new Menu(root.querySelector('[data-a11y-menu]'), options);
  return {
    root,
    menu,
    trigger: root.querySelector('[data-a11y-menu-trigger]'),
    items: Array.from(root.querySelectorAll('[data-a11y-menu-item]')),
  };
}

describe('Menu — ARIA', () => {
  it('names what pops up, not just that something does', () => {
    const { trigger } = setup();
    assert.attribute(trigger, 'aria-haspopup', 'menu');
    assert.attribute(trigger, 'aria-expanded', 'false');
  });

  it('gives the menu its name from the button that opens it', () => {
    const { root, trigger } = setup();
    assert.attribute(root.querySelector('[data-a11y-menu-list]'), 'aria-labelledby', trigger.id);
  });

  it('assigns menuitem, menuitemcheckbox and menuitemradio roles', () => {
    const { items } = setup();
    assert.attribute(items[0], 'role', 'menuitem');
    assert.attribute(items[3], 'role', 'menuitemcheckbox');
    assert.attribute(items[3], 'aria-checked', 'false');
  });

  it('removes the list-item layer between the menu and its items', () => {
    const { items } = setup();
    assert.attribute(items[0].closest('li'), 'role', 'none');
  });

  it('keeps every item out of the tab order (roving focus, not tab stops)', () => {
    const { items } = setup();
    for (const item of items) assert.attribute(item, 'tabindex', '-1');
  });
});

describe('Menu — opening', () => {
  it('opens on Enter, Space and ArrowDown with the first item focused', () => {
    for (const key of [Keys.Enter, Keys.Space, Keys.ArrowDown]) {
      const { menu, trigger, items } = setup();
      trigger.focus();
      const { defaultPrevented } = press(trigger, key);
      assert.ok(defaultPrevented, `${key} must be prevented or the menu opens and closes`);
      assert.attribute(trigger, 'aria-expanded', 'true');
      assert.focused(items[0]);
      menu.destroy();
    }
  });

  it('opens on ArrowUp with the last item focused', () => {
    const { trigger, items } = setup();
    trigger.focus();
    press(trigger, Keys.ArrowUp);
    assert.focused(items[items.length - 1]);
  });

  it('moves real DOM focus into the menu, unlike a combobox', () => {
    const { menu, items } = setup();
    menu.open();
    assert.focused(items[0], 'a menu is not an activedescendant widget');
  });
});

describe('Menu — navigation', () => {
  it('wraps with ArrowDown and ArrowUp', () => {
    const { menu, items } = setup();
    menu.open();
    press(items[0], Keys.ArrowDown);
    assert.focused(items[1]);

    // items[2] is aria-disabled and must be stepped over.
    press(items[1], Keys.ArrowDown);
    assert.focused(items[3]);

    press(items[3], Keys.ArrowUp);
    assert.focused(items[1]);
  });

  it('jumps to the first and last enabled item with Home and End', () => {
    const { menu, items } = setup();
    menu.open();
    press(items[0], Keys.End);
    assert.focused(items[4], 'Delete');
    press(items[4], Keys.Home);
    assert.focused(items[0]);
  });

  it('finds items by first character', () => {
    const { menu, items } = setup();
    menu.open();
    press(items[0], 'd');
    assert.focused(items[1], 'Duplicate');
  });

  it('cycles through items sharing a first character on repeat presses', () => {
    const { menu, items } = setup();
    menu.open();
    press(items[0], 'd');
    assert.focused(items[1], 'Duplicate');
    press(items[1], 'd');
    assert.focused(items[4], 'Delete');
    press(items[4], 'd');
    assert.focused(items[1], 'back to Duplicate');
  });
});

describe('Menu — closing', () => {
  it('closes on Escape and returns focus to the trigger', () => {
    const { menu, trigger, items } = setup();
    menu.open();
    press(items[0], Keys.Escape);

    assert.attribute(trigger, 'aria-expanded', 'false');
    assert.focused(trigger, 'losing focus to <body> would strand the user');
  });

  it('closes on Tab without stealing focus back', () => {
    const { menu, trigger, items } = setup();
    menu.open();
    const { defaultPrevented } = press(items[0], Keys.Tab);

    assert.notOk(defaultPrevented, 'Tab must complete, so focus moves onward');
    assert.attribute(trigger, 'aria-expanded', 'false');
    assert.notFocused(trigger);
  });

  it('activates an item, closes, and restores focus', () => {
    const selected = [];
    const { menu, trigger, items } = setup({ onSelect: (d) => selected.push(d.value) });
    menu.open();
    press(items[1], Keys.Enter);

    assert.deepEqual(selected, ['Duplicate']);
    assert.attribute(trigger, 'aria-expanded', 'false');
    assert.focused(trigger);
  });

  it('ignores activation of a disabled item', () => {
    const selected = [];
    const { menu, items } = setup({ onSelect: (d) => selected.push(d.value) });
    menu.open();
    menu.activate(items[2]);
    assert.deepEqual(selected, []);
  });

  it('closes on a pointer press outside', () => {
    const { menu, root, trigger } = setup();
    menu.open();
    root.querySelector('#before').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    assert.attribute(trigger, 'aria-expanded', 'false');
  });
});

describe('Menu — checkbox and radio items', () => {
  it('toggles aria-checked and stays open, so several can be set at once', () => {
    const { menu, trigger, items } = setup();
    menu.open();
    menu.activate(items[3]);

    assert.attribute(items[3], 'aria-checked', 'true');
    assert.attribute(trigger, 'aria-expanded', 'true', 'a checkbox item does not dismiss the menu');

    menu.activate(items[3]);
    assert.attribute(items[3], 'aria-checked', 'false');
  });

  it('makes radio items exclusive within their group', () => {
    const root = mount(`
      <div data-a11y-menu>
        <button data-a11y-menu-trigger>View</button>
        <ul data-a11y-menu-list>
          <li role="group" aria-label="Sort by">
            <button data-a11y-menu-item data-a11y-menu-radio id="r1">Name</button>
            <button data-a11y-menu-item data-a11y-menu-radio id="r2">Date</button>
          </li>
        </ul>
      </div>
    `);
    const menu = new Menu(root.querySelector('[data-a11y-menu]'));
    menu.open();
    menu.activate(root.querySelector('#r1'));
    assert.attribute(root.querySelector('#r1'), 'aria-checked', 'true');
    assert.attribute(root.querySelector('#r2'), 'aria-checked', 'false');

    menu.open();
    menu.activate(root.querySelector('#r2'));
    assert.attribute(root.querySelector('#r1'), 'aria-checked', 'false');
    assert.attribute(root.querySelector('#r2'), 'aria-checked', 'true');
    menu.destroy();
  });
});

describe('Typeahead', () => {
  const labels = ['Amsterdam', 'Athens', 'Berlin', 'Boston', 'Stockholm'];

  it('matches on a single character, starting after the current item', () => {
    const typeahead = new Typeahead();
    assert.equal(typeahead.match(new KeyboardEvent('keydown', { key: 'b' }), labels, 0), 2);
  });

  it('builds a multi-character buffer', () => {
    const typeahead = new Typeahead();
    typeahead.match(new KeyboardEvent('keydown', { key: 's' }), labels, 0);
    assert.equal(typeahead.match(new KeyboardEvent('keydown', { key: 't' }), labels, 0), 4, 'Stockholm');
  });

  it('cycles on a repeated character rather than searching for "bb"', () => {
    const typeahead = new Typeahead();
    assert.equal(typeahead.match(new KeyboardEvent('keydown', { key: 'b' }), labels, 0), 2);
    assert.equal(typeahead.match(new KeyboardEvent('keydown', { key: 'b' }), labels, 2), 3);
    assert.equal(typeahead.match(new KeyboardEvent('keydown', { key: 'b' }), labels, 3), 2);
  });

  it('ignores modified keystrokes, so ⌘S still saves', () => {
    const typeahead = new Typeahead();
    assert.equal(typeahead.match(new KeyboardEvent('keydown', { key: 's', metaKey: true }), labels, 0), -1);
  });

  it('ignores keys that are not printable characters', () => {
    const typeahead = new Typeahead();
    assert.equal(typeahead.match(new KeyboardEvent('keydown', { key: 'Tab' }), labels, 0), -1);
  });

  it('ignores IME composition', () => {
    const typeahead = new Typeahead();
    const event = new KeyboardEvent('keydown', { key: 'a' });
    Object.defineProperty(event, 'isComposing', { value: true });
    assert.equal(typeahead.match(event, labels, 0), -1);
  });

  it('returns -1 when nothing matches', () => {
    const typeahead = new Typeahead();
    assert.equal(typeahead.match(new KeyboardEvent('keydown', { key: 'z' }), labels, 0), -1);
  });
});
