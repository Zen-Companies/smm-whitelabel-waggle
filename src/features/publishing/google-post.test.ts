import { describe, expect, it } from "vitest";
import {
  businessPhone,
  googleDatesLabel,
  googleEnded,
  googlePlatformData,
  googleProblems,
  readyGoogleOptions,
  telUrl,
  withHttps,
  type GoogleOptions,
} from "./google-post";

const offer: GoogleOptions = {
  kind: "offer",
  title: "Christmas fruitcake, 20% off",
  startDay: "2026-12-01",
  endDay: "2026-12-24",
  coupon: "FRUIT20",
  redeemUrl: "harbourbakery.ph/order",
  terms: "Pre-orders only. One code per order.",
  button: "ORDER",
  buttonUrl: "https://harbourbakery.ph/order",
};

describe("googlePlatformData", () => {
  it("maps an offer to OFFER with its heading, dates, offer fields and button", () => {
    expect(googlePlatformData(offer, null)).toEqual({
      topicType: "OFFER",
      event: {
        title: "Christmas fruitcake, 20% off",
        schedule: {
          startDate: { year: 2026, month: 12, day: 1 },
          endDate: { year: 2026, month: 12, day: 24 },
        },
      },
      offer: {
        couponCode: "FRUIT20",
        redeemOnlineUrl: "https://harbourbakery.ph/order",
        termsConditions: "Pre-orders only. One code per order.",
      },
      callToAction: { type: "ORDER", url: "https://harbourbakery.ph/order" },
    });
  });

  it("maps an event with times to EVENT and leaves the offer out", () => {
    const d = googlePlatformData(
      {
        kind: "event",
        title: "Weekend sourdough class",
        startDay: "2026-11-28",
        startTime: "10:00",
        endDay: "2026-11-28",
        endTime: "13:00",
        coupon: "ignored",
        button: "SIGN_UP",
        buttonUrl: "harbourbakery.ph/class",
      },
      null,
    );
    expect(d).toEqual({
      topicType: "EVENT",
      event: {
        title: "Weekend sourdough class",
        schedule: {
          startDate: { year: 2026, month: 11, day: 28 },
          startTime: { hours: 10, minutes: 0 },
          endDate: { year: 2026, month: 11, day: 28 },
          endTime: { hours: 13, minutes: 0 },
        },
      },
      callToAction: { type: "SIGN_UP", url: "https://harbourbakery.ph/class" },
    });
  });

  it("an update sends no topicType, only the button", () => {
    expect(
      googlePlatformData({ kind: "update", button: "BOOK", buttonUrl: "https://x.ph/book" }, null),
    ).toEqual({ callToAction: { type: "BOOK", url: "https://x.ph/book" } });
    expect(googlePlatformData({ kind: "update" }, null)).toEqual({});
    expect(googlePlatformData(undefined, null)).toEqual({});
  });

  it("an offer with nothing filled still sends an empty offer (OFFER requires it)", () => {
    expect(googlePlatformData({ kind: "offer" }, null)).toEqual({ topicType: "OFFER", offer: {} });
  });

  it("Call now sends tel: with the business phone, and nothing without one", () => {
    expect(googlePlatformData({ kind: "update", button: "CALL" }, "+63 2 8555 0142")).toEqual({
      callToAction: { type: "CALL", url: "tel:+63285550142" },
    });
    expect(googlePlatformData({ kind: "update", button: "CALL" }, null)).toEqual({});
  });

  it("drops a button whose link isn't a web address", () => {
    expect(
      googlePlatformData({ kind: "update", button: "SHOP", buttonUrl: "not a link" }, null),
    ).toEqual({});
  });
});

