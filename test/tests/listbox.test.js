import { describe, it, assert, mount, press, click } from '../harness.js';
import { Listbox } from '../../src/components/listbox/listbox.js';
import { Keys } from '../../src/utils/keys.js';

const CITIES = ['Amsterdam', 'Athens', 'Berlin', 'Boston', 'Copenhagen'];

const MARKUP = `
  <div class="a11y-listbox" data-a11y-listbox>
    <span class="a11y-listbox__label" id="city-label">City</span>
    <ul class="a11y-listbox__list" data-a11y-listbox-list aria-labelledby="city-label">
      ${CITIES.map((c) => `<li class="a11y-listbox__option" data-a11y-listbox-option>${c}</li>`).join('')}
    </ul>
  </div>
`;

function setup(options = {}) {
  const root = mount(MARKUP);
  const listbox = new Listbox(root.querySelector('[data-a11y-listbox]'), options);
  return {
    root,
    listbox,
    list: root.querySelector('[data-a11y-listbox-list]'),
    items: Array.from(root.querySelectorAll('[data-a11y-listbox-option]')),
  };
}

const selectedLabels = (items) =>
  items.filter((o) => o.getAttribute('aria-selected') === 'true').map((o) => o.textContent);

describe('Listbox — ARIA', () => {
  it('makes the list the tab stop, never the options', () => {
    const { list, items } = setup();
    assert.attribute(list, 'tabindex', '0');
    for (const item of items) assert.noAttribute(item, 'tabindex');
  });

  it('gives every option an id, so aria-activedescendant can point at one', () => {
    const { items } = setup();
    for (const item of items) assert.ok(item.id, 'options need ids');
  });

  it('advertises multi-select', () => {
    const { list } = setup({ multiple: true });
    assert.attribute(list, 'aria-multiselectable', 'true');
  });

  it('states aria-selected on every option when multi-select', () => {
    const { items } = setup({ multiple: true });
    for (const item of items) assert.attribute(item, 'aria-selected', 'false');
  });

  it('leaves aria-selected off unselected options when single-select', () => {
    const { items, listbox } = setup();
    listbox.select(2);
    assert.attribute(items[2], 'aria-selected', 'true');
    assert.noAttribute(items[0], 'aria-selected');
  });
});

describe('Listbox — single select', () => {
  it('starts with the first option active', () => {
    const { list, items } = setup();
    assert.attribute(list, 'aria-activedescendant', items[0].id);
  });

  it('lets selection follow focus', () => {
    const { list, items } = setup();
    press(list, Keys.ArrowDown);
    assert.attribute(list, 'aria-activedescendant', items[1].id);
    assert.deepEqual(selectedLabels(items), ['Athens']);
  });

  it('can separate selection from focus when selecting has side effects', () => {
    const { list, items } = setup({ followFocus: false });
    press(list, Keys.ArrowDown);
    assert.attribute(list, 'aria-activedescendant', items[1].id);
    assert.deepEqual(selectedLabels(items), [], 'moving must not commit');

    press(list, Keys.Enter);
    assert.deepEqual(selectedLabels(items), ['Athens']);
  });

  it('clamps at the ends rather than wrapping', () => {
    const { list, items } = setup();
    press(list, Keys.ArrowUp);
    assert.attribute(list, 'aria-activedescendant', items[0].id, 'a listbox does not wrap');

    press(list, Keys.End);
    press(list, Keys.ArrowDown);
    assert.attribute(list, 'aria-activedescendant', items[4].id);
  });

  it('jumps with Home and End', () => {
    const { list, items } = setup();
    press(list, Keys.End);
    assert.attribute(list, 'aria-activedescendant', items[4].id);
    press(list, Keys.Home);
    assert.attribute(list, 'aria-activedescendant', items[0].id);
  });

  it('navigates by type-ahead', () => {
    const { list, items } = setup();
    press(list, 'c');
    assert.attribute(list, 'aria-activedescendant', items[4].id, 'Copenhagen');
  });

  it('always consumes Space, so the page cannot scroll under the list', () => {
    const { list } = setup();
    const { defaultPrevented } = press(list, Keys.Space);
    assert.ok(defaultPrevented);
  });

  it('replaces the selection rather than adding to it', () => {
    const { list, items } = setup();
    press(list, Keys.ArrowDown);
    press(list, Keys.ArrowDown);
    assert.deepEqual(selectedLabels(items), ['Berlin']);
  });
});

describe('Listbox — multi select', () => {
  it('moves the highlight without changing the selection', () => {
    const { list, items } = setup({ multiple: true });
    press(list, Keys.ArrowDown);
    assert.attribute(list, 'aria-activedescendant', items[1].id);
    assert.deepEqual(selectedLabels(items), [], 'focus and selection are independent here');
  });

  it('toggles with Space', () => {
    const { list, items } = setup({ multiple: true });
    press(list, Keys.ArrowDown);
    press(list, Keys.Space);
    assert.deepEqual(selectedLabels(items), ['Athens']);

    press(list, Keys.Space);
    assert.deepEqual(selectedLabels(items), []);
  });

  it('extends a range with Shift+Arrow', () => {
    const { list, items } = setup({ multiple: true });
    press(list, Keys.Space);
    press(list, Keys.ArrowDown, { shiftKey: true });
    press(list, Keys.ArrowDown, { shiftKey: true });
    assert.deepEqual(selectedLabels(items), ['Amsterdam', 'Athens', 'Berlin']);
  });

  it('selects all with Ctrl+A, and clears with a second press', () => {
    const { list, items } = setup({ multiple: true });
    press(list, 'a', { ctrlKey: true });
    assert.equal(selectedLabels(items).length, 5);

    press(list, 'a', { ctrlKey: true });
    assert.equal(selectedLabels(items).length, 0, 'a select-all with no way back is a trap');
  });

  it('adds to the selection on modifier-click and ranges on shift-click', () => {
    const { items } = setup({ multiple: true });
    click(items[0]);
    click(items[2], { metaKey: true });
    assert.deepEqual(selectedLabels(items), ['Amsterdam', 'Berlin']);

    click(items[4], { shiftKey: true });
    assert.deepEqual(selectedLabels(items), ['Berlin', 'Boston', 'Copenhagen']);
  });

  it('leaves focus on the list after a click, not on the option', () => {
    const { list, items } = setup({ multiple: true });
    click(items[2]);
    assert.focused(list, 'aria-activedescendant is only meaningful while the list has focus');
  });
});
