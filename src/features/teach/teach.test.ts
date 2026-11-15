import { describe, expect, it } from "vitest";
import { unansweredQuestions } from "./teach";

describe("Teach Waggle (T73)", () => {
  it("drops questions the owner already answered here", () => {
    const qs = [
      { text: "Do buyers pay you anything?", times: 3 },
      { text: "Are pets OK at 412 Harbor Dr?", times: 1 },
    ];
    expect(
      unansweredQuestions(qs, [{ title: "do buyers pay you anything" }, { title: "Parking" }]),
    ).toEqual([{ text: "Are pets OK at 412 Harbor Dr?", times: 1 }]);
  });

  it("matches a long question whose title was shortened", () => {
    const long = "Can I bring my two dogs to the open house on Saturday afternoon please?";
    expect(
      unansweredQuestions([{ text: long }], [{ title: "Can I bring my two dogs to the open…" }]),
    ).toEqual([]);
  });
});
