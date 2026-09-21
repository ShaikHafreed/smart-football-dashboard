/**
 * The cursor stack behind the shot-history pager.
 *
 * A keyset pager only knows how to go forward: the query resumes after a row,
 * so "the previous page" is not something the database can be asked for. What
 * makes Previous work is remembering which row each page resumed after, which
 * is a small piece of state with several ways to get subtly wrong - going
 * back twice, going forward from a page you had already been past, resetting
 * when a filter changes.
 *
 * It lives here, as plain data, because that is what lets it be tested. The
 * environment this project runs tests in has no DOM, so logic left inside the
 * component is logic nothing can check.
 *
 * `cursors[n]` is the row page n resumes after. `cursors[0]` is null because
 * the first page starts at the top.
 */

export const FIRST_PAGE = { cursors: [null], index: 0 };

/** The cursor the current page resumes after, or null at the top. */
export function currentCursor(pager) {
  return pager.cursors[pager.index] ?? null;
}

/**
 * Move forward onto a page that resumes after `nextCursor`.
 *
 * Truncates anything past the current page first: having gone back and then
 * taken a different route forward - which is what a filter change or a live
 * refresh can do - the old trail no longer describes where the pages are.
 */
export function advance(pager, nextCursor) {
  if (!nextCursor) return pager;
  return {
    cursors: [...pager.cursors.slice(0, pager.index + 1), nextCursor],
    index: pager.index + 1,
  };
}

/** Back one page, never past the first. */
export function back(pager) {
  if (pager.index === 0) return pager;
  return { cursors: pager.cursors, index: pager.index - 1 };
}

/** Straight back to the newest page, keeping the trail that got here. */
export function toNewest(pager) {
  if (pager.index === 0) return pager;
  return { cursors: pager.cursors, index: 0 };
}

/**
 * Which rows of the whole result the current page is showing, 1-based.
 * Derived from the page index rather than counted, so it is right before any
 * total has arrived.
 */
export function pageRange(pager, pageSize, rowsOnPage) {
  const first = pager.index * pageSize + 1;
  return { first, last: pager.index * pageSize + rowsOnPage };
}