describe("googleProblems", () => {
  it("is quiet for a complete offer", () => {
    expect(googleProblems(offer, null)).toEqual([]);
  });

  it("asks for an event's title and dates", () => {
    expect(googleProblems({ kind: "event" }, null).map((p) => p.field)).toEqual([
      "title",
      "start",
      "end",
    ]);
  });

  it("catches an end before the start, and a long title", () => {
    const p = googleProblems(
      { kind: "offer", title: "x".repeat(60), startDay: "2026-12-10", endDay: "2026-12-01" },
      null,
    );
    expect(p.map((x) => x.field)).toEqual(["title", "end"]);
    expect(p[0].message).toContain("Shorten it by 2");
  });

  it("an event ending later the same day is fine; earlier is not", () => {
    const base = { kind: "event", title: "Class", startDay: "2026-11-28", endDay: "2026-11-28" };
    expect(
      googleProblems({ ...base, startTime: "10:00", endTime: "13:00" } as GoogleOptions, null),
    ).toEqual([]);
    expect(
      googleProblems({ ...base, startTime: "13:00", endTime: "10:00" } as GoogleOptions, null)[0]
        ?.field,
    ).toBe("end");
  });

  it("a button needs its link; Call now needs the phone instead", () => {
    expect(googleProblems({ kind: "update", button: "BOOK" }, null)[0].message).toBe(
      "Add the link for Book.",
    );
    expect(googleProblems({ kind: "update", button: "CALL" }, "+63 2 8555 0142")).toEqual([]);
    expect(googleProblems({ kind: "update", button: "CALL" }, null)[0].field).toBe("button");
  });

  it("an http:// link is upgraded, a non-link is refused", () => {
    expect(
      googleProblems({ kind: "update", button: "BOOK", buttonUrl: "http://a.ph/b" }, null),
    ).toEqual([]);
    expect(
      googleProblems({ kind: "update", button: "BOOK", buttonUrl: "book here" }, null)[0].message,
    ).toBe("The link must start with https://");
  });
});

describe("helpers", () => {
  it("withHttps adds or upgrades the scheme", () => {
    expect(withHttps("a.ph/x")).toBe("https://a.ph/x");
    expect(withHttps("http://a.ph")).toBe("https://a.ph");
    expect(withHttps("https://a.ph")).toBe("https://a.ph");
  });

  it("telUrl keeps the plus and digits only", () => {
    expect(telUrl("(02) 8555-0142")).toBe("tel:0285550142");
    expect(telUrl("+1 415 555 0100")).toBe("tel:+14155550100");
    expect(telUrl("call us")).toBeNull();
  });

  it("businessPhone reads the Phone: line of a contact entry first", () => {
    expect(
      businessPhone([
        { title: "Opening hours", content: "Mon 7 to 9 +63 9 1234", found_kind: "hours" },
        {
          title: "Contact",
          content: "Website: https://h.ph\nPhone: +63 2 8555 0142",
          found_kind: "contact",
        },
      ]),
    ).toBe("+63 2 8555 0142");
    expect(
      businessPhone([{ title: "How to call us", content: "Ring 0917 555 0142 anytime" }]),
    ).toBe("0917 555 0142");
    expect(businessPhone([{ title: "Menu", content: "Ube 45" }])).toBeNull();
  });

  it("googleDatesLabel says the offer's days and the event's times", () => {
    expect(googleDatesLabel(offer)).toBe("Valid Dec 1 – Dec 24");
    expect(
      googleDatesLabel({
        kind: "event",
        startDay: "2026-11-28",
        startTime: "10:00",
        endDay: "2026-11-28",
        endTime: "13:00",
      }),
    ).toBe("Sat, Nov 28, 10:00 AM – 1:00 PM");
  });

  it("googleEnded only for an offer or event past its end", () => {
    expect(googleEnded(offer, "2026-12-25")).toBe(true);
    expect(googleEnded(offer, "2026-12-24")).toBe(false);
    expect(googleEnded({ kind: "update" }, "2027-01-01")).toBe(false);
  });
});

describe("readyGoogleOptions (composer and AI assistants alike)", () => {
  it("refuses what Google won't take, in the owner's words", () => {
    const r = readyGoogleOptions({ kind: "event", button: "CALL" }, null);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.problems.map((p) => p.field)).toEqual(["title", "start", "end", "button"]);
    }
  });

  it("Call now dials the business phone; other links get https://", () => {
    const call = readyGoogleOptions(
      { kind: "update", button: "CALL", buttonUrl: "x" },
      "+63 2 8555 0142",
    );
    expect(call).toEqual({
      ok: true,
      google: {
        kind: "update",
        button: "CALL",
        buttonUrl: "tel:+63285550142",
        redeemUrl: undefined,
      },
    });
    const r = readyGoogleOptions(offer, null);
    expect(r.ok && r.google.redeemUrl).toBe("https://harbourbakery.ph/order");
    expect(r.ok && r.google.buttonUrl).toBe("https://harbourbakery.ph/order");
  });
});
