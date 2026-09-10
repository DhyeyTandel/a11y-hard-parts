import { describe, it, assert, mount, press, focus, wait, until } from '../harness.js';
import { Tooltip } from '../../src/components/tooltip/tooltip.js';
import { Keys } from '../../src/utils/keys.js';

/**
 * Hide behaviour is timer-driven, and a backgrounded tab clamps timers to
 * roughly one per second. Scale the delay past the clamp when hidden, so
 * "still visible after the hide timer would have fired" actually proves
 * something instead of passing because nothing has had time to happen.
 */
const HIDDEN = document.visibilityState === 'hidden';
const HIDE_DELAY = HIDDEN ? 1200 : 40;
const SETTLE = HIDE_DELAY * 3;

const MARKUP = `
  <span class="a11y-tooltip" data-a11y-tooltip>
    <button data-a11y-tooltip-trigger>Save</button>
    <span class="a11y-tooltip__content" data-a11y-tooltip-content>Saves to your drafts</span>
  </span>
`;

function setup(options = {}) {
  const fixture = mount(MARKUP);
  // The tooltip's own root, not the fixture wrapper: pointerenter and
  // pointerleave do not bubble, so dispatching them on an ancestor reaches
  // none of the component's listeners.
  const root = fixture.querySelector('[data-a11y-tooltip]');
  const tooltip = new Tooltip(root, { showDelay: 0, hideDelay: HIDE_DELAY, ...options });
  return {
    root,
    tooltip,
    trigger: root.querySelector('[data-a11y-tooltip-trigger]'),
    content: root.querySelector('[data-a11y-tooltip-content]'),
  };
}

const enter = (el) => el.dispatchEvent(new PointerEvent('pointerenter'));
const leave = (el) => el.dispatchEvent(new PointerEvent('pointerleave'));

describe('Tooltip — ARIA', () => {
  it('describes the trigger rather than renaming it', () => {
    const { tooltip, trigger, content } = setup();
    assert.attribute(trigger, 'aria-describedby', content.id);
    assert.attribute(content, 'role', 'tooltip');
    assert.equal(trigger.textContent, 'Save', 'the trigger keeps its own name');
    tooltip.destroy();
  });

  it('can label an icon-only control instead, when it has no other name', () => {
    const { tooltip, trigger, content } = setup({ relationship: 'labels' });
    assert.attribute(trigger, 'aria-labelledby', content.id);
    assert.noAttribute(trigger, 'aria-describedby', 'two competing names is worse than one');
    tooltip.destroy();
  });

  it('removes a title attribute that would produce a second native tooltip', () => {
    const root = mount(`
      <span data-a11y-tooltip>
        <button data-a11y-tooltip-trigger title="Saves to your drafts">Save</button>
        <span data-a11y-tooltip-content>Saves to your drafts</span>
      </span>
    `);
    const tooltip = new Tooltip(root.querySelector('[data-a11y-tooltip]'));
    assert.noAttribute(root.querySelector('[data-a11y-tooltip-trigger]'), 'title');
    tooltip.destroy();
  });

  it('starts hidden with the hidden attribute, not with opacity', () => {
    const { tooltip, content } = setup();
    assert.ok(content.hidden, 'a visually-transparent tooltip is still in the a11y tree');
    tooltip.destroy();
  });
});

describe('Tooltip — showing', () => {
  it('shows on focus, immediately', () => {
    const { tooltip, trigger, content } = setup({ showDelay: 5000 });
    focus(trigger);
    assert.notOk(content.hidden, 'a keyboard user has already committed; do not make them wait');
    tooltip.destroy();
  });

  it('shows on hover', async () => {
    const { tooltip, trigger, content } = setup();
    enter(trigger);
    await until(() => !content.hidden, 'hovering the trigger should show the tooltip');
    tooltip.destroy();
  });

  it('hides on blur', () => {
    const { tooltip, trigger, content } = setup();
    focus(trigger);
    trigger.blur();
    trigger.dispatchEvent(new FocusEvent('blur'));
    assert.ok(content.hidden);
    tooltip.destroy();
  });
});

describe('Tooltip — WCAG 1.4.13', () => {
  it('is dismissible with Escape, without moving pointer or focus', () => {
    const { tooltip, trigger, content } = setup();
    focus(trigger);
    assert.notOk(content.hidden);

    press(document, Keys.Escape);
    assert.ok(content.hidden, 'Escape must dismiss it');
    assert.focused(trigger, 'and must not move focus to do so');
    tooltip.destroy();
  });

  it('stays dismissed until hover and focus have both left', async () => {
    const { tooltip, trigger, content } = setup();
    enter(trigger);
    await until(() => !content.hidden);
    press(document, Keys.Escape);
    assert.ok(content.hidden);

    enter(trigger);
    await wait(SETTLE);
    assert.ok(content.hidden, 're-showing immediately would defeat the dismissal');
    tooltip.destroy();
  });

  it('can be shown again once the pointer has left the widget', async () => {
    const { tooltip, root, trigger, content } = setup();
    enter(trigger);
    await until(() => !content.hidden);
    press(document, Keys.Escape);

    leave(root);
    enter(trigger);
    await until(() => !content.hidden, 'a dismissal applies to one appearance, not forever');
    tooltip.destroy();
  });

  it('is hoverable: the pointer can travel onto the tooltip and it stays', async () => {
    const { tooltip, trigger, content } = setup();
    enter(trigger);
    await until(() => !content.hidden);

    leave(trigger);   // the pointer crosses the gap
    enter(content);   // and lands on the tooltip
    await wait(SETTLE);

    assert.notOk(content.hidden, 'a magnifier user cannot read a tooltip that flees the pointer');
    tooltip.destroy();
  });

  it('hides once the pointer leaves the tooltip too', async () => {
    const { tooltip, trigger, content } = setup();
    enter(trigger);
    await until(() => !content.hidden);

    leave(trigger);
    enter(content);
    leave(content);
    await until(() => content.hidden, 'it should hide after the grace period');
    tooltip.destroy();
  });

  it('is persistent: no auto-hide timer', async () => {
    const { tooltip, trigger, content } = setup();
    focus(trigger);
    await wait(SETTLE);
    assert.notOk(content.hidden, 'it stays until dismissed or until hover and focus are gone');
    tooltip.destroy();
  });
});
