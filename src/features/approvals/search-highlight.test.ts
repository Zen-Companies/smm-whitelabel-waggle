import { describe, expect, it } from "vitest";
import { highlightParts } from "./search-highlight";

describe("highlightParts", () => {
  it("marks every match, keeping the original case", () => {
    expect(highlightParts("Ube latte and ube cake", "ube")).toEqual([
      { text: "Ube", hit: true },
      { text: " latte and ", hit: false },
      { text: "ube", hit: true },
      { text: " cake", hit: false },
    ]);
  });
  it("leaves text alone for a short or missing search", () => {
    expect(highlightParts("Hello", "h")).toEqual([{ text: "Hello", hit: false }]);
    expect(highlightParts("Hello", "zz")).toEqual([{ text: "Hello", hit: false }]);
  });
});
