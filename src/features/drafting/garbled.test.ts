import { describe, expect, it } from "vitest";
import { GARBLED_DRAFT_REASON } from "@/lib/draft-leak";
import { garbledToOwner } from "./generate";

describe("garbledToOwner (hotfix 26 Nov)", () => {
  it("cleans a leaked reply and hands it to the owner", () => {
    const out = garbledToOwner({
      reply: "We open at 9. needsHuman: false reason: null lead: null}{",
      needsHuman: false,
    });
    expect(out.reply).toBe("We open at 9.");
    expect(out.needsHuman).toBe(true);
    expect(out.reason).toBe(GARBLED_DRAFT_REASON);
  });

  it("keeps the model's own reason after the note", () => {
    const out = garbledToOwner({
      reply: '{"reply":"We open at 9.","needsHuman":true}',
      needsHuman: true,
      reason: "not covered",
    });
    expect(out).toMatchObject({
      reply: "We open at 9.",
      needsHuman: true,
      reason: `${GARBLED_DRAFT_REASON}; not covered`,
    });
  });

  it("leaves a clean draft as it is", () => {
    const draft = { reply: "The reason: we close at 5.", needsHuman: false };
    expect(garbledToOwner(draft)).toBe(draft);
  });
});
