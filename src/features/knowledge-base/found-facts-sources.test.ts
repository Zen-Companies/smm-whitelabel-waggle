import { describe, expect, it } from "vitest";
import { sourcesFor } from "./found-facts";

describe("sourcesFor", () => {
  const ig = {
    source: "instagram_profile" as const,
    name: "Harbour Bean Café",
    about: "Coffee · Legaspi Village",
    website: null,
    phone: null,
    emails: [],
    hours: {},
    captions: ["Iced latte ₱180", "  "],
  };

  it("puts the profile first, then distinct captions", () => {
    expect(sourcesFor(ig, ["iced latte ₱180", "Cakes ₱1,200"])).toEqual([
      { source: "instagram_profile", text: "Harbour Bean Café. Coffee · Legaspi Village" },
      { source: "post_caption", text: "Iced latte ₱180" },
      { source: "post_caption", text: "Cakes ₱1,200" },
    ]);
  });

  it("works with captions only (no profile we can read)", () => {
    expect(sourcesFor(null, ["Cakes ₱1,200"])).toEqual([
      { source: "post_caption", text: "Cakes ₱1,200" },
    ]);
  });

  it("reads at most 30 captions", () => {
    const many = Array.from({ length: 50 }, (_, i) => `Post ${i}`);
    expect(sourcesFor(null, many)).toHaveLength(30);
  });
});
