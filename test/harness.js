/**
 * A tiny test runner that runs in a real browser.
 *
 * Deliberately not jsdom. Half of what this library does is focus management,
 * and jsdom does not implement sequential focus navigation, `inert`,
 * `:focus-visible`, layout (so `getClientRects` is always empty, so every
 * element looks hidden), or the accessibility tree. A focus trap that passes in
 * jsdom tells you nothing about whether Tab escapes it in Safari.
 *
 * Caveat that applies to every DOM test of keyboard behaviour: a synthetic
 * KeyboardEvent does not trigger the browser's default action. Dispatching
 * Tab does not move focus. That is fine for testing *our* handlers, which
 * call `preventDefault()` and `focus()` explicitly, but it means a passing
 * suite does not prove native focus order. That part is covered by the manual
 * checklist in the README.
 */

const suites = [];
let currentSuite = null;

export function describe(name, fn) {
  currentSuite = { name, tests: [], beforeEach: null, afterEach: null };
  suites.push(currentSuite);
  fn();
  currentSuite = null;
}

export function it(name, fn) {
  currentSuite.tests.push({ name, fn });
}

export function beforeEach(fn) { currentSuite.beforeEach = fn; }
export function afterEach(fn) { currentSuite.afterEach = fn; }

class AssertionError extends Error {}

export const assert = {
  ok(value, message = 'Expected value to be truthy') {
    if (!value) throw new AssertionError(message);
  },
  notOk(value, message = 'Expected value to be falsy') {
    if (value) throw new AssertionError(message);
  },
  equal(actual, expected, message) {
    if (actual !== expected) {
      throw new AssertionError(message ?? `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
  },
  deepEqual(actual, expected, message) {
    const a = JSON.stringify(actual);
    const b = JSON.stringify(expected);
    if (a !== b) throw new AssertionError(message ?? `Expected ${b}, got ${a}`);
  },
  /** Focus assertions name the element, because "expected true, got false" is useless here. */
  focused(element, message) {
    if (document.activeElement !== element) {
      throw new AssertionError(
        message ??
          `Expected focus on ${describeElement(element)}, but focus is on ${describeElement(document.activeElement)}`,
      );
    }
  },
  notFocused(element, message) {
    if (document.activeElement === element) {
      throw new AssertionError(message ?? `Expected focus NOT on ${describeElement(element)}`);
    }
  },
  attribute(element, name, expected, message) {
    const actual = element.getAttribute(name);
    if (actual !== expected) {
      throw new AssertionError(
        message ?? `Expected ${describeElement(element)} to have ${name}="${expected}", got ${actual === null ? '(absent)' : `"${actual}"`}`,
      );
    }
  },
  noAttribute(element, name, message) {
    if (element.hasAttribute(name)) {
      throw new AssertionError(
        message ?? `Expected ${describeElement(element)} not to have ${name}, got "${element.getAttribute(name)}"`,
      );
    }
  },
  throws(fn, message = 'Expected function to throw') {
    try {
      fn();
    } catch {
      return;
    }
    throw new AssertionError(message);
  },
};

export function describeElement(element) {
  if (!element) return '(null)';
  if (element === document.body) return '<body>';
  const tag = element.tagName?.toLowerCase() ?? String(element);
  const id = element.id ? `#${element.id}` : '';
  const role = element.getAttribute?.('role') ? `[role=${element.getAttribute('role')}]` : '';
  const text = element.textContent?.trim().slice(0, 24);
  return `<${tag}${id}${role}>${text ? ` "${text}"` : ''}`;
}

// ---- DOM helpers --------------------------------------------------------

let fixtureRoot = null;

export function mount(html) {
  fixtureRoot?.remove();
  fixtureRoot = document.createElement('div');
  fixtureRoot.id = 'fixture';
  fixtureRoot.innerHTML = html;
  document.body.appendChild(fixtureRoot);
  return fixtureRoot;
}

export function unmount() {
  fixtureRoot?.remove();
  fixtureRoot = null;
}

/** Dispatch a keydown. Returns false if a handler called preventDefault(). */
export function press(target, key, options = {}) {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ...options,
  });
  const notPrevented = target.dispatchEvent(event);
  return { defaultPrevented: !notPrevented, event };
}

export function click(target, options = {}) {
  target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, ...options }));
  target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, ...options }));
  target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...options }));
}

