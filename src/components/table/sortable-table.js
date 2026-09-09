import { ensureId, emit, setDefault } from '../../utils/dom.js';
import { announce } from '../../utils/live-region.js';

/**
 * Sortable data table — APG "Table" + "Sortable Table Column Headers".
 *
 * What makes a data table readable with a screen reader, in order of impact:
 *
 *  1. `<caption>`. It is the table's accessible name. Without it the user
 *     hears "table, 8 columns, 240 rows" and has no idea what they are in.
 *  2. `scope` on every header cell. `scope="col"` on column headers,
 *     `scope="row"` on the cell that identifies each row. This is what makes
 *     the screen reader read "Price, £42" instead of just "£42" as the user
 *     moves across a row.
 *  3. `aria-sort` on exactly *one* header at a time, and only on the header
 *     that is actually sorted. Leaving `aria-sort="none"` on the other headers
 *     is allowed but noisy; this implementation removes it instead.
 *  4. The sort control is a `<button>` *inside* the `<th>`, not a click handler
 *     on the `<th>`. The `th` keeps the header semantics; the button provides
 *     the operable control with a real name and a real focus ring.
 *  5. Announce the new order. Re-sorting rewrites the whole table below the
 *     user's reading position with no other feedback — `aria-sort` alone is
 *     only discovered if the user navigates back up to the header.
 *
 * Expected markup:
 *
 *   <table data-a11y-sortable-table>
 *     <caption>Team availability</caption>
 *     <thead>
 *       <tr>
 *         <th scope="col" data-sort-type="text"><button>Name</button></th>
 *   ...
 */
export class SortableTable {
  /**
   * @param {HTMLTableElement} table
   * @param {object} [options]
   * @param {number|null} [options.defaultSort=null] column index
   * @param {'ascending'|'descending'} [options.defaultDirection='ascending']
   */
  constructor(table, options = {}) {
    this.table = table;
    this.options = { defaultSort: null, defaultDirection: 'ascending', ...options };

    this.tbody = table.tBodies[0];
    this.headers = Array.from(table.querySelectorAll('thead th'));
    /** @type {{ index: number, direction: string }|null} */
    this.current = null;

    this._applyStaticAria();
    table.addEventListener('click', this._onClick.bind(this));

    if (this.options.defaultSort !== null) {
      this.sort(this.options.defaultSort, this.options.defaultDirection, { announce: false });
    }
  }

  _applyStaticAria() {
    const { table } = this;

    if (!table.querySelector('caption')) {
      console.warn(
        '[SortableTable] No <caption>. The table has no accessible name — add ' +
          'a <caption>, or aria-labelledby pointing at a visible heading.',
        table,
      );
    }

    this.headers.forEach((header) => {
      // scope is not optional. Browsers guess header association for simple
      // tables and get it wrong for anything else.
      setDefault(header, 'scope', 'col');

      const button = header.querySelector('button');
      if (!button) return;
      setDefault(button, 'type', 'button');
      ensureId(header, 'th');
    });

    // Warn about missing row headers, the most common omission after caption.
    const firstRow = this.tbody?.rows[0];
    if (firstRow && !firstRow.querySelector('th[scope="row"]')) {
      console.warn(
        '[SortableTable] No <th scope="row"> in the body rows. Without a row ' +
          'header the screen reader cannot say which row a cell belongs to.',
        table,
      );
    }
  }

  _onClick(event) {
    const button = event.target.closest('thead th button');
    if (!button) return;
    const header = button.closest('th');
    const index = this.headers.indexOf(header);
    if (index === -1) return;

    const isCurrent = this.current?.index === index;
    const direction =
      isCurrent && this.current.direction === 'ascending' ? 'descending' : 'ascending';
    this.sort(index, direction);
  }

