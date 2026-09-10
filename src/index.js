/** Public API. */

export { Dialog, initDialogs } from './components/dialog/dialog.js';
export { Combobox, initComboboxes } from './components/combobox/combobox.js';
export { Tabs, initTabs } from './components/tabs/tabs.js';
export { Disclosure, initDisclosures } from './components/disclosure/disclosure.js';
export { Accordion, initAccordions } from './components/accordion/accordion.js';
export { SortableTable, initSortableTables } from './components/table/sortable-table.js';
export { ToastRegion, toasts } from './components/toast/toast.js';
export { Menu, initMenus } from './components/menu/menu.js';
export { Listbox, initListboxes } from './components/listbox/listbox.js';
export { Slider, initSliders } from './components/slider/slider.js';
export { Tooltip, initTooltips } from './components/tooltip/tooltip.js';

export { FocusTrap } from './utils/focus-trap.js';
export { inertBackground } from './utils/inert.js';
export { announce, mountLiveRegions, createScopedLiveRegion } from './utils/live-region.js';
export { getTabbables, isTabbable, isFocusable, getActiveElement } from './utils/focusable.js';
export { lockScroll, unlockScroll } from './utils/scroll-lock.js';
export { Keys } from './utils/keys.js';
export { Typeahead } from './utils/typeahead.js';

import { mountLiveRegions } from './utils/live-region.js';
import { initDialogs } from './components/dialog/dialog.js';
import { initTabs } from './components/tabs/tabs.js';
import { initDisclosures } from './components/disclosure/disclosure.js';
import { initAccordions } from './components/accordion/accordion.js';
import { initSortableTables } from './components/table/sortable-table.js';
import { initMenus } from './components/menu/menu.js';
import { initListboxes } from './components/listbox/listbox.js';
import { initSliders } from './components/slider/slider.js';
import { initTooltips } from './components/tooltip/tooltip.js';

/**
 * Wire every declaratively-marked component in `scope`.
 * Comboboxes are excluded: they need a data source, so they are constructed
 * explicitly.
 */
export function init(scope = document) {
  // Mount the shared live regions first, so they exist in the DOM before the
  // first announcement is queued into them. See utils/live-region.js.
  mountLiveRegions();

  return {
    dialogs: initDialogs(scope),
    tabs: initTabs(scope),
    disclosures: initDisclosures(scope),
    accordions: initAccordions(scope),
    tables: initSortableTables(scope),
    menus: initMenus(scope),
    listboxes: initListboxes(scope),
    sliders: initSliders(scope),
    tooltips: initTooltips(scope),
  };
}