/**
 * Focus an element and make sure the focus events actually fire.
 *
 * When the document does not have system focus — a background tab, an
 * unfocused browser pane, a headless run — browsers still update
 * `document.activeElement` but dispatch **no** focus, focusin or focusout
 * events at all. Any handler that reacts to focus movement (the focus trap's
 * backstop, a toast pausing its timer) would look broken purely because of
 * where the test is running.
 *
 * In a focused window the guard is false and this is a plain `.focus()`.
 */
export function focus(element) {
  const previous = document.activeElement;
  element.focus();
  if (document.hasFocus() || previous === element) return;

  if (previous && previous !== element) {
    previous.dispatchEvent(new FocusEvent('blur', { relatedTarget: element }));
    previous.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: element }));
  }
  element.dispatchEvent(new FocusEvent('focus', { relatedTarget: previous }));
  element.dispatchEvent(new FocusEvent('focusin', { bubbles: true, relatedTarget: previous }));
}

/** True when the browser will deliver real focus events. */
export const nativeFocusEvents = () => document.hasFocus();

export function type(input, value) {
  input.value = value;
  input.dispatchEvent(new InputEvent('input', { bubbles: true }));
}

/**
 * Mirrors the library's afterPaint(). rAF never fires in a backgrounded tab,
 * and setTimeout there is clamped to ~1s, so a suite run in a hidden pane
 * would either hang or take minutes. MessageChannel is neither.
 */
export const nextFrame = () =>
  new Promise((resolve) => {
    if (document.visibilityState !== 'hidden') {
      requestAnimationFrame(() => resolve());
      return;
    }
    const channel = new MessageChannel();
    channel.port1.onmessage = () => { channel.port1.close(); resolve(); };
    channel.port2.postMessage(undefined);
  });
export const frames = async (count = 3) => { for (let i = 0; i < count; i += 1) await nextFrame(); };
export const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---- runner -------------------------------------------------------------

export async function run() {
  const results = { passed: 0, failed: 0, suites: [] };

  for (const suite of suites) {
    const suiteResult = { name: suite.name, tests: [] };
    results.suites.push(suiteResult);

    for (const test of suite.tests) {
      // Published so a hung run can be diagnosed from the console: a test that
      // never resolves would otherwise leave no trace of where it stopped.
      globalThis.__A11Y_CURRENT_TEST__ = `${suite.name} > ${test.name}`;
      try {
        await suite.beforeEach?.();
        await test.fn();
        suiteResult.tests.push({ name: test.name, ok: true });
        results.passed += 1;
      } catch (error) {
        suiteResult.tests.push({ name: test.name, ok: false, error: error.message, stack: error.stack });
        results.failed += 1;
      } finally {
        try { await suite.afterEach?.(); } catch { /* keep going */ }
        unmount();
      }
    }
  }

  return results;
}

export function render(results, target) {
  const summary = document.createElement('p');
  summary.className = results.failed ? 'summary is-fail' : 'summary is-pass';
  summary.textContent = `${results.passed} passed, ${results.failed} failed`;
  target.appendChild(summary);

  for (const suite of results.suites) {
    const section = document.createElement('section');
    const heading = document.createElement('h2');
    heading.textContent = suite.name;
    section.appendChild(heading);

    const list = document.createElement('ul');
    for (const test of suite.tests) {
      const item = document.createElement('li');
      item.className = test.ok ? 'is-pass' : 'is-fail';
      item.textContent = `${test.ok ? '✓' : '✗'} ${test.name}`;
      if (!test.ok) {
        const detail = document.createElement('pre');
        detail.textContent = test.error;
        item.appendChild(detail);
      }
      list.appendChild(item);
    }
    section.appendChild(list);
    target.appendChild(section);
  }
}