  /**
   * @param {number} index
   * @param {'ascending'|'descending'} direction
   */
  sort(index, direction = 'ascending', { announce: shouldAnnounce = true } = {}) {
    const header = this.headers[index];
    if (!header || !this.tbody) return this;

    const type = header.dataset.sortType ?? 'text';
    const rows = Array.from(this.tbody.rows);
    const factor = direction === 'descending' ? -1 : 1;

    const sorted = rows
      // Decorate with the original position so the sort is stable: rows that
      // compare equal keep their previous relative order, which stops the
      // table from visibly reshuffling on every re-sort.
      .map((row, position) => ({ row, position, key: this._sortKey(row, index, type) }))
      .sort((a, b) => {
        // Missing values are ranked *outside* the direction flip, so they stay
        // at the bottom in both directions. Multiplying their comparison by
        // the direction factor instead would float every empty cell to the top
        // on the descending pass — the user reverses the sort and gets a
        // screenful of blanks.
        const aMissing = this._isMissing(a.key, type);
        const bMissing = this._isMissing(b.key, type);
        if (aMissing || bMissing) {
          if (aMissing && bMissing) return a.position - b.position;
          return aMissing ? 1 : -1;
        }

        const comparison = this._compare(a.key, b.key, type);
        return comparison !== 0 ? comparison * factor : a.position - b.position;
      });

    // One reflow rather than one per row.
    const fragment = document.createDocumentFragment();
    for (const { row } of sorted) fragment.appendChild(row);
    this.tbody.appendChild(fragment);

    // Exactly one aria-sort in the table.
    for (const other of this.headers) other.removeAttribute('aria-sort');
    header.setAttribute('aria-sort', direction);
    this.current = { index, direction };

    this._updateIndicators();

    if (shouldAnnounce) {
      const name = this._headerName(header);
      announce(`Table sorted by ${name}, ${direction}.`);
    }

    emit(this.table, 'a11y-table:sort', { index, direction, table: this });
    return this;
  }

  /**
   * The header's *accessible* name — which is not the same as its textContent.
   * The sort arrow is an aria-hidden child, so assistive technology never
   * includes it; announcing "sorted by Title▼" would describe something no
   * user has been told about.
   */
  _headerName(header) {
    const source = header.querySelector('button') ?? header;
    return Array.from(source.childNodes)
      .filter(
        (node) =>
          !(node.nodeType === Node.ELEMENT_NODE && node.getAttribute('aria-hidden') === 'true'),
      )
      .map((node) => node.textContent)
      .join('')
      .trim();
  }

  /** An empty or unparseable cell: sorted to the bottom, never compared. */
  _isMissing(key, type) {
    if (type === 'number' || type === 'date') return Number.isNaN(key);
    return key === '';
  }

  _updateIndicators() {
    this.headers.forEach((header) => {
      const button = header.querySelector('button');
      if (!button) return;
      const sorted = header.getAttribute('aria-sort');
      // The arrow is decoration; aria-sort carries the meaning. Marking it
      // aria-hidden stops the screen reader reading a bare "▲" after the
      // header name, on top of the state it already announced.
      let indicator = button.querySelector('[data-sort-indicator]');
      if (!indicator) {
        indicator = document.createElement('span');
        indicator.dataset.sortIndicator = '';
        indicator.setAttribute('aria-hidden', 'true');
        indicator.className = 'a11y-table__sort-indicator';
        button.appendChild(indicator);
      }
      indicator.textContent = sorted === 'ascending' ? '▲' : sorted === 'descending' ? '▼' : '';
    });
  }

  _sortKey(row, index, type) {
    const cell = row.cells[index];
    if (!cell) return type === 'number' ? Number.NaN : '';
    // data-sort-value lets the markup carry a sortable value that differs from
    // the display text ("2 days ago" displayed, an ISO date for sorting).
    const raw = cell.dataset.sortValue ?? cell.textContent.trim();

    if (type === 'number') return Number.parseFloat(raw.replace(/[^0-9.eE+-]/g, ''));
    if (type === 'date') return Date.parse(raw);
    return raw;
  }

  _compare(a, b, type) {
    // Missing values never reach here; see the comparator in sort().
    if (type === 'number' || type === 'date') return a - b;
    // localeCompare with numeric collation so "Item 10" follows "Item 9".
    return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
  }
}

export function initSortableTables(scope = document) {
  return Array.from(scope.querySelectorAll('[data-a11y-sortable-table]')).map(
    (table) => new SortableTable(table),
  );
}
