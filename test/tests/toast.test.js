import { describe, it, assert, mount, click, focus, frames, wait } from '../harness.js';
import { ToastRegion } from '../../src/components/toast/toast.js';

/**
 * Auto-dismiss is driven by real setTimeout, and a backgrounded tab clamps
 * timers to roughly one per second — so 40ms and 120ms would both fire at
 * ~1000ms and the ordering these tests depend on would collapse. Scale the
 * durations past the clamp when the page is hidden.
 */
const HIDDEN = document.visibilityState === 'hidden';
const SHORT = HIDDEN ? 1200 : 40;
const LONG = HIDDEN ? 3000 : 120;

function setup(options = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const region = new ToastRegion({ container, duration: 0, ...options });
  return { region, container };
}

describe('Toast — live region setup', () => {
  it('creates both live regions empty, before any message exists', () => {
    const { region } = setup();
    assert.equal(region.politeRegion.textContent, '');
    assert.equal(region.assertiveRegion.textContent, '');
    assert.ok(
      region.politeRegion.isConnected,
      'a region created at announce time is usually never announced at all',
    );
    region.destroy();
  });

  it('uses aria-atomic on single-message regions so the whole message is read', () => {
    const { region } = setup();
    assert.attribute(region.politeRegion, 'aria-live', 'polite');
    assert.attribute(region.politeRegion, 'aria-atomic', 'true');
    assert.attribute(region.politeRegion, 'role', 'status');
    assert.attribute(region.assertiveRegion, 'aria-live', 'assertive');
    assert.attribute(region.assertiveRegion, 'role', 'alert');
    region.destroy();
  });

  it('keeps the visible stack out of the live regions', () => {
    const { region, container } = setup();
    assert.attribute(container, 'role', 'region');
    assert.noAttribute(
      container,
      'aria-live',
      'a live region that also holds the animating toasts re-announces on every mutation',
    );
    assert.attribute(container, 'aria-label', 'Notifications');
    region.destroy();
  });
});

describe('Toast — politeness', () => {
  it('announces ordinary messages politely', async () => {
    const { region } = setup();
    region.success('Changes saved');
    await frames(4);

    assert.equal(region.politeRegion.textContent, 'Changes saved');
    assert.equal(region.assertiveRegion.textContent, '');
    region.destroy();
  });

  it('escalates errors to assertive', async () => {
    const { region } = setup();
    region.error('Upload failed');
    await frames(4);

    assert.equal(region.assertiveRegion.textContent, 'Upload failed');
    assert.equal(region.politeRegion.textContent, '');
    region.destroy();
  });

  it('re-announces an identical repeated message', async () => {
    const { region } = setup();
    region.info('Copied');
    await frames(4);
    assert.equal(region.politeRegion.textContent, 'Copied');

    region.info('Copied');
    // Mid-flight the region is empty — that emptying is what makes the second
    // identical message a mutation the screen reader will notice.
    assert.equal(region.politeRegion.textContent, '');
    await frames(4);
    assert.equal(region.politeRegion.textContent, 'Copied');
    region.destroy();
  });
});

describe('Toast — dismissal and timing', () => {
  it('gives each dismiss button a distinguishable accessible name', () => {
    const { region } = setup();
    region.info('Report ready');
    const button = region.container.querySelector('.a11y-toast__dismiss');
    assert.attribute(button, 'aria-label', 'Dismiss notification: Report ready');
    region.destroy();
  });

  it('removes the toast when dismissed', () => {
    const { region, container } = setup();
    const toast = region.info('Report ready');
    click(container.querySelector('.a11y-toast__dismiss'));

    assert.notOk(toast.isConnected);
    assert.equal(container.querySelectorAll('.a11y-toast').length, 0);
    region.destroy();
  });

  it('never auto-dismisses an error', async () => {
    const { region } = setup({ duration: SHORT });
    region.error('Disk full');
    await wait(LONG);
    assert.equal(region.container.querySelectorAll('.a11y-toast').length, 1);
    region.destroy();
  });

  it('auto-dismisses non-errors after their duration', async () => {
    const { region } = setup({ duration: SHORT });
    region.success('Saved');
    assert.equal(region.container.querySelectorAll('.a11y-toast').length, 1);
    await wait(LONG);
    assert.equal(region.container.querySelectorAll('.a11y-toast').length, 0);
    region.destroy();
  });

  it('pauses the timer while the pointer is over the stack (WCAG 2.2.1)', async () => {
    const { region, container } = setup({ duration: SHORT });
    region.success('Saved');
    container.dispatchEvent(new PointerEvent('pointerenter', { bubbles: false }));

    await wait(LONG);
    assert.equal(
      container.querySelectorAll('.a11y-toast').length,
      1,
      'a message must not disappear while the user is still reading it',
    );
    region.destroy();
  });

  it('pauses the timer while focus is inside the stack', async () => {
    const { region, container } = setup({ duration: SHORT });
    region.success('Saved');
    focus(container.querySelector('.a11y-toast__dismiss'));

    await wait(LONG);
    assert.equal(container.querySelectorAll('.a11y-toast').length, 1);
    region.destroy();
  });

  it('does not resume with a fresh full duration after a pause', async () => {
    const elapsed = HIDDEN ? 2000 : 70;
    const { region, container } = setup({ duration: HIDDEN ? 2600 : 100 });
    region.success('Saved');
    await wait(elapsed);

    container.dispatchEvent(new PointerEvent('pointerenter'));
    await wait(elapsed);
    container.dispatchEvent(new PointerEvent('pointerleave'));
    await wait(elapsed);

    assert.equal(
      container.querySelectorAll('.a11y-toast').length,
      0,
      'only the remaining time should be left after a pause, not the full duration',
    );
    region.destroy();
  });

  it('moves focus off a toast before removing it', () => {
    const { region, container } = setup();
    region.info('First');
    region.info('Second');

    const buttons = container.querySelectorAll('.a11y-toast__dismiss');
    focus(buttons[1]);
    click(buttons[1]);

    assert.ok(
      container.contains(document.activeElement),
      'focus must land on the remaining toast, not fall back to <body>',
    );
    region.destroy();
  });
});
