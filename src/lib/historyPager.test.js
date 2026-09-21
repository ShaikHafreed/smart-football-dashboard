import { describe, it, expect } from "vitest";
import { FIRST_PAGE, currentCursor, advance, back, toNewest, pageRange } from "./historyPager";

const c = (n) => ({ createdAt: `t${n}`, id: `i${n}` });

describe("historyPager", () => {
  it("starts at the top, with no cursor to resume after", () => {
    expect(currentCursor(FIRST_PAGE)).toBeNull();
    expect(FIRST_PAGE.index).toBe(0);
  });

  it("walks forward, remembering what each page resumed after", () => {
    let p = advance(FIRST_PAGE, c(1));
    expect(p.index).toBe(1);
    expect(currentCursor(p)).toEqual(c(1));

    p = advance(p, c(2));
    expect(p.index).toBe(2);
    expect(currentCursor(p)).toEqual(c(2));
  });

  it("walks back to the cursor the earlier page used", () => {
    const p = back(advance(advance(FIRST_PAGE, c(1)), c(2)));
    expect(p.index).toBe(1);
    expect(currentCursor(p)).toEqual(c(1));
  });

  it("cannot go back past the first page", () => {
    expect(back(FIRST_PAGE)).toBe(FIRST_PAGE);
    expect(currentCursor(back(FIRST_PAGE))).toBeNull();
  });

  it("returns to the newest page without losing the trail", () => {
    const deep = advance(advance(advance(FIRST_PAGE, c(1)), c(2)), c(3));
    const top = toNewest(deep);
    expect(top.index).toBe(0);
    expect(currentCursor(top)).toBeNull();
    // Going forward again should retrace, not start a fresh trail.
    expect(top.cursors).toHaveLength(4);
  });

  it("is already at the newest page when it is", () => {
    expect(toNewest(FIRST_PAGE)).toBe(FIRST_PAGE);
  });

  it("drops the stale trail when it goes forward a different way", () => {
    // Back to page 2, then forward to a page that resumes somewhere else:
    // the old page-3 cursor no longer describes where page 3 is.
    const deep = advance(advance(advance(FIRST_PAGE, c(1)), c(2)), c(3));
    const rerouted = advance(back(deep), c(9));
    expect(rerouted.index).toBe(3);
    expect(currentCursor(rerouted)).toEqual(c(9));
    expect(rerouted.cursors).toHaveLength(4);
    expect(rerouted.cursors).not.toContainEqual(c(3));
  });

  it("refuses to advance past the last page", () => {
    // hasMore false means the page query returned no next cursor; advancing
    // would land on a page that does not exist.
    const p = advance(FIRST_PAGE, c(1));
    expect(advance(p, null)).toBe(p);
    expect(advance(p, undefined)).toBe(p);
  });

  it("never mutates the pager it was given", () => {
    const start = advance(FIRST_PAGE, c(1));
    const snapshot = JSON.parse(JSON.stringify(start));
    advance(start, c(2));
    back(start);
    toNewest(start);
    expect(start).toEqual(snapshot);
  });

  it("reports which rows of the result are on screen, 1-based", () => {
    expect(pageRange(FIRST_PAGE, 25, 25)).toEqual({ first: 1, last: 25 });
    expect(pageRange(advance(FIRST_PAGE, c(1)), 25, 25)).toEqual({ first: 26, last: 50 });
  });

  it("reports a short final page by what it actually holds", () => {
    const p = advance(advance(FIRST_PAGE, c(1)), c(2));
    expect(pageRange(p, 25, 7)).toEqual({ first: 51, last: 57 });
  });

  it("does not claim a row range for an empty page", () => {
    expect(pageRange(FIRST_PAGE, 25, 0)).toEqual({ first: 1, last: 0 });
  });
});
