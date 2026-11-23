import { describe, expect, it } from "vitest";
import { pageOf } from "./paging";

describe("pageOf", () => {
  const list = Array.from({ length: 37 }, (_, i) => i + 1);

  it("shows one page and where it is", () => {
    expect(pageOf(list, 0, 4)).toMatchObject({ items: [1, 2, 3, 4], pages: 10, from: 1, to: 4 });
    expect(pageOf(list, 9, 4)).toMatchObject({ items: [37], page: 9, from: 37, to: 37 });
  });

  it("clamps the page", () => {
    expect(pageOf(list, 99, 4).page).toBe(9);
    expect(pageOf(list, -3, 4).page).toBe(0);
    expect(pageOf(list, Number.NaN, 4).page).toBe(0);
  });

  it("handles an empty list", () => {
    expect(pageOf([], 2, 5)).toEqual({ items: [], page: 0, pages: 1, from: 0, to: 0, total: 0 });
  });
});
