// ── Client-side pagination ──────────────────────────────────────────────
// Backs AdminLTE's `card-footer` pattern: a "Showing X to Y of Z" range on
// the left, numbered `.pagination-sm` controls on the right.

/**
 * Slice `items` for `page`, clamping the page into range.
 *
 * Clamping matters because the page index outlives the list it indexes: type
 * into the search box while on page 4 and the result set can collapse to one
 * page, which would otherwise render an empty table with no way back.
 *
 * @returns {{slice: Array, page: number, pageCount: number, total: number, from: number, to: number}}
 *   `from`/`to` are 1-indexed for display and are both 0 when the list is empty.
 */
export function paginate(items = [], page = 1, perPage = 10) {
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / perPage));
  const current = Math.min(Math.max(1, Math.floor(page) || 1), pageCount);
  const start = (current - 1) * perPage;
  const slice = items.slice(start, start + perPage);

  return {
    slice,
    page: current,
    pageCount,
    total,
    from: total === 0 ? 0 : start + 1,
    to: start + slice.length,
  };
}

/**
 * The run of page numbers to render, windowed around `current`.
 *
 * The window keeps a fixed width wherever possible — near either end it slides
 * rather than shrinking, so the control does not change size as you page
 * through and shift the buttons under the cursor.
 */
export function pageWindow(current, pageCount, size = 5) {
  if (pageCount <= size) return range(1, pageCount);

  const half = Math.floor(size / 2);
  let start = current - half;
  if (start < 1) start = 1;
  if (start + size - 1 > pageCount) start = pageCount - size + 1;

  return range(start, start + size - 1);
}

function range(from, to) {
  const out = [];
  for (let i = from; i <= to; i += 1) out.push(i);
  return out;
}
