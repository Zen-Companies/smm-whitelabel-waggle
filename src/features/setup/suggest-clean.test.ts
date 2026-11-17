import { describe, expect, it } from "vitest";
import { cleanQuestions } from "./suggest-clean";

describe("suggested questions for Something else", () => {
  it("tidies what the model wrote", () => {
    expect(
      cleanQuestions([
        "1. Do you groom cats?",
        "- How much is a full groom",
        "“Do you pick up?”",
        "do you groom cats?",
        "  ",
        "x".repeat(300),
      ]),
    ).toEqual(["Do you groom cats?", "How much is a full groom?", "Do you pick up?"]);
  });

  it("keeps at most six", () => {
    expect(cleanQuestions(Array.from({ length: 9 }, (_, i) => `Q${i}?`))).toHaveLength(6);
  });
});
