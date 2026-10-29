import { describe, expect, it } from "vitest";
import { matchTopics, usageByEntry, usageText } from "./usage";

describe("usageByEntry", () => {
  it("counts each reply once per topic", () => {
    const counts = usageByEntry([
      { kb_entry_ids: ["a", "b"] },
      { kb_entry_ids: ["a", "a"] },
      { kb_entry_ids: null },
    ]);
    expect(counts.get("a")).toBe(2);
    expect(counts.get("b")).toBe(1);
    expect(counts.get("c")).toBeUndefined();
  });

  it("says it in words", () => {
    expect(usageText(0)).toBe("Not used this week");
    expect(usageText(1)).toBe("Used in 1 reply this week");
    expect(usageText(12)).toBe("Used in 12 replies this week");
  });
});

describe("matchTopics", () => {
  const entries = [
    { title: "Opening hours", content: "Mon to Fri 7am" },
    { title: "Location and parking", content: "Free parking behind the shop" },
  ];
  it("finds by title or details, ignoring case", () => {
    expect(matchTopics(entries, "PARKING")).toHaveLength(1);
    expect(matchTopics(entries, "7am")[0].title).toBe("Opening hours");
    expect(matchTopics(entries, "  ")).toHaveLength(2);
  });
});
