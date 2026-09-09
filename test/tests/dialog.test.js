import { describe, it, assert, mount, press, click, frames } from '../harness.js';
import { Dialog } from '../../src/components/dialog/dialog.js';
import { Keys } from '../../src/utils/keys.js';

const MARKUP = `
  <header id="page-header"><button id="page-button">page control</button></header>
  <button id="trigger">Open dialog</button>
  <div id="dialog" data-a11y-dialog>
    <div class="a11y-dialog__backdrop" data-a11y-dialog-backdrop></div>
    <div class="a11y-dialog__panel" data-a11y-dialog-panel>
      <h2 data-a11y-dialog-title>Delete project</h2>
      <p data-a11y-dialog-description>This cannot be undone.</p>
      <button id="cancel" data-a11y-dialog-close>Cancel</button>
      <button id="confirm">Delete</button>
    </div>
  </div>
`;

function setup() {
  const root = mount(MARKUP);
  const dialog = new Dialog(root.querySelector('#dialog'));
  return { root, dialog, trigger: root.querySelector('#trigger') };
}

describe('Dialog — ARIA', () => {
  it('applies role, aria-modal and a programmatic focus target', () => {
    const { root } = setup();
    const panel = root.querySelector('[data-a11y-dialog-panel]');
    assert.attribute(panel, 'role', 'dialog');
    assert.attribute(panel, 'aria-modal', 'true');
    assert.attribute(panel, 'tabindex', '-1');
  });

  it('names the dialog from its title and describes it from its description', () => {
    const { root } = setup();
    const panel = root.querySelector('[data-a11y-dialog-panel]');
    const title = root.querySelector('[data-a11y-dialog-title]');
    const description = root.querySelector('[data-a11y-dialog-description]');
    assert.attribute(panel, 'aria-labelledby', title.id);
    assert.attribute(panel, 'aria-describedby', description.id);
  });

  it('uses role="alertdialog" when asked', () => {
    const root = mount(MARKUP);
    const dialog = new Dialog(root.querySelector('#dialog'), { alert: true });
    assert.attribute(root.querySelector('[data-a11y-dialog-panel]'), 'role', 'alertdialog');
    dialog.destroy();
  });

  it('hides the backdrop from assistive technology', () => {
    const { root } = setup();
    assert.attribute(root.querySelector('[data-a11y-dialog-backdrop]'), 'aria-hidden', 'true');
  });

  it('starts hidden', () => {
    const { root } = setup();
    assert.ok(root.querySelector('#dialog').hidden);
  });
});

describe('Dialog — focus', () => {
  it('moves focus into the dialog on open', () => {
    const { root, dialog, trigger } = setup();
    dialog.open(trigger);
    assert.focused(root.querySelector('#cancel'));
    dialog.close();
  });

  it('honours an explicit initial focus target', () => {
    const root = mount(MARKUP);
    const dialog = new Dialog(root.querySelector('#dialog'), { initialFocus: '#confirm' });
    dialog.open();
    assert.focused(root.querySelector('#confirm'));
    dialog.close();
    dialog.destroy();
  });

  it('restores focus to the trigger on close', () => {
    const { root, dialog, trigger } = setup();
    trigger.focus();
    dialog.open(trigger);
    dialog.close();
    assert.focused(trigger);
  });

  it('traps Tab inside the dialog', () => {
    const { root, dialog, trigger } = setup();
    dialog.open(trigger);

    const confirm = root.querySelector('#confirm');
    confirm.focus();
    press(confirm, Keys.Tab);
    assert.focused(root.querySelector('#cancel'), 'Tab from the last control wraps to the first');

    dialog.close();
  });

  it('does not let focus reach the page behind it', () => {
    const { root, dialog, trigger } = setup();
    dialog.open(trigger);

    root.querySelector('#page-button').focus();
    assert.ok(
      root.querySelector('[data-a11y-dialog-panel]').contains(document.activeElement),
      'focus must stay inside the open dialog',
    );

    dialog.close();
  });
});

describe('Dialog — background inertness', () => {
  it('marks the rest of the page inert while open, and restores it on close', () => {
    const { root, dialog, trigger } = setup();
    const header = root.querySelector('#page-header');

    dialog.open(trigger);
    assert.attribute(header, 'inert', '');
    assert.attribute(trigger, 'inert', '');

    dialog.close();
    assert.noAttribute(header, 'inert');
    assert.noAttribute(trigger, 'inert');
  });

  it('un-inerts before restoring focus, so the trigger is focusable again', () => {
    const { dialog, trigger } = setup();
    trigger.focus();
    dialog.open(trigger);
    dialog.close();
    assert.focused(trigger, 'a trigger still marked inert would silently refuse focus');
  });
});

describe('Dialog — dismissal', () => {
  it('closes on Escape', () => {
    const { root, dialog, trigger } = setup();
    dialog.open(trigger);
    press(root.querySelector('#cancel'), Keys.Escape);
    assert.notOk(dialog.isOpen);
    assert.focused(trigger);
  });

  it('does not close on Escape when closeOnEscape is false', () => {
    const root = mount(MARKUP);
    const dialog = new Dialog(root.querySelector('#dialog'), { closeOnEscape: false });
    dialog.open();
    press(root.querySelector('#cancel'), Keys.Escape);
    assert.ok(dialog.isOpen);
    dialog.close();
    dialog.destroy();
  });

  it('closes on a [data-a11y-dialog-close] control', () => {
    const { root, dialog, trigger } = setup();
    dialog.open(trigger);
    click(root.querySelector('#cancel'));
    assert.notOk(dialog.isOpen);
  });

  it('closes on a backdrop click', () => {
    const { root, dialog, trigger } = setup();
    dialog.open(trigger);
    click(root.querySelector('[data-a11y-dialog-backdrop]'));
    assert.notOk(dialog.isOpen);
  });

  it('does not close when a drag starts inside the panel and ends on the backdrop', () => {
    const { root, dialog, trigger } = setup();
    dialog.open(trigger);

    const panel = root.querySelector('[data-a11y-dialog-panel]');
    const backdrop = root.querySelector('[data-a11y-dialog-backdrop]');
    panel.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    backdrop.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    assert.ok(dialog.isOpen, 'text selection dragged onto the backdrop must not close the dialog');
    dialog.close();
  });
});
