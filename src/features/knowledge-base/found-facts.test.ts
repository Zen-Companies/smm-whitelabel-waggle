import { describe, expect, it } from "vitest";
import {
  directFacts,
  foundFactsOutputSchema,
  foundFactsUserPrompt,
  formatFacebookHours,
  keepNew,
  toFoundEntries,
  type FoundFactsOutput,
  type FoundSourceText,
} from "./found-facts";

const fbProfile = {
  source: "facebook_page" as const,
  name: null,
  about: "Specialty coffee. 12 Legaspi St, Makati.",
  website: "https://harbourbean.ph",
  phone: "+63 917 555 0142",
  emails: ["hi@harbourbean.ph"],
  hours: {
    mon_1_open: "08:00",
    mon_1_close: "12:00",
    mon_2_open: "13:00",
    mon_2_close: "17:00",
    sat_1_open: "09:00",
    sat_1_close: "15:00",
  },
  captions: [],
};

describe("formatFacebookHours", () => {
  it("lists the days in week order with each slot", () => {
    expect(formatFacebookHours(fbProfile.hours)).toBe(
      "Monday: 08:00–12:00, 13:00–17:00\nSaturday: 09:00–15:00",
    );
  });
  it("is null when the Page has no hours", () => {
    expect(formatFacebookHours({})).toBeNull();
  });
  it("ignores keys it doesn't understand", () => {
    expect(formatFacebookHours({ foo: "bar", tue_1_open: "10:00", tue_1_close: "18:00" })).toBe(
      "Tuesday: 10:00–18:00",
    );
  });
});

describe("directFacts (no AI: what the platform states)", () => {
  it("Facebook gives opening hours and contact", () => {
    expect(directFacts(fbProfile)).toEqual([
      {
        title: "Opening hours",
        content: "Monday: 08:00–12:00, 13:00–17:00\nSaturday: 09:00–15:00",
        kind: "hours",
        source: "facebook_page",
      },
      {
        title: "Contact",
        content:
          "Phone: +63 917 555 0142\nEmail: hi@harbourbean.ph\nWebsite: https://harbourbean.ph",
        kind: "contact",
        source: "facebook_page",
      },
    ]);
  });
  it("Instagram gives only the website", () => {
    expect(
      directFacts({
        ...fbProfile,
        source: "instagram_profile",
        phone: null,
        emails: [],
        hours: {},
      }),
    ).toEqual([
      {
        title: "Contact",
        content: "Website: https://harbourbean.ph",
        kind: "contact",
        source: "instagram_profile",
      },
    ]);
  });
  it("nothing without a profile", () => {
    expect(directFacts(null)).toEqual([]);
  });
});

const sources: FoundSourceText[] = [
  { source: "facebook_page", text: "Specialty coffee. 12 Legaspi St, Makati. Open daily." },
  {
    source: "post_caption",
    text: "New! Iced Spanish latte ₱180. Whole cakes ₱1,200, order 2 days ahead.",
  },
];

const output = (o: Partial<FoundFactsOutput>): FoundFactsOutput => ({
  prices: [],
  hours: null,
  address: null,
  contact: null,
  answers: [],
  ...o,
});

describe("toFoundEntries (AI output → business info)", () => {
  it("keeps facts whose quote is really in the cited source", () => {
    const entries = toFoundEntries(
      output({
        prices: [
          { item: "Iced Spanish latte", price: "₱180", from: 1, quote: "Iced Spanish latte ₱180" },
          { item: "Whole cake", price: "₱1,200", from: 1, quote: "Whole cakes ₱1,200" },
        ],
        address: { text: "12 Legaspi St, Makati", from: 0, quote: "12 Legaspi St, Makati" },
        answers: [
          {
            question: "How early should I order a cake?",
            answer: "Order whole cakes 2 days ahead.",
            from: 1,
            quote: "order 2 days ahead",
          },
        ],
      }),
      sources,
    );
    expect(entries).toEqual([
      {
        title: "Prices",
        content: "Iced Spanish latte: ₱180\nWhole cake: ₱1,200",
        kind: "price",
        source: "post_caption",
      },
      {
        title: "Address",
        content: "12 Legaspi St, Makati",
        kind: "address",
        source: "facebook_page",
      },
      {
        title: "How early should I order a cake?",
        content: "Order whole cakes 2 days ahead.",
        kind: "answer",
        source: "post_caption",
      },
    ]);
  });

  it("drops a fact the model made up (quote not in the source)", () => {
    expect(
      toFoundEntries(
        output({
          prices: [{ item: "Croissant", price: "₱95", from: 1, quote: "Croissant ₱95" }],
          hours: { text: "Open 24/7", from: 0, quote: "Open 24/7" },
        }),
        sources,
      ),
    ).toEqual([]);
  });

  it("drops a price whose amount isn't in its quote", () => {
    expect(
      toFoundEntries(
        output({
          prices: [
            { item: "Iced latte", price: "₱150", from: 1, quote: "Iced Spanish latte ₱180" },
          ],
        }),
        sources,
      ),
    ).toEqual([]);
  });

  it("drops facts citing a source that doesn't exist", () => {
    expect(
      toFoundEntries(output({ address: { text: "Makati", from: 7, quote: "Makati" } }), sources),
    ).toEqual([]);
  });

  it("matches quotes ignoring case and spacing", () => {
    expect(
      toFoundEntries(
        output({ hours: { text: "Open daily", from: 0, quote: "open   DAILY" } }),
        sources,
      ),
    ).toHaveLength(1);
  });

  it("the platform's own hours and contact win over the AI's", () => {
    const entries = toFoundEntries(
      output({ hours: { text: "Open daily", from: 0, quote: "Open daily." } }),
      sources,
      { hasHours: true, hasContact: false },
    );
    expect(entries).toEqual([]);
  });
});

describe("keepNew (never over the owner's own info)", () => {
  const found = [
    {
      title: "Opening hours",
      content: "x",
      kind: "hours" as const,
      source: "facebook_page" as const,
    },
    { title: "Prices", content: "x", kind: "price" as const, source: "post_caption" as const },
    {
      title: "Do you deliver?",
      content: "x",
      kind: "answer" as const,
      source: "post_caption" as const,
    },
    { title: "Address", content: "x", kind: "address" as const, source: "facebook_page" as const },
  ];
  it("skips a title the business info already has", () => {
    expect(keepNew(found, ["do you deliver?"]).map((e) => e.title)).toEqual([
      "Opening hours",
      "Prices",
      "Address",
    ]);
  });
  it("skips hours, prices, address or contact the owner already wrote under their own title", () => {
    expect(
      keepNew(found, ["When are you open?", "Our menu and rates", "Where to find us"]).map(
        (e) => e.title,
      ),
    ).toEqual(["Do you deliver?"]);
  });
  it("never adds the same title twice", () => {
    expect(keepNew([...found, found[0]], [])).toHaveLength(4);
  });
});

describe("the AI call's input and output", () => {
  it("numbers the sources and marks them as data", () => {
    const prompt = foundFactsUserPrompt(sources);
    expect(prompt).toContain("[0] (Facebook Page info)");
    expect(prompt).toContain("[1] (post caption)");
    expect(prompt).toContain("<message>");
  });
  it("validates the model's answer", () => {
    expect(foundFactsOutputSchema.safeParse(output({})).success).toBe(true);
    expect(
      foundFactsOutputSchema.safeParse({ ...output({}), prices: [{ item: "x" }] }).success,
    ).toBe(false);
  });
});
