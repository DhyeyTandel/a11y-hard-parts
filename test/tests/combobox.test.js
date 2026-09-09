import { describe, it, assert, mount, press, click, type, frames } from '../harness.js';
import { Combobox } from '../../src/components/combobox/combobox.js';
import { Keys } from '../../src/utils/keys.js';

const FRUIT = ['Apple', 'Apricot', 'Banana', 'Blackberry', 'Cherry'];

const MARKUP = `
  <div class="a11y-combobox" data-a11y-combobox>
    <label for="fruit">Fruit</label>
    <div class="a11y-combobox__field">
      <input id="fruit" type="text">
      <button type="button" data-a11y-combobox-toggle>▾</button>
    </div>
    <ul data-a11y-combobox-listbox></ul>
  </div>
`;

function setup(options = {}) {
  const root = mount(MARKUP);
  const combobox = new Combobox(root.querySelector('[data-a11y-combobox]'), {
    source: FRUIT,
    ...options,
  });
  return { root, combobox, input: root.querySelector('#fruit'), listbox: root.querySelector('[data-a11y-combobox-listbox]') };
}

const options = (listbox) => Array.from(listbox.querySelectorAll('[role="option"]'));

describe('Combobox — ARIA 1.2 structure', () => {
  it('puts role="combobox" on the input itself, not on a wrapper', () => {
    const { root, input } = setup();
    assert.attribute(input, 'role', 'combobox');
    assert.equal(
      root.querySelector('[data-a11y-combobox]').getAttribute('role'),
      null,
      'the ARIA 1.1 wrapper-as-combobox pattern is obsolete',
    );
  });

  it('wires aria-controls, aria-autocomplete, aria-haspopup and collapsed state', () => {
    const { input, listbox } = setup();
    assert.attribute(input, 'aria-expanded', 'false');
    assert.attribute(input, 'aria-controls', listbox.id);
    assert.attribute(input, 'aria-autocomplete', 'list');
    assert.attribute(input, 'aria-haspopup', 'listbox');
    assert.attribute(listbox, 'role', 'listbox');
  });

  it('gives the listbox its own accessible name', () => {
    const { listbox } = setup();
    assert.attribute(listbox, 'aria-label', 'Fruit');
  });

  it('disables browser autofill so it cannot cover the listbox', () => {
    const { input } = setup();
    assert.attribute(input, 'autocomplete', 'off');
  });

  it('keeps the toggle button out of the tab order', () => {
    const { root } = setup();
    assert.attribute(root.querySelector('[data-a11y-combobox-toggle]'), 'tabindex', '-1');
  });
});

