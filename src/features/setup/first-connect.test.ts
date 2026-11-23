import { describe, expect, it } from "vitest";
import {
  aboutLine,
  askedLabel,
  combineItemAnswers,
  commonForLabel,
  connectProblem,
  isInAppBrowser,
  kindQuestions,
  questionSeeds,
} from "./first-connect";

describe("isInAppBrowser", () => {
  it("spots Instagram's browser", () => {
    expect(
      isInAppBrowser(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 300.0.0.0 (iPhone14,5; iOS 17_0; en_US)",
      ),
    ).toBe("Instagram");
  });
  it("spots Facebook's browser by any of its markers", () => {
    expect(isInAppBrowser("Mozilla/5.0 (iPhone) Mobile/15E148 [FBAN/FBIOS;FBAV/440.0]")).toBe(
      "Facebook",
    );
    expect(
      isInAppBrowser("Mozilla/5.0 (Linux; Android 14) Chrome/120 [FB_IAB/FB4A;FBAV/440]"),
    ).toBe("Facebook");
    expect(isInAppBrowser("Mozilla/5.0 FBIOS")).toBe("Facebook");
  });
  it("leaves normal browsers alone", () => {
    expect(
      isInAppBrowser(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1",
      ),
    ).toBeNull();
    expect(isInAppBrowser("Mozilla/5.0 (Windows NT 10.0) Chrome/120 Safari/537.36")).toBeNull();
    expect(isInAppBrowser(null)).toBeNull();
    expect(isInAppBrowser("")).toBeNull();
  });
});

describe("connectProblem", () => {
  it("is nothing without an error", () => {
    expect(connectProblem({ step: "2", connecting: "instagram" }, null)).toBeNull();
  });
  it("is the personal account fix for any failed Instagram connect", () => {
    expect(
      connectProblem(
        { connecting: "instagram", error: "access_denied", platform: "instagram" },
        "x",
      ),
    ).toEqual({ kind: "instagram-personal" });
    expect(connectProblem({ connecting: "instagram", error: "whatever" }, "x")).toEqual({
      kind: "instagram-personal",
    });
  });
  it("is a cancelled sign-in when the owner declined (23 Nov)", () => {
    expect(
      connectProblem({ connecting: "facebook", error: "oauth_denied", platform: "facebook" }, "x"),
    ).toEqual({ kind: "cancelled", platform: "facebook" });
    expect(
      connectProblem(
        {
          connecting: "instagram",
          error: "oauth_denied",
          platform: "instagram",
          platform_error: "access_denied",
        },
        "x",
      ),
    ).toEqual({ kind: "cancelled", platform: "instagram" });
    // A bare oauth_denied on Instagram keeps the likely cause, a personal account.
    expect(
      connectProblem(
        { connecting: "instagram", error: "oauth_denied", platform: "instagram" },
        "x",
      ),
    ).toEqual({ kind: "instagram-personal" });
  });
  it("is the Solo card when Free's accounts are used (23 Nov)", () => {
    expect(connectProblem({ connect_error: "free_full", platform: "tiktok" }, "x")).toEqual({
      kind: "free-full",
    });
  });
  it("is not a failure when the code was already redeemed", () => {
    expect(
      connectProblem({ connecting: "instagram", error: "code_already_redeemed" }, "x"),
    ).toBeNull();
  });
  it("uses the banner's words otherwise", () => {
    expect(
      connectProblem({ connecting: "facebook", error: "denied" }, "Couldn't connect Facebook."),
    ).toEqual({ kind: "message", text: "Couldn't connect Facebook." });
    expect(connectProblem({ connect_error: "expired" }, "That link expired.")).toEqual({
      kind: "message",
      text: "That link expired.",
    });
  });
});

describe("commonForLabel", () => {
  it("names the business type", () => {
    expect(commonForLabel("food", "")).toBe("Common for cafés");
    expect(commonForLabel("other", "Dog grooming")).toBe("Common for dog grooming");
    expect(commonForLabel("other", "")).toBe("Common questions");
    expect(commonForLabel(null, "")).toBe("Common questions");
  });
});

describe("questionSeeds", () => {
  const top = [
    { question: "Are you open on Sunday?", count: 9, items: [], unsure: 0 },
    {
      question: "How much is it?",
      count: 14,
      items: [
        { item: "Winter menu box", count: 6 },
        { item: "Oat latte", count: 5 },
        { item: " ", count: 1 },
      ],
      unsure: 2,
    },
    { question: "Do you take walk-ins?", count: 6, items: [], unsure: 0 },
  ];

  it("puts the customers' own questions first, most asked first", () => {
    const seeds = questionSeeds(top, kindQuestions("food"), "Common for cafés");
    expect(seeds.map((s) => s.question)).toEqual([
      "How much is it?",
      "Are you open on Sunday?",
      "Do you take walk-ins?",
    ]);
    expect(seeds[0]).toMatchObject({ asked: 14, tag: "14 people asked", unsure: 2 });
    expect(seeds[0].items).toHaveLength(2);
  });

  it("fills up to 3 from the business type when fewer came in", () => {
    const seeds = questionSeeds(
      [{ question: "When are you open?", count: 1, items: [], unsure: 0 }],
      kindQuestions("food"),
      "Common for cafés",
    );
    expect(seeds.map((s) => [s.question, s.tag])).toEqual([
      ["When are you open?", "1 person asked"],
      ["Do you take reservations?", "Common for cafés"],
      ["Do you deliver?", "Common for cafés"],
    ]);
  });

  it("is the business type's three when none came in", () => {
    expect(questionSeeds([], kindQuestions("beauty"), "Common for salons")).toHaveLength(3);
  });
});

describe("item answers", () => {
  it("reads like the board", () => {
    expect(
      aboutLine(
        [
          { item: "Winter menu box", count: 6 },
          { item: "Oat latte", count: 5 },
          { item: "Birthday cake", count: 3 },
        ],
        2,
      ),
    ).toBe("About: Winter menu box (6) · Oat latte (5) · Birthday cake (3) · not sure which (2)");
    expect(aboutLine([], 0)).toBe("");
    expect(askedLabel(1)).toBe("1 person asked");
  });

  it("combines answered items into one price list", () => {
    expect(
      combineItemAnswers([
        { item: "Winter menu box", answer: "$28, serves 2" },
        { item: "Oat latte", answer: "  " },
        { item: "Birthday cake", answer: "from $45,\n order 2 days ahead" },
      ]),
    ).toBe("Winter menu box: $28, serves 2\nBirthday cake: from $45, order 2 days ahead");
    expect(combineItemAnswers([{ item: "Oat latte", answer: "" }])).toBe("");
  });
});
