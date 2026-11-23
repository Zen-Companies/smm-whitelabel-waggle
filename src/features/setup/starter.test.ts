import { describe, expect, it } from "vitest";
import {
  answerPairs,
  BUSINESS_KINDS,
  customKindFromProfile,
  doneLine,
  kindFromPlatformCategory,
  kindFromProfile,
  parseStep,
  profileText,
  stepDetail,
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
      "Waggle starts answering once you connect an account.",
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

  it("the end page says what Waggle knows, step by step", () => {
    const facts = {
      kind: "Dog grooming",
      description: "We groom dogs and cats in Cebu, by appointment, with pickup and drop-off.",
      accounts: ["Instagram"],
      answers: 3,
      triesStatus: "1 of 3",
      replyOnItsOwn: true,
    };
    expect(stepDetail("business", true, facts)).toBe(
      "Dog grooming · “We groom dogs and cats in Cebu, by appointment, with…”",
    );
    expect(stepDetail("connect", true, facts)).toBe("Instagram");
    expect(stepDetail("connect", false, facts)).toMatch(/^Not yet/);
    expect(stepDetail("answers", true, facts)).toBe("3 answers");
    expect(stepDetail("practice", false, facts)).toBe("1 of 3 tried");
    expect(stepDetail("replies", true, facts)).toBe("On its own, for questions your answers cover");
    expect(stepDetail("replies", false, facts)).toBe("Not chosen yet");
  });
});

describe("kindFromPlatformCategory (setup item G)", () => {
  it.each([
    ["Bakery", "food"],
    ["Coffee Shop", "food"],
    ["Café", "food"],
    ["Wine Bar", "food"],
    ["Plumbing Service", "services"],
    ["Auto Repair Shop", "services"],
    ["Electrician", "services"],
    ["Dentist & Dental Office", "health"],
    ["Medical Spa", "health"],
    ["Veterinarian", "health"],
    ["Hair Salon", "beauty"],
    ["Barber Shop", "beauty"],
    ["Nail Salon", "beauty"],
    ["Gym/Physical Fitness Center", "fitness"],
    ["Yoga Studio", "fitness"],
    ["Real Estate Agent", "realestate"],
    ["Property Management Company", "realestate"],
    ["Clothing Store", "shop"],
    ["Florist", "shop"],
  ])("%s → %s", (category, kind) => {
    expect(kindFromPlatformCategory(category)).toBe(kind);
  });

  it("gives null when unsure (setup asks the kind)", () => {
    // A photographer isn't a home or local trade, and no other kind fits.
    expect(kindFromPlatformCategory("Wedding Photographer")).toBeNull();
    expect(kindFromPlatformCategory("Local Business")).toBeNull();
    expect(kindFromPlatformCategory("Health/Beauty")).toBeNull();
    expect(kindFromPlatformCategory("Barbados Tours")).toBeNull();
    expect(kindFromPlatformCategory("")).toBeNull();
    expect(kindFromPlatformCategory(null)).toBeNull();
  });
});
