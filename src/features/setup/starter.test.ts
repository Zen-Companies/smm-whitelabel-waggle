import { describe, expect, it } from "vitest";
import { BUSINESS_KINDS, doneLine, kindFromProfile, parseStep, profileText } from "./starter";

describe("first-time setup (T73b)", () => {
  it("reads the step", () => {
    expect(parseStep("3")).toBe(3);
    expect(parseStep("5")).toBe(5);
    expect(parseStep("9")).toBe(1);
    expect(parseStep(undefined)).toBe(1);
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
});
