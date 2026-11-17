import { describe, expect, it } from "vitest";
import {
  answerPairs,
  BUSINESS_KINDS,
  customKindFromProfile,
  doneLine,
  kindFromProfile,
  parseStep,
  profileText,
} from "./starter";

describe("first-time setup (T73b)", () => {
  it("reads the step", () => {
    expect(parseStep("3")).toBe(3);
    expect(parseStep("6")).toBe(6);
    expect(parseStep("9")).toBeNull();
    expect(parseStep(undefined)).toBeNull();
  });

  it("every kind offers three questions, opening hours first", () => {
    for (const k of BUSINESS_KINDS) {
      expect(k.questions).toHaveLength(3);
      expect(k.questions[0]).toBe("When are you open?");
    }
  });

  it("writes the description with the kind first, and reads the kind back", () => {
    const text = profileText(
      "realestate",
      "We help families buy and sell homes on the Gulf.",
      1000,
    );
    expect(text).toBe("Real estate.\nWe help families buy and sell homes on the Gulf.");
    expect(kindFromProfile(text)?.key).toBe("realestate");
    expect(profileText("nope", "Just words", 1000)).toBe("Just words");
    expect(profileText("shop", "x".repeat(2000), 50)).toHaveLength(50);
  });

  it("says what happens next", () => {
    expect(
      doneLine({ accounts: ["Instagram", "Facebook"], answers: 3, replyOnItsOwn: false }),
    ).toBe(
      "Waggle is watching Instagram and Facebook. The next time someone asks one of your 3 questions, a reply will be waiting for your OK.",
    );
    expect(doneLine({ accounts: [], answers: 1, replyOnItsOwn: true })).toBe(
      "Connect an account in Settings so Waggle can start. The next time someone asks your question, Waggle answers on its own.",
    );
  });

  it("Something else keeps what kind, in a few words (approved 17 Nov)", () => {
    const text = profileText("other", "We groom dogs and cats in Cebu.", 1000, "  Dog grooming. ");
    expect(text).toBe("Something else: Dog grooming.\nWe groom dogs and cats in Cebu.");
    expect(kindFromProfile(text)?.key).toBe("other");
    expect(customKindFromProfile(text)).toBe("Dog grooming");
    expect(profileText("other", "Words", 1000)).toBe("Something else.\nWords");
    expect(customKindFromProfile("Something else.\nWords")).toBe("");
    expect(profileText("shop", "Words", 1000, "ignored")).toBe("Shop.\nWords");
  });

  it("every kind has more questions people ask, none repeating its three", () => {
    for (const k of BUSINESS_KINDS) {
      expect(k.more.length).toBeGreaterThanOrEqual(3);
      for (const q of k.more) expect(k.questions).not.toContain(q);
    }
  });

  it("takes step 3's own questions, dropping blanks and repeats", () => {
    expect(
      answerPairs(
        ["When are you open?", " Do you groom  cats? ", "", "when are you open?", "Unanswered"],
        ["9 to 6", "Yes", "orphan", "again", " "],
      ),
    ).toEqual([
      { question: "When are you open?", answer: "9 to 6" },
      { question: "Do you groom cats?", answer: "Yes" },
    ]);
    const many = Array.from({ length: 12 }, (_, i) => `Q${i}`);
    expect(answerPairs(many, many)).toHaveLength(8);
  });
});
