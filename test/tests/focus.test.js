import { describe, it, assert, mount, press, focus, frames } from '../harness.js';
import { getTabbables, isTabbable } from '../../src/utils/focusable.js';
import { FocusTrap } from '../../src/utils/focus-trap.js';
import { inertBackground } from '../../src/utils/inert.js';
import { Keys } from '../../src/utils/keys.js';

describe('getTabbables', () => {
  it('finds buttons, links with href, and inputs in document order', () => {
    const root = mount(`
      <button id="b1">one</button>
      <a id="a1" href="#x">link</a>
      <a id="a2">no href</a>
      <input id="i1">
    `);
    const ids = getTabbables(root).map((el) => el.id);
    assert.deepEqual(ids, ['b1', 'a1', 'i1']);
  });

  it('excludes disabled controls', () => {
    const root = mount('<button id="b1">a</button><button id="b2" disabled>b</button>');
    assert.deepEqual(getTabbables(root).map((el) => el.id), ['b1']);
  });

  it('excludes descendants of a disabled fieldset, except its first legend', () => {
    const root = mount(`
      <fieldset disabled>
        <legend><button id="legend-btn">in legend</button></legend>
        <button id="body-btn">in body</button>
      </fieldset>
    `);
    assert.deepEqual(getTabbables(root).map((el) => el.id), ['legend-btn']);
  });

  it('excludes elements hidden by display:none, the hidden attribute, and visibility', () => {
    const root = mount(`
      <button id="b1">visible</button>
      <button id="b2" style="display:none">display</button>
      <button id="b3" hidden>attribute</button>
      <button id="b4" style="visibility:hidden">visibility</button>
    `);
    assert.deepEqual(getTabbables(root).map((el) => el.id), ['b1']);
  });

  it('keeps visually-hidden (clipped) elements tabbable, so skip links still work', () => {
    const root = mount(`
      <a id="skip" href="#main" class="a11y-visually-hidden">Skip to content</a>
      <button id="b1">x</button>
    `);
    assert.deepEqual(getTabbables(root).map((el) => el.id), ['skip', 'b1']);
  });

  it('excludes negative tabindex', () => {
    const root = mount('<button id="b1">a</button><div id="d1" tabindex="-1">b</div>');
    assert.deepEqual(getTabbables(root).map((el) => el.id), ['b1']);
  });

  it('excludes everything inside an inert subtree', () => {
    const root = mount('<div inert><button id="b1">a</button></div><button id="b2">b</button>');
    assert.deepEqual(getTabbables(root).map((el) => el.id), ['b2']);
  });

  it('counts a radio group as one tab stop, on the checked radio', () => {
    const root = mount(`
      <input type="radio" name="g" id="r1">
      <input type="radio" name="g" id="r2" checked>
      <input type="radio" name="g" id="r3">
    `);
    assert.deepEqual(getTabbables(root).map((el) => el.id), ['r2']);
  });

  it('falls back to the first radio when none is checked', () => {
    const root = mount(`
      <input type="radio" name="g" id="r1">
      <input type="radio" name="g" id="r2">
    `);
    assert.deepEqual(getTabbables(root).map((el) => el.id), ['r1']);
  });

  it('orders positive tabindex before tabindex=0, matching the browser', () => {
    const root = mount(`
      <button id="zero">0</button>
      <button id="two" tabindex="2">2</button>
      <button id="one" tabindex="1">1</button>
    `);
    assert.deepEqual(getTabbables(root).map((el) => el.id), ['one', 'two', 'zero']);
  });

  it('treats a <details> with a <summary> as not itself tabbable', () => {
    const root = mount('<details id="d"><summary id="s">More</summary><p>body</p></details>');
    assert.equal(isTabbable(root.querySelector('#s')), true);
    assert.equal(isTabbable(root.querySelector('#d')), false);
  });
});

describe('inertBackground', () => {
  it('inerts siblings up the ancestor chain and restores them exactly', () => {
    const root = mount(`
      <div id="page">
        <header id="header"><button id="hb">nav</button></header>
        <main id="main">
          <div id="modal"><button id="mb">ok</button></div>
        </main>
      </div>
    `);
    const modal = root.querySelector('#modal');
    const restore = inertBackground(modal, root);

    assert.attribute(root.querySelector('#header'), 'inert', '');
    assert.noAttribute(modal, 'inert');
    assert.deepEqual(getTabbables(root).map((el) => el.id), ['mb']);

    restore();
    assert.noAttribute(root.querySelector('#header'), 'inert');
    assert.deepEqual(getTabbables(root).map((el) => el.id), ['hb', 'mb']);
  });
});

