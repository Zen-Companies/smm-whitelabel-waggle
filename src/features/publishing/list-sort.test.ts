import { describe, expect, it } from "vitest";
import { parseListSort, sortListRows } from "./list-sort";

const rows = [
  { id: "planned", n: null },
  { id: "a", n: { reached: 120, engagement: 4 } },
  { id: "b", n: { reached: 80, engagement: 30 } },
  { id: "soon", n: { reached: null, engagement: null } },
  { id: "c", n: { reached: 120, engagement: 9 } },
];
const ids = (list: typeof rows) => list.map((r) => r.id);

describe("the List view's sort", () => {
  it("reads the address, Newest by default", () => {
    expect(parseListSort("reached")).toBe("reached");
    expect(parseListSort("engagement")).toBe("engagement");
    expect(parseListSort("x")).toBe("newest");
    expect(parseListSort(undefined)).toBe("newest");
  });

  it("keeps the usual order for Newest", () => {
    expect(ids(sortListRows(rows, "newest", (r) => r.n))).toEqual([
      "planned",
      "a",
      "b",
      "soon",
      "c",
    ]);
  });

  it("puts the most reached first, posts without numbers last, ties in the usual order", () => {
    expect(ids(sortListRows(rows, "reached", (r) => r.n))).toEqual([
      "a",
      "c",
      "b",
      "planned",
      "soon",
    ]);
  });

  it("sorts by engagement", () => {
    expect(ids(sortListRows(rows, "engagement", (r) => r.n))).toEqual([
      "b",
      "c",
      "a",
      "planned",
      "soon",
    ]);
  });
});
