import { describe, it, assert, mount, click, frames } from '../harness.js';
import { SortableTable } from '../../src/components/table/sortable-table.js';
import { getLiveRegion, mountLiveRegions } from '../../src/utils/live-region.js';

const MARKUP = `
  <table class="a11y-table" data-a11y-sortable-table>
    <caption>Open pull requests</caption>
    <thead>
      <tr>
        <th data-sort-type="text"><button>Title</button></th>
        <th data-sort-type="number"><button>Files</button></th>
        <th data-sort-type="date"><button>Opened</button></th>
        <th>Author</th>
      </tr>
    </thead>
    <tbody>
      <tr><th scope="row">Item 10</th><td>3</td><td data-sort-value="2026-02-01">1 Feb</td><td>rin</td></tr>
      <tr><th scope="row">Item 9</th><td>12</td><td data-sort-value="2026-01-04">4 Jan</td><td>rin</td></tr>
      <tr><th scope="row">Item 2</th><td></td><td data-sort-value="2026-03-11">11 Mar</td><td>ada</td></tr>
    </tbody>
  </table>
`;

function setup() {
  const root = mount(MARKUP);
  const table = new SortableTable(root.querySelector('table'));
  return { root, table, headers: Array.from(root.querySelectorAll('thead th')) };
}

const rowNames = (root) =>
  Array.from(root.querySelectorAll('tbody th[scope="row"]')).map((th) => th.textContent);

describe('SortableTable — structure', () => {
  it('has a caption, which is the table’s accessible name', () => {
    const { root } = setup();
    assert.equal(root.querySelector('caption').textContent, 'Open pull requests');
  });

  it('defaults every column header to scope="col"', () => {
    const { headers } = setup();
    for (const header of headers) assert.attribute(header, 'scope', 'col');
  });

  it('starts with no aria-sort anywhere', () => {
    const { headers } = setup();
    for (const header of headers) assert.noAttribute(header, 'aria-sort');
  });
});

describe('SortableTable — aria-sort', () => {
  it('sets aria-sort on the sorted column only', () => {
    const { table, headers } = setup();
    table.sort(0, 'ascending', { announce: false });

    assert.attribute(headers[0], 'aria-sort', 'ascending');
    assert.noAttribute(headers[1], 'aria-sort');
    assert.noAttribute(headers[2], 'aria-sort');
  });

  it('moves aria-sort when another column is sorted, never leaving two', () => {
    const { table, headers } = setup();
    table.sort(0, 'ascending', { announce: false });
    table.sort(1, 'ascending', { announce: false });

    const sorted = headers.filter((h) => h.hasAttribute('aria-sort'));
    assert.equal(sorted.length, 1);
    assert.equal(sorted[0], headers[1]);
  });

  it('toggles direction when the same header is activated again', () => {
    const { root, headers } = setup();
    const button = headers[0].querySelector('button');

    click(button);
    assert.attribute(headers[0], 'aria-sort', 'ascending');
    click(button);
    assert.attribute(headers[0], 'aria-sort', 'descending');
  });

  it('keeps the sort arrow out of the accessible name', () => {
    const { table, headers } = setup();
    table.sort(0, 'ascending', { announce: false });
    const indicator = headers[0].querySelector('[data-sort-indicator]');
    assert.attribute(indicator, 'aria-hidden', 'true');
  });
});

describe('SortableTable — ordering', () => {
  it('sorts text with numeric collation, so Item 9 precedes Item 10', () => {
    const { root, table } = setup();
    table.sort(0, 'ascending', { announce: false });
    assert.deepEqual(rowNames(root), ['Item 2', 'Item 9', 'Item 10']);
  });

  it('sorts numbers numerically and pushes empty cells to the end both ways', () => {
    const { root, table } = setup();
    table.sort(1, 'ascending', { announce: false });
    assert.deepEqual(rowNames(root), ['Item 10', 'Item 9', 'Item 2']);

    table.sort(1, 'descending', { announce: false });
    assert.deepEqual(rowNames(root), ['Item 9', 'Item 10', 'Item 2']);
  });

  it('sorts dates by data-sort-value, not by the displayed text', () => {
    const { root, table } = setup();
    table.sort(2, 'ascending', { announce: false });
    assert.deepEqual(rowNames(root), ['Item 9', 'Item 10', 'Item 2']);
  });

  it('is stable: equal rows keep their previous relative order', () => {
    const { root, table } = setup();
    table.sort(0, 'ascending', { announce: false });
    table.sort(3, 'ascending', { announce: false });
    // Both "rin" rows tie; they must stay in the Item 9 → Item 10 order the
    // previous sort left them in.
    assert.deepEqual(rowNames(root), ['Item 2', 'Item 9', 'Item 10']);
  });
});

describe('SortableTable — announcement', () => {
  it('announces the new order politely', async () => {
    mountLiveRegions();
    const { table } = setup();
    table.sort(0, 'descending');
    await frames(4);

    const region = getLiveRegion('polite');
    assert.equal(region.textContent, 'Table sorted by Title, descending.');
  });
});