describe('FocusTrap', () => {
  it('moves focus to the first tabbable element on activate', () => {
    const root = mount(`
      <button id="outside">outside</button>
      <div id="trap"><button id="first">first</button><button id="last">last</button></div>
    `);
    const trap = new FocusTrap(root.querySelector('#trap')).activate();
    assert.focused(root.querySelector('#first'));
    trap.deactivate();
  });

  it('honours [autofocus] over document order', () => {
    const root = mount(`
      <div id="trap"><button id="first">first</button><button id="auto" autofocus>auto</button></div>
    `);
    const trap = new FocusTrap(root.querySelector('#trap')).activate();
    assert.focused(root.querySelector('#auto'));
    trap.deactivate();
  });

  it('wraps Tab from the last element back to the first', () => {
    const root = mount('<div id="trap"><button id="first">a</button><button id="last">b</button></div>');
    const trap = new FocusTrap(root.querySelector('#trap')).activate();
    const last = root.querySelector('#last');
    last.focus();

    const { defaultPrevented } = press(last, Keys.Tab);
    assert.ok(defaultPrevented, 'Tab at the last element should be prevented so it can wrap');
    assert.focused(root.querySelector('#first'));
    trap.deactivate();
  });

  it('wraps Shift+Tab from the first element to the last', () => {
    const root = mount('<div id="trap"><button id="first">a</button><button id="last">b</button></div>');
    const trap = new FocusTrap(root.querySelector('#trap')).activate();
    const first = root.querySelector('#first');
    first.focus();

    press(first, Keys.Tab, { shiftKey: true });
    assert.focused(root.querySelector('#last'));
    trap.deactivate();
  });

  it('does not intercept Tab in the middle of the cycle', () => {
    const root = mount(`
      <div id="trap">
        <button id="first">a</button><button id="mid">b</button><button id="last">c</button>
      </div>
    `);
    const trap = new FocusTrap(root.querySelector('#trap')).activate();
    const mid = root.querySelector('#mid');
    mid.focus();

    const { defaultPrevented } = press(mid, Keys.Tab);
    assert.notOk(defaultPrevented, 'Tab mid-cycle must fall through to the browser');
    trap.deactivate();
  });

  it('pulls focus back when something outside steals it without Tab', () => {
    const root = mount(`
      <button id="outside">outside</button>
      <div id="trap"><button id="inside">inside</button></div>
    `);
    const trap = new FocusTrap(root.querySelector('#trap')).activate();

    focus(root.querySelector('#outside'));
    assert.focused(root.querySelector('#inside'), 'programmatic focus outside the trap must be reverted');
    trap.deactivate();
  });

  it('restores focus to the element that had it before activation', () => {
    const root = mount(`
      <button id="trigger">open</button>
      <div id="trap"><button id="inside">inside</button></div>
    `);
    const trigger = root.querySelector('#trigger');
    trigger.focus();

    const trap = new FocusTrap(root.querySelector('#trap')).activate();
    assert.focused(root.querySelector('#inside'));

    trap.deactivate();
    assert.focused(trigger);
  });

  it('falls back safely when the return target was removed while trapped', () => {
    const root = mount(`
      <button id="trigger">open</button>
      <div id="trap"><button id="inside">inside</button></div>
    `);
    const trigger = root.querySelector('#trigger');
    trigger.focus();
    const trap = new FocusTrap(root.querySelector('#trap')).activate();

    trigger.remove();
    trap.deactivate();

    assert.notOk(
      document.activeElement === trigger,
      'focus must not be left on a detached node',
    );
    assert.ok(document.activeElement, 'something must hold focus');
  });

  it('pins focus to the container when it holds nothing tabbable', () => {
    const root = mount('<div id="trap" tabindex="-1"><p>Nothing focusable here.</p></div>');
    const container = root.querySelector('#trap');
    const trap = new FocusTrap(container).activate();
    assert.focused(container);

    const { defaultPrevented } = press(container, Keys.Tab);
    assert.ok(defaultPrevented, 'Tab must not escape an empty trap');
    trap.deactivate();
  });

  it('only lets the topmost of nested traps handle keys', () => {
    const root = mount(`
      <div id="outer"><button id="o1">o1</button><button id="o2">o2</button>
        <div id="inner"><button id="i1">i1</button><button id="i2">i2</button></div>
      </div>
    `);
    const outerTrap = new FocusTrap(root.querySelector('#outer')).activate();
    const innerTrap = new FocusTrap(root.querySelector('#inner')).activate();

    const i2 = root.querySelector('#i2');
    i2.focus();
    press(i2, Keys.Tab);
    assert.focused(root.querySelector('#i1'), 'the inner trap owns the cycle');

    innerTrap.deactivate();
    outerTrap.deactivate();
  });
});
