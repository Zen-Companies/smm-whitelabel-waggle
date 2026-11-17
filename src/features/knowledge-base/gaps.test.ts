import { describe, expect, it } from "vitest";
import { groupGaps } from "./gaps";

describe("questions the answers don't cover (T71, T73)", () => {
  it("groups the same unanswered question, most asked first", () => {
    expect(
      groupGaps([
        { text: "Are pets OK?" },
        { text: "Do buyers pay you anything?" },
        { text: "do buyers pay you anything" },
        { text: "Do buyers pay you anything?!" },
        { text: "VA loans?" },
        { text: "Parking?" },
      ]),
    ).toEqual([
      { text: "Do buyers pay you anything?", times: 3 },
      { text: "Are pets OK?", times: 1 },
      { text: "VA loans?", times: 1 },
    ]);
  });
});