describe('Combobox — keyboard', () => {
  it('opens on ArrowDown with the first option active', async () => {
    const { input, listbox } = setup();
    input.focus();
    press(input, Keys.ArrowDown);
    await frames(3);

    assert.attribute(input, 'aria-expanded', 'true');
    assert.notOk(listbox.hidden);
    assert.attribute(input, 'aria-activedescendant', options(listbox)[0].id);
  });

  it('keeps DOM focus on the input while the list is navigated', async () => {
    const { input, listbox } = setup();
    input.focus();
    press(input, Keys.ArrowDown);
    await frames(3);
    press(input, Keys.ArrowDown);

    assert.focused(input, 'focus must never move into the listbox');
    assert.attribute(input, 'aria-activedescendant', options(listbox)[1].id);
  });

  it('marks exactly one option aria-selected', async () => {
    const { input, listbox } = setup();
    input.focus();
    press(input, Keys.ArrowDown);
    await frames(3);
    press(input, Keys.ArrowDown);

    const selected = options(listbox).filter((o) => o.getAttribute('aria-selected') === 'true');
    assert.equal(selected.length, 1);
    assert.equal(selected[0].textContent, 'Apricot');
  });

  it('wraps from the last option to the first', async () => {
    const { input, listbox } = setup();
    input.focus();
    press(input, Keys.ArrowUp);
    await frames(4);
    assert.attribute(input, 'aria-activedescendant', options(listbox)[FRUIT.length - 1].id);

    press(input, Keys.ArrowDown);
    assert.attribute(input, 'aria-activedescendant', options(listbox)[0].id);
  });

  it('opens without moving the highlight on Alt+ArrowDown', async () => {
    const { input } = setup();
    input.focus();
    press(input, Keys.ArrowDown, { altKey: true });
    await frames(3);

    assert.attribute(input, 'aria-expanded', 'true');
    assert.noAttribute(input, 'aria-activedescendant');
  });

  it('closes on Alt+ArrowUp and keeps the typed value', async () => {
    const { input } = setup();
    input.focus();
    press(input, Keys.ArrowDown);
    await frames(3);
    type(input, 'Ap');
    await frames(3);

    press(input, Keys.ArrowUp, { altKey: true });
    assert.attribute(input, 'aria-expanded', 'false');
    assert.equal(input.value, 'Ap');
  });

  it('commits the active option on Enter and collapses', async () => {
    const { input } = setup();
    input.focus();
    press(input, Keys.ArrowDown);
    await frames(3);

    const { defaultPrevented } = press(input, Keys.Enter);
    assert.ok(defaultPrevented, 'Enter is consumed only when it selects something');
    assert.equal(input.value, 'Apple');
    assert.attribute(input, 'aria-expanded', 'false');
    assert.noAttribute(input, 'aria-activedescendant');
  });

  it('lets Enter through to the form when nothing is highlighted', async () => {
    const { input } = setup();
    input.focus();
    press(input, Keys.ArrowDown, { altKey: true });
    await frames(3);

    const { defaultPrevented } = press(input, Keys.Enter);
    assert.notOk(defaultPrevented, 'a combobox must not swallow form submission');
  });

  it('closes on the first Escape and clears the value on the second', async () => {
    const { input } = setup();
    input.focus();
    type(input, 'Ap');
    await frames(3);
    assert.attribute(input, 'aria-expanded', 'true');

    press(input, Keys.Escape);
    assert.attribute(input, 'aria-expanded', 'false');
    assert.equal(input.value, 'Ap', 'the first Escape only closes the popup');

    press(input, Keys.Escape);
    assert.equal(input.value, '', 'the second Escape clears the field');
  });

  it('drops the highlight on Home/End so Enter cannot commit a stale option', async () => {
    const { input } = setup();
    input.focus();
    press(input, Keys.ArrowDown);
    await frames(3);
    press(input, Keys.Home);

    assert.noAttribute(input, 'aria-activedescendant');
  });

  it('commits the highlighted option when Tab leaves the field', async () => {
    const { input } = setup();
    input.focus();
    press(input, Keys.ArrowDown);
    await frames(3);
    press(input, Keys.Tab);

    assert.equal(input.value, 'Apple');
    assert.attribute(input, 'aria-expanded', 'false');
  });
});

describe('Combobox — filtering and announcements', () => {
  it('filters as the user types', async () => {
    const { input, listbox } = setup();
    input.focus();
    type(input, 'ap');
    await frames(3);

    assert.deepEqual(options(listbox).map((o) => o.textContent), ['Apple', 'Apricot']);
  });

  it('never auto-highlights while typing', async () => {
    const { input } = setup();
    input.focus();
    type(input, 'ap');
    await frames(3);

    assert.noAttribute(
      input,
      'aria-activedescendant',
      'auto-highlighting means Enter commits something the user never chose',
    );
  });

  it('stays collapsed when the query has no matches', async () => {
    const { input, listbox } = setup();
    input.focus();
    type(input, 'zzz');
    await frames(3);

    assert.attribute(input, 'aria-expanded', 'false');
    assert.ok(listbox.hidden, 'aria-expanded="true" over an empty popup is a lie');
  });

  it('announces the result count in a polite live region', async () => {
    const { root, input, combobox } = setup({ announceCountDelay: 0 });
    const region = root.querySelector('[aria-live]');
    assert.ok(region, 'the live region must exist before the first announcement');
    assert.attribute(region, 'aria-live', 'polite');

    input.focus();
    type(input, 'ap');
    await frames(6);

    assert.ok(
      region.textContent.startsWith('2 results available'),
      `expected a result count, got "${region.textContent}"`,
    );
    combobox.destroy();
  });

  it('announces zero results too', async () => {
    const { root, input, combobox } = setup({ announceCountDelay: 0 });
    const region = root.querySelector('[aria-live]');
    input.focus();
    type(input, 'zzz');
    await frames(6);

    assert.equal(region.textContent, 'No results available.');
    combobox.destroy();
  });
});

describe('Combobox — pointer', () => {
  it('selects an option on click and returns the value to the input', async () => {
    const { input, listbox } = setup();
    input.focus();
    press(input, Keys.ArrowDown);
    await frames(3);

    click(options(listbox)[2]);
    assert.equal(input.value, 'Banana');
    assert.attribute(input, 'aria-expanded', 'false');
  });

  it('skips disabled options when arrowing', async () => {
    const { input, listbox } = setup({
      source: [{ value: 'One' }, { value: 'Two', disabled: true }, { value: 'Three' }],
    });
    input.focus();
    press(input, Keys.ArrowDown);
    await frames(3);
    press(input, Keys.ArrowDown);

    assert.attribute(input, 'aria-activedescendant', options(listbox)[2].id);
  });
});
