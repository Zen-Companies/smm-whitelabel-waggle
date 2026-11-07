import { describe, expect, it } from "vitest";
import {
  activityHref,
  changeVsBefore,
  parseActivityFilters,
  parseDailyCap,
  percentile,
} from "./admin-filters";

const TOOLS = ["list_inbox", "approve_reply"];
const BRAND = "6f1c2a10-1111-4222-8333-444455556666";

describe("parseActivityFilters", () => {
  it("defaults to everything in the last 24 hours", () => {
    expect(parseActivityFilters({}, TOOLS)).toEqual({
      tool: null,
      brand: null,
      assistant: null,
      window: "24h",
      errorsOnly: false,
      before: null,
    });
  });

  it("keeps known values and drops the rest", () => {
    const f = parseActivityFilters(
      { tool: "approve_reply", brand: BRAND, assistant: "Playground", when: "7d", errors: "1" },
      TOOLS,
    );
    expect(f).toMatchObject({
      tool: "approve_reply",
      brand: BRAND,
      assistant: "Playground",
      window: "7d",
      errorsOnly: true,
    });
    expect(
      parseActivityFilters(
        { tool: "drop_table", brand: "x", assistant: "Bard", when: "1y", before: "nope" },
        TOOLS,
      ),
    ).toMatchObject({ tool: null, brand: null, assistant: null, window: "24h", before: null });
  });

  it("round-trips through the URL", () => {
    const f = parseActivityFilters({ tool: "list_inbox", when: "30d", errors: "1" }, TOOLS);
    expect(activityHref(f)).toBe("/admin/mcp-activity?tool=list_inbox&when=30d&errors=1");
    expect(activityHref({})).toBe("/admin/mcp-activity");
  });
});

it("percentile: nearest rank", () => {
  expect(percentile([], 50)).toBeNull();
  expect(percentile([10, 20, 30, 40], 50)).toBe(20);
  expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 100], 95)).toBe(100);
});

it("changeVsBefore", () => {
  expect(changeVsBefore(112, 100)).toBe("+12%");
  expect(changeVsBefore(50, 100)).toBe("-50%");
  expect(changeVsBefore(5, 0)).toBeNull();
});

it("parseDailyCap: blank is the default; whole numbers 1–10,000", () => {
  expect(parseDailyCap("")).toEqual({ cap: null });
  expect(parseDailyCap(" 250 ")).toEqual({ cap: 250 });
  expect(parseDailyCap("1,000")).toEqual({ cap: 1000 });
  expect(parseDailyCap("0")).toHaveProperty("error");
  expect(parseDailyCap("10001")).toHaveProperty("error");
  expect(parseDailyCap("12.5")).toHaveProperty("error");
});
