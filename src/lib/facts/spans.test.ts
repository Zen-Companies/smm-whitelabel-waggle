import { describe, expect, it } from "vitest";
import { factSpans, factTokens, factUsed } from "./spans";

const fact = (title: string, content: string) => ({ title, content });

describe("factTokens", () => {
  it("finds amounts, times, phones, emails and links", () => {
    const tokens = factTokens(
      "Latte $4.50, cake 1,200 pesos. Open 9am to 5:30pm. Call 0917 555 0142 or hi@bean.ph, bean.ph/menu",
    ).map((t) => `${t.kind}:${t.norm}`);
    expect(tokens).toEqual(
      expect.arrayContaining([
        "number:4.5",
        "number:1200",
        "number:9am",
        "number:5:30pm",
        "phone:09175550142",
        "email:hi@bean.ph",
        "link:bean.ph/menu",
      ]),
    );
  });
  it("skips lone single digits (too common to mean anything)", () => {
    expect(factTokens("We have 3 tables and 2 chairs")).toEqual([]);
  });
});

describe("factSpans", () => {
  it("marks where the fact's numbers appear in the reply", () => {
    const reply = "Our latte is $4.50 and we open at 9am.";
    const spans = factSpans(reply, fact("Prices", "Latte: $4.50. Open 9am–5pm."));
    expect(spans.map((s) => s.text)).toEqual(["4.50", "9am"]);
    for (const s of spans) expect(reply.slice(s.start, s.end)).toBe(s.text);
  });
  it("matches amounts however the thousands are written", () => {
    expect(factSpans("It's 1200 pesos.", fact("Prices", "Cake: 1,200 pesos"))).toHaveLength(1);
  });
  it("does not match a number inside a bigger number", () => {
    expect(factSpans("Call 1450", fact("Prices", "Latte 45"))).toEqual([]);
  });
  it("matches a phone number written differently", () => {
    const spans = factSpans("Text us at +63 917 555 0142.", fact("Contact", "0917-555-0142"));
    expect(spans).toHaveLength(1);
    expect(spans[0].text).toBe("+63 917 555 0142");
  });
  it("matches emails and links case-insensitively", () => {
    const spans = factSpans(
      "Email HI@Bean.ph or see https://bean.ph/menu",
      fact("Contact", "hi@bean.ph · bean.ph/menu"),
    );
    expect(spans.map((s) => s.text)).toEqual(["HI@Bean.ph", "https://bean.ph/menu"]);
  });
  it("returns nothing when the reply doesn't use the fact", () => {
    expect(factSpans("Thanks for asking!", fact("Prices", "Latte $4.50"))).toEqual([]);
  });
});

describe("factUsed", () => {
  it("a fact with numbers is used when one of them is in the reply", () => {
    expect(factUsed("It's $4.50", fact("Prices", "Latte $4.50"))).toBe(true);
    expect(factUsed("Come by anytime", fact("Prices", "Latte $4.50"))).toBe(false);
  });
  it("a fact without numbers is used when most of its words are in the reply", () => {
    const f = fact("Do you deliver?", "Yes, we deliver within Makati through Grab and Lalamove.");
    expect(factUsed("Yes! We deliver within Makati via Grab or Lalamove.", f)).toBe(true);
    expect(factUsed("Please send us a DM.", f)).toBe(false);
  });
});
