# Accessible components

Eleven components built against the [ARIA Authoring Practices Guide][apg] and
WCAG 2.2, chosen because they are the ones that are genuinely hard to get right
— not buttons and cards.

Zero dependencies. No build step. Plain ES modules and CSS custom properties.

```bash
./serve.sh 8080     # ES modules need an http origin; file:// blocks them
```

Then open <http://localhost:8080/> for the demos, or
<http://localhost:8080/test/run.html> for the test suite.

---

## Contents

- [What is here, and why](#what-is-here-and-why)
- [Usage](#usage)
- [Keyboard interaction model](#keyboard-interaction-model) — the reference for each component
- [Focus management](#focus-management)
- [Live regions](#live-regions)
- [Testing](#testing)
- [VoiceOver test scripts](#voiceover-test-scripts)
- [Browser and OS behaviour](#browser-and-os-behaviour)
- [Limitations](#limitations)

---

## What is here, and why

| Component | The hard part |
|---|---|
| **Modal dialog** | A focus trap that cannot be escaped, focus restoration when the trigger is gone, a background that is inert to the virtual cursor and not just to `Tab` |
| **Combobox** | ARIA 1.2 with `aria-activedescendant`, so DOM focus never leaves the input; debounced result-count announcements; stale async responses that must not win |
| **Tabs** | Roving tabindex, so a ten-tab strip is one tab stop; panels that become focusable only when they hold nothing focusable |
| **Disclosure** | Three markup mistakes that no amount of JavaScript fixes |
| **Accordion** | Real heading structure, and `aria-disabled` rather than `disabled` for a panel that cannot be collapsed |
| **Sortable table** | `aria-sort` on exactly one header, `scope` on every header, a caption, and an announcement — because re-sorting silently rewrites everything below the reading position |
| **Toasts** | Live regions that actually announce, politeness that is not always `assertive`, timers that pause, and focus that does not vanish |
| **Menu button** | Real focus moving into the menu, type-ahead that cycles on a repeated character, `menuitemcheckbox`/`menuitemradio` state, and Escape returning focus |
| **Listbox** | Selection and focus as independent states, which is what multi-select actually needs; range extension; select-all that can be undone |
| **Slider** | `aria-valuetext` where the raw number means nothing, per-thumb names, and range bounds that move as the neighbouring thumb moves |
| **Tooltip** | WCAG 1.4.13 in full: dismissible with Escape, hoverable across the gap, and persistent with no auto-hide |

Every non-obvious decision is explained in a comment next to the code it
explains, rather than here. If you want the reasoning for a specific behaviour,
the source is the documentation.

---

## Usage

Declarative — mark up the HTML and call `init()`:

```js
import { init } from './src/index.js';
init();   // wires every [data-a11y-*] component on the page
```

Imperative, for anything that needs configuration:

```js
import { Dialog } from './src/components/dialog/dialog.js';
import { Combobox } from './src/components/combobox/combobox.js';
import { Slider } from './src/components/slider/slider.js';

const dialog = new Dialog(document.querySelector('#confirm'), {
  alert: true,
  initialFocus: '#cancel',
});
dialog.open(triggerButton);   // triggerButton gets focus back on close

new Combobox(document.querySelector('#fruit'), {
  source: async (query) => fetch(`/search?q=${query}`).then((r) => r.json()),
  minChars: 2,
  onSelect: (item) => console.log(item),
});

new Slider(document.querySelector('#speed'), {
  // Without a formatter this announces "2". With one, "Express".
  format: (value) => ['Economy', 'Standard', 'Express', 'Next day'][value],
});
```

Styling is entirely custom properties. Override `src/styles/tokens.css` to
rebrand; no component CSS needs to change.

---

## Keyboard interaction model

This is the contract. Anything not listed is deliberately left to the browser —
a widget that swallows a key it does not need breaks the user's normal
navigation.

### Modal dialog

| Key | Behaviour |
|---|---|
| <kbd>Tab</kbd> | Move to the next focusable element in the dialog. From the last, wrap to the first. |
| <kbd>Shift</kbd> + <kbd>Tab</kbd> | Move to the previous element. From the first, wrap to the last. |
| <kbd>Esc</kbd> | Close, and return focus to the element that opened the dialog. |

**On open**, focus moves to: the configured `initialFocus`, else `[autofocus]`,
else the first tabbable element, else the dialog container itself (which carries
`tabindex="-1"` so its accessible name is still announced).

**On close**, focus returns to: the configured `returnFocus`, else the trigger
passed to `open()`, else whatever had focus when the dialog opened. If that
element has been removed from the DOM while the dialog was open, the configured
`fallbackFocus` is used, and `<body>` as a last resort.

The background is made `inert`, which removes it from the tab order, from hit
testing, **and from the accessibility tree** — so a VoiceOver user cannot walk
out of the dialog with <kbd>VO</kbd> + <kbd>→</kbd> either.

### Combobox (list autocomplete, manual selection)

DOM focus stays on the text input at all times. The highlighted option is
communicated with `aria-activedescendant`.

| Key | Behaviour |
|---|---|
| <kbd>↓</kbd> | Closed: open and highlight the first option. Open: move to the next option, wrapping at the end. |
| <kbd>↑</kbd> | Closed: open and highlight the last option. Open: move to the previous option, wrapping at the start. |
| <kbd>Alt</kbd> + <kbd>↓</kbd> | Open the popup without highlighting anything. |
| <kbd>Alt</kbd> + <kbd>↑</kbd> | Close the popup, keeping the current value. |
| <kbd>Enter</kbd> | Commit the highlighted option. With nothing highlighted the keystroke is **not** consumed, so form submission still works. |
| <kbd>Esc</kbd> | First press: close the popup, keep the value. Second press: clear the field. |
| <kbd>Home</kbd> / <kbd>End</kbd> | Move the text cursor (per the APG, for an editable combobox) and drop the highlight, so <kbd>Enter</kbd> cannot commit a stale option. |
| <kbd>Tab</kbd> | Commit the highlighted option, then move focus on. Disable with `selectOnTab: false`. |
| Printable character | Filter. **Nothing is auto-highlighted** — auto-highlighting means <kbd>Enter</kbd> commits a value the user never chose. |

The toggle button is `tabindex="-1"`: it duplicates <kbd>Alt</kbd> + <kbd>↓</kbd>,
so making it a tab stop adds a stop that announces nothing new. It keeps an
accessible name and stays reachable in browse mode.

Result counts are announced through a polite live region scoped to the widget,
debounced by 350 ms. Announcing on every keystroke floods the speech queue and
the user never hears the count that matters.

### Tabs

The tab strip is **one** tab stop (roving tabindex).

| Key | Behaviour |
|---|---|
| <kbd>Tab</kbd> | Into the strip (one stop), then out to the panel. |
| <kbd>→</kbd> / <kbd>←</kbd> | Horizontal strip: next / previous tab, wrapping at both ends. |
| <kbd>↓</kbd> / <kbd>↑</kbd> | Vertical strip (`aria-orientation="vertical"`): the same, on the vertical axis. |
| <kbd>Home</kbd> / <kbd>End</kbd> | First / last tab. |
| <kbd>Enter</kbd> or <kbd>Space</kbd> | Manual activation only: show the focused tab's panel. |

Arrows for the *other* axis are left alone: a horizontal strip that swallows
<kbd>↓</kbd> breaks page scrolling for anyone with focus in the strip.

**Automatic activation** (default) switches the panel as focus moves.
**Manual activation** (`activation: 'manual'`) requires <kbd>Enter</kbd> or
<kbd>Space</kbd>; use it when showing a panel is expensive, because otherwise
arrowing across five tabs fires five requests.

The active panel gets `tabindex="0"` **only when it contains nothing focusable**,
so it is still reachable and readable. If it already holds focusable content,
adding a stop would cost the user an extra <kbd>Tab</kbd> for nothing. This is
recomputed each time a panel is shown, because panel content changes.

### Disclosure

| Key | Behaviour |
|---|---|
| <kbd>Enter</kbd> or <kbd>Space</kbd> | Toggle. Native `<button>` behaviour — there is deliberately no key handler, because adding one causes double activation. |

The three mistakes this pattern exists to avoid:

1. A `<div>` or `<a>` as the trigger. A link promises navigation; a div promises
   nothing.
2. `aria-expanded` on the region instead of on the control.
3. `aria-hidden` used to hide the panel instead of `hidden`. That leaves the
   content in the tab order while hiding it from the screen reader — the worst
   of both worlds.

### Accordion

| Key | Behaviour |
|---|---|
| <kbd>Enter</kbd> or <kbd>Space</kbd> | Toggle the focused section. |
| <kbd>↓</kbd> / <kbd>↑</kbd> | Next / previous header, wrapping at both ends. |
| <kbd>Home</kbd> / <kbd>End</kbd> | First / last header. |
| <kbd>Tab</kbd> | Next header, or into the open panel's content. |

Each header **must** be a real heading wrapping a button:

```html
<h3><button data-a11y-accordion-trigger aria-controls="s1">Shipping</button></h3>
```

Screen reader users navigate long pages by pulling up a list of headings. An
accordion whose sections are not headings is invisible to that workflow. The
level must match the surrounding outline; the component warns rather than
rewriting it, because only the page author knows the outline.

With `allowCollapseAll: false`, the sole open header gets **`aria-disabled`**,
never `disabled` — a disabled button leaves the tab order, and the user would
find the one section they are reading unreachable.

`role="region"` on panels is on by default and worth it for a handful of
substantial sections. Turn it off (`regionPanels: false`) for a long FAQ, where
forty landmarks is noise rather than navigation.

### Sortable table

| Key | Behaviour |
|---|---|
| <kbd>Tab</kbd> | Next column header button. |
| <kbd>Enter</kbd> or <kbd>Space</kbd> | Sort by that column. Activating the sorted column again reverses the direction. |

- `<caption>` is the table's accessible name. Without it the user hears
  "table, 4 columns, 240 rows" and has no idea what they are in.
- `scope="col"` on column headers and `scope="row"` on the identifying cell of
  each row is what makes the screen reader read "Price, £42" rather than "£42".
- `aria-sort` is on **exactly one** header. The others have the attribute
  removed, not set to `"none"`.
- The control is a `<button>` inside the `<th>`, not a handler on the `<th>`.
- The sort arrow is `aria-hidden`, and the announcement is built from the
  accessible name, so it says "sorted by Title" and not "sorted by Title ▼".
- Missing values sort to the bottom in **both** directions. Ranking them inside
  the direction flip means reversing a sort fills the top of the table with
  blanks.

### Menu button

Real focus moves into the menu — the opposite of the combobox, because there is
no text field to keep it in.

| Key | Behaviour |
|---|---|
| <kbd>Enter</kbd>, <kbd>Space</kbd>, <kbd>↓</kbd> | On the button: open the menu and focus the first item. |
| <kbd>↑</kbd> | On the button: open the menu and focus the last item. |
| <kbd>↓</kbd> / <kbd>↑</kbd> | Next / previous item, wrapping. Disabled items are stepped over, not landed on. |
| <kbd>Home</kbd> / <kbd>End</kbd> | First / last item. |
| <kbd>Enter</kbd> or <kbd>Space</kbd> | Activate the focused item. |
| <kbd>Esc</kbd> | Close and return focus to the button. |
| <kbd>Tab</kbd> | Close the menu and let focus move on — the keystroke is **not** consumed. |
| Printable character | Jump to the next item starting with it. A repeated character **cycles** through matches rather than searching for "dd". |

**Do not use `role="menu"` for site navigation.** A `<nav>` full of links marked
`role="menuitem"` is the single most common misuse of the role: it strips every
link affordance a screen reader user relies on — no "link" announcement, no link
list in the rotor, no open-in-new-tab expectation. `role="menu"` promises a list
of *actions* with menu keyboard behaviour. Navigation is a list of links.

Checkbox items keep the menu open, so several can be set in one visit.
`aria-checked` drives the tick in CSS, so the visual and announced states cannot
drift apart.

### Listbox

The list is the tab stop; the options never are. The highlight is carried by
`aria-activedescendant`.

| Key | Behaviour |
|---|---|
| <kbd>Tab</kbd> | Into the list — one stop, however many options it holds. |
| <kbd>↓</kbd> / <kbd>↑</kbd> | Move the highlight. **Clamps** at the ends; a listbox does not wrap. |
| <kbd>Home</kbd> / <kbd>End</kbd> | First / last option. |
| <kbd>Space</kbd> | Single-select: choose the highlighted option. Multi-select: toggle it. Always consumed, or the page scrolls out from under the user. |
| <kbd>Enter</kbd> | Choose the highlighted option when selection does not follow focus. |
| <kbd>Shift</kbd> + <kbd>↓</kbd> / <kbd>↑</kbd> | Multi-select: extend the selection as the highlight moves. |
| <kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>A</kbd> | Multi-select: select all. Press again to clear — a select-all with no way back is a trap. |
| Printable character | Jump to the next option starting with it, cycling on repeats. |

**Single-select**: selection follows focus by default, which is what a keyboard
user expects from a list of choices. Turn it off (`followFocus: false`) when
selecting has a side effect — a network request, a destructive change — and
require <kbd>Enter</kbd> instead.

**Multi-select**: focus and selection are separate states, and the design must
draw them differently. Arrowing moves the highlight without changing the ticks;
if both look the same, multi-select is impossible to follow.

Every option in a multi-select listbox carries an explicit `aria-selected`, so
"not selected" is stated rather than inferred. In a single-select one, only the
chosen option has it.

### Slider

| Key | Behaviour |
|---|---|
| <kbd>→</kbd> / <kbd>↑</kbd> | Increase by one step. |
| <kbd>←</kbd> / <kbd>↓</kbd> | Decrease by one step. |
| <kbd>Page Up</kbd> / <kbd>Page Down</kbd> | Large step — a tenth of the range by default. |
| <kbd>Home</kbd> / <kbd>End</kbd> | Jump to the minimum / maximum. |

Three things that decide whether a slider is usable:

1. **`aria-valuetext` whenever the raw number is not self-describing.**
   `aria-valuenow="3"` announces "3" — three what? With
   `aria-valuetext="Next day"` it announces something a person can act on. Use
   it for currency, dates, named steps and ratios.
2. **A name per thumb on a range slider.** Two thumbs both called "Price" are
   indistinguishable; they need "Minimum price" and "Maximum price".
3. **Bounds that move.** Each thumb's range is bounded by its neighbour, so
   `aria-valuemin`/`aria-valuemax` must move as the other thumb moves —
   otherwise the screen reader promises a range the thumb cannot reach.

In a right-to-left writing mode the arrows follow the **visual** direction of the
track, so <kbd>←</kbd> increases. Getting this backwards makes the control feel
broken to every RTL user. The track carries `touch-action: none`, without which
dragging a thumb on a touch screen scrolls the page instead.

### Tooltip

| Key | Behaviour |
|---|---|
| <kbd>Tab</kbd> | Focus the trigger. The tooltip appears **immediately** — a keyboard user has already committed, so there is no hover delay to serve. |
| <kbd>Esc</kbd> | Dismiss, without moving the pointer or focus. |

WCAG 2.1 SC 1.4.13 requires content shown on hover or focus to be:

1. **Dismissible** — <kbd>Esc</kbd> hides it *without moving the pointer or
   focus*. A tooltip that can only be dismissed by moving away can permanently
   obscure the content underneath for a screen-magnifier user, who may be
   looking at a 4× zoom of the exact region it covers.
2. **Hoverable** — the pointer can travel onto the tooltip and it stays. Hiding
   on `mouseleave` with no grace period fails this: it vanishes as the pointer
   crosses the gap, so a magnifier user can never read a tooltip longer than
   their viewport.
3. **Persistent** — it stays until dismissed, until hover and focus are both
   gone, or until it stops being valid. No auto-hide timer.

Two more that are not in 1.4.13 and matter as much:

- **Never the `title` attribute.** It cannot be styled, it appears after an
  uncontrollable delay, screen readers treat it inconsistently, and on touch it
  does not appear at all.
- **Never anything interactive inside.** A tooltip is not focusable, so a link
  or button in one is unreachable by keyboard. If it needs interaction, it is a
  popover or a dialog.

Use `aria-describedby` when the trigger already has a name and the tooltip adds
detail; `aria-labelledby` only for an icon-only control with no other name.
Using both gives the element two competing names. And tooltips do not exist on
touch — there is no hover, so anything essential must be somewhere else too.

### Toasts

| Key | Behaviour |
|---|---|
| <kbd>Tab</kbd> | Reach a toast's action and dismiss buttons. Focus anywhere in the stack pauses every timer. |
| <kbd>Enter</kbd> or <kbd>Space</kbd> | Activate the focused button. |

The stack is a labelled `region` landmark, so a screen reader user can jump to it
with the rotor and review notifications at their own pace instead of chasing them
before they expire.

---

## Focus management

The focus trap uses **three** mechanisms, because each one alone has a hole.

| Mechanism | Covers | Hole it leaves |
|---|---|---|
| `inert` on the background | Tab order, pointer events, **and the accessibility tree** | <kbd>Tab</kbd> can still leave the document into browser chrome and re-enter at the top |
| <kbd>Tab</kbd> keydown wrap | The document→chrome→document round trip | Only fires for <kbd>Tab</kbd> |
| `focusin` backstop | A click on a still-focusable element, a script calling `.focus()`, an autofocusing embed | — |

A trap built only on the second is escapable in four ways, and most are.

`aria-modal="true"` is set as well, but it is a *hint* to assistive technology
about the accessibility tree. It does nothing for the tab order and nothing for
pointer events. `inert` is the enforcement.

### `getTabbables()`

There is no DOM API for "what will `Tab` actually reach", so every trap
reimplements the browser's rules. The cases that are usually missed, each of
which is a real bug that reaches a keyboard user:

- A disabled `<fieldset>` disables its descendants **except** those in its first
  `<legend>`.
- A radio group is **one** tab stop — the checked radio, or the first one if none
  is checked. Missing this makes a trap leak tab stops.
- Elements inside a closed `<details>` have no client rects and are not tabbable.
- The visually-hidden clip pattern (1×1, `clip-path`) *is* tabbable — excluding it
  breaks skip links.
- A `<details>` with a `<summary>` is not itself tabbable; the summary is.
- Positive `tabindex` sorts before `tabindex="0"`. It is an antipattern, but a
  trap that ignores it wraps to the wrong element on pages that use it.

---

## Live regions

Five rules, in the order that breaking them causes damage:

1. **The region must exist before the text goes into it.** A region created and
   populated in the same task is usually not announced at all — assistive
   technology reacts to mutations *inside* a region it is already observing, not
   to the arrival of new DOM. `mountLiveRegions()` runs at init.
2. **Re-setting the same string is not a mutation.** Two identical "Copied"
   messages announce once. Clear the region, then write on a later task.
3. **`aria-atomic="true"` is for a single-message region** and wrong for an
   append-only log, where it re-reads everything each time.
4. **Do not make the visible toast stack the live region.** It mutates
   constantly, and `role="alert"` implies `aria-atomic="true"`, so a second toast
   re-announces the first. Keep the stack a plain landmark and mirror messages
   into separate hidden regions.
5. **`assertive` interrupts the user mid-sentence** — including mid-sentence in
   the thing they were reading to decide what to do. Errors only.

The gap between clearing and writing uses a double `requestAnimationFrame` when
the page is visible, and a `MessageChannel` message when it is hidden — rAF does
not fire in a backgrounded tab, and `setTimeout` there is clamped to roughly one
second per timer.

---

## Testing

```bash
./serve.sh 8080 && open http://localhost:8080/test/run.html
```

**187 assertions, run in a real browser.** Deliberately not jsdom: it implements
neither sequential focus navigation, nor `inert`, nor `:focus-visible`, nor
layout — so `getClientRects()` is always empty and every element looks hidden. A
focus trap that passes in jsdom tells you nothing about whether <kbd>Tab</kbd>
escapes it in Safari.

Two limits worth knowing:

- **Synthetic `KeyboardEvent`s do not trigger default actions.** Dispatching
  <kbd>Tab</kbd> does not move focus. That is fine for testing handlers that call
  `preventDefault()` and `.focus()` themselves, which is what these do, but it
  means a green suite is not proof of native focus order. Verify that by hand.
- **A document without system focus fires no focus events at all** — a
  background tab, an unfocused pane, a headless run. `activeElement` still
  updates, but `focus`, `focusin` and `focusout` never fire, so any handler that
  reacts to focus movement looks broken. The harness detects this and synthesises
  the events; in a focused window that path is skipped entirely.
- **A backgrounded tab clamps timers to roughly one per second.** A component
  timer set for 0 ms and a test's `wait(40)` then both land at ~1000 ms and race
  each other. For "this should eventually happen", use `until(predicate)`, which
  asserts the outcome rather than the schedule. For "this should *not* happen" a
  real wait is still required, long enough to outlast the timer under test —
  a poll cannot prove a negative.

**No automated tool can hear VoiceOver.** ARIA attributes being correct is
necessary and not sufficient — the announcement is what the user actually gets,
and it depends on the AT/browser pair. That is what the next section is for.

---

## VoiceOver test scripts

Run on macOS, in Safari. <kbd>VO</kbd> is <kbd>Control</kbd> + <kbd>Option</kbd>.
Turn VoiceOver on with <kbd>⌘</kbd> + <kbd>F5</kbd>.

Useful commands: <kbd>VO</kbd> + <kbd>→</kbd> / <kbd>←</kbd> move the virtual
cursor · <kbd>VO</kbd> + <kbd>U</kbd> opens the rotor · <kbd>VO</kbd> +
<kbd>Space</kbd> activates.

### Dialog

- [ ] Open a dialog. It announces the **title and the role** ("Rename workspace,
      dialog"), not just "dialog".
- [ ] The alert dialog also reads its description with the title.
- [ ] <kbd>VO</kbd> + <kbd>→</kbd> repeatedly. The virtual cursor **cannot leave
      the dialog** — this is the check `aria-modal` alone fails.
- [ ] <kbd>VO</kbd> + <kbd>U</kbd> → Headings. Only the dialog's heading is
      listed; the page behind it is gone.
- [ ] <kbd>Tab</kbd> past the last control. Focus wraps to the first.
- [ ] <kbd>Esc</kbd>. Focus returns to the trigger and VoiceOver announces that
      button — not the top of the page.
- [ ] Open "Dialog with nothing focusable". The **title is still announced**,
      because focus moved to the container.

### Combobox

- [ ] Focus the field. It announces "combobox" with its label and "collapsed".
- [ ] Press <kbd>↓</kbd>. It announces "expanded", then the first option **with
      its position** ("Apple, 1 of 42").
- [ ] Keep pressing <kbd>↓</kbd>. Each option is announced; **the field never
      loses focus** and you can still type.
- [ ] Type `ber`. After a beat, "7 results available" is announced — once, not
      once per keystroke.
- [ ] Type `zzz`. "No results available" is announced and the popup does not open.
- [ ] Press <kbd>Enter</kbd> on a highlighted option. The value is announced in
      the field.
- [ ] In the second (slow) combobox, type quickly. The list never flickers back
      to results for an earlier query.

### Tabs

- [ ] Focus the strip. It announces the tab list's **label**, the selected tab,
      and its position ("Account settings, Profile, selected, 1 of 3").
- [ ] <kbd>→</kbd>. The new tab announces as selected.
- [ ] <kbd>Tab</kbd> once from the strip. Focus goes **into the panel**, not to
      the next tab.
- [ ] Select "Billing" (no focusable content) and <kbd>Tab</kbd>. The panel
      itself takes focus and its content is read.
- [ ] In the manual-activation example, <kbd>→</kbd> announces the tab but the
      panel does **not** change until <kbd>Enter</kbd>.

### Disclosure and accordion

- [ ] Each trigger announces "collapsed" / "expanded".
- [ ] <kbd>VO</kbd> + <kbd>U</kbd> → Headings. **Every accordion section is
      listed**, at the right level. This is the check the pattern exists for.
- [ ] Collapsed panel content does not appear when moving with <kbd>VO</kbd> +
      <kbd>→</kbd>.
- [ ] In the single-select example, the open section's button announces as
      "dimmed" but is **still reachable** with <kbd>Tab</kbd>.

### Sortable table

- [ ] Enter the table. The **caption** is announced as its name, with the row and
      column count.
- [ ] <kbd>VO</kbd> + <kbd>→</kbd> across a row. Each cell is read **with its
      column header**, and the row header identifies the row.
- [ ] Focus a header button. It announces the column name and its sort state.
- [ ] Sort. "Table sorted by Title, ascending" is announced — **without** the
      arrow glyph.
- [ ] Sort by Files, then reverse. The row with no file count stays at the bottom
      both times.

### Menu button

- [ ] Focus the button. It announces the name **and that a menu will open**
      ("Actions, menu pop up button") — not just "button".
- [ ] Press <kbd>↓</kbd>. Focus moves into the menu and the first item is
      announced with its position ("Rename, 1 of 4").
- [ ] Press <kbd>d</kbd> repeatedly. It cycles Duplicate → Delete → Duplicate,
      announcing each.
- [ ] Arrow past the disabled item. It is **skipped**, not announced as a dead
      stop you have to arrow off again.
- [ ] In the View menu, activate a checkbox item. It announces "checked" / "not
      checked" and the menu **stays open**.
- [ ] Activate a radio item. Only one in the group is checked, and the group's
      label ("Sort by") is announced.
- [ ] <kbd>Esc</kbd>. Focus returns to the button and VoiceOver announces it.

### Listbox

- [ ] Tab into the list. It announces the **label**, "list box", and the number
      of options.
- [ ] Arrow through the single-select list. Each option is announced as
      "selected" as you land on it.
- [ ] In the multi-select list, arrow down. Options are announced **without**
      "selected" — the highlight moved, the selection did not.
- [ ] Press <kbd>Space</kbd>. The option announces as "selected".
- [ ] <kbd>Shift</kbd> + <kbd>↓</kbd> twice. Each newly selected option is
      announced.
- [ ] <kbd>Ctrl</kbd> + <kbd>A</kbd>, then again. The list is selected, then
      cleared.
- [ ] Type <kbd>d</kbd>. The highlight jumps to the first option starting with
      "d" and announces it.
- [ ] <kbd>VO</kbd> + <kbd>U</kbd> → Form Controls. The list appears once, as a
      single control — not as eight separate items.

### Slider

- [ ] Focus the Volume thumb. It announces the label, the value, and the range.
- [ ] Arrow up and down. Each new value is announced as you go.
- [ ] Focus the Delivery speed thumb. It announces **"Standard"**, not "1". This
      is the `aria-valuetext` check, and the whole point of the control.
- [ ] <kbd>Page Up</kbd> and <kbd>Home</kbd>/<kbd>End</kbd> announce the new
      value each time.
- [ ] On the price slider, focus each thumb in turn. They announce as
      **"Minimum price"** and **"Maximum price"**, not both as "Price".
- [ ] Move the maximum thumb down, then focus the minimum thumb. Its announced
      **upper bound has moved with it**.

### Tooltip

- [ ] Tab to "Save". The tooltip text is announced **as a description**, after
      the button's own name — and it appears immediately, with no delay.
- [ ] Tab to the icon-only button. The tooltip text is announced as its **name**,
      because it has no other one.
- [ ] With the pointer resting on a trigger, press <kbd>Esc</kbd>. The tooltip
      disappears and neither the pointer nor focus has moved.
- [ ] Hover a trigger, then move the pointer onto the tooltip itself. It stays.
- [ ] Leave a tooltip open for a minute. It does not time out.
- [ ] Check that no trigger has a `title` attribute producing a second, native
      tooltip on top of this one.

### Toasts

- [ ] Trigger a polite toast while VoiceOver is reading something else. It
      **waits its turn**.
- [ ] Trigger the error. It **interrupts**.
- [ ] Press "Same message twice". Both are announced, despite identical text.
- [ ] Trigger three toasts. Each is announced **once** — the earlier ones are not
      re-read.
- [ ] <kbd>VO</kbd> + <kbd>U</kbd> → Landmarks. "Notifications" is listed and can
      be jumped to.
- [ ] <kbd>Tab</kbd> into a toast. The countdown stops; it does not vanish
      under you.
- [ ] Dismiss the focused toast. Focus lands on the remaining toast, not on the
      top of the page.

Also worth running: **Safari with VoiceOver** and **Chrome with VoiceOver**
behave differently, particularly for live regions. If you only test one pair,
test Safari — it is the pair most VoiceOver users are on.

---

## Browser and OS behaviour

- **`prefers-reduced-motion`** — animation is reduced to a hair, not removed;
  opacity transitions stay so state changes are still perceivable. Toasts read
  the preference in JS as well as CSS.
- **`forced-colors` (Windows High Contrast)** — the OS replaces author colors, so
  anything that carried meaning through color alone disappears. Focus rings,
  sort state, selected tabs and the combobox highlight are restated with system
  color keywords.
- **Focus indicator** — `:focus-visible`, never `:focus`, so a mouse click leaves
  no ring but every keyboard and switch user always sees one. 3 px outline with a
  2 px offset, which satisfies WCAG 2.2 Focus Appearance (2.4.11) on both light
  and dark surfaces.
- **Target size** — interactive controls are at least 24 × 24 CSS px (WCAG 2.5.8).
- **Dark theme** — `data-theme="dark"` on `<html>`, defaulting to
  `prefers-color-scheme`.

---

## Limitations

Deliberately not implemented, rather than half-implemented:

- **Combobox `aria-autocomplete="both"`** (inline completion). It needs text-range
  selection handling that behaves differently across engines and interacts badly
  with IME composition.
- **Deletable tabs** (<kbd>Delete</kbd> on a tab), and tab overflow scrolling.
- **Multi-select listbox** in the combobox.
- **Column-header sorting for tables with `colspan`/`rowspan` headers.** Those
  need `headers`/`id` association rather than `scope`, which is a different
  pattern.
- **Shadow DOM.** `getActiveElement()` pierces open shadow roots, but the focus
  trap's tab cycle does not — `querySelectorAll` does not cross the boundary.
- **Submenus.** A menu item that opens a nested menu needs its own
  `aria-haspopup`, <kbd>→</kbd>/<kbd>←</kbd> handling and a hover intent delay,
  and the focus-return chain has to unwind correctly through every level.
- **Tree view, date picker and carousel.** Each is a substantial pattern in its
  own right rather than a variation on something here.
- **A virtualised listbox.** `aria-activedescendant` must point at an element
  that exists, so a windowed list needs `aria-setsize`/`aria-posinset` and
  careful handling of the option currently being pointed at.
- **A polyfill for `inert`.** There is a documented fallback to `aria-hidden`
  when the property is absent, which covers the accessibility tree but not the
  tab order. Every browser released since mid-2022 supports `inert` natively.

[apg]: https://www.w3.org/WAI/ARIA/apg/
