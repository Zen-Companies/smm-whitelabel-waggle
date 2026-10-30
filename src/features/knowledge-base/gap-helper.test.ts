import { describe, expect, it } from "vitest";
import { BLANK, cleanSuggestions, hasBlanks } from "./gap-helper";

const ctx = { questionIds: ["q1", "q2", "q3"], existingTitles: ["Opening hours"] };

describe("cleanSuggestions (T33)", () => {
  it("keeps real questions, new titles and wording with blanks", () => {
    expect(
      cleanSuggestions(
        {
          suggestions: [
            {
              title: " Parking ",
              questionIds: ["q1", "q2", "q2"],
              wording: `Parking is ${BLANK}.`,
            },
          ],
        },
        ctx,
      ),
    ).toEqual([{ title: "Parking", content: `Parking is ${BLANK}.`, itemIds: ["q1", "q2"] }]);
  });

  it("never lets a fact through: a price, number or answer without blanks becomes a blank", () => {
    const [a, b, c] = cleanSuggestions(
      {
        suggestions: [
          {
            title: "Parking",
            questionIds: ["q1"],
            wording: `Free parking for ${BLANK} hours, ₱50 after.`,
          },
          { title: "Gift cards", questionIds: ["q2"], wording: "Yes, we sell gift cards!" },
          { title: "Pets", questionIds: ["q3"], wording: `Open until 9pm, ${BLANK}.` },
        ],
      },
      ctx,
    );
    expect([a.content, b.content, c.content]).toEqual([BLANK, BLANK, BLANK]);
  });

  it("drops made-up question ids, existing or repeated titles, and questions used twice", () => {
    expect(
      cleanSuggestions(
        {
          suggestions: [
            { title: "opening hours", questionIds: ["q1"], wording: BLANK },
            { title: "Parking", questionIds: ["nope"], wording: BLANK },
            { title: "Wifi", questionIds: ["q1"], wording: BLANK },
            { title: "WIFI", questionIds: ["q2"], wording: BLANK },
            { title: "Pets", questionIds: ["q1"], wording: BLANK },
          ],
        },
        ctx,
      ).map((s) => s.title),
    ).toEqual(["Wifi"]);
  });

  it("a topic still has blanks until the owner fills them in", () => {
    expect(hasBlanks(`Parking is ${BLANK}.`)).toBe(true);
    expect(hasBlanks("Street parking on Harbour St.")).toBe(false);
  });
});
