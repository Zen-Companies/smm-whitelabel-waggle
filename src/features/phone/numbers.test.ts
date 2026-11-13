import { describe, expect, it } from "vitest";
import { displayNumber, monthly, numberOptions, parsePurchase } from "./numbers";

const type = (over: Record<string, unknown>) => ({
  numberType: "local" as const,
  monthlyCents: 300,
  needsKyc: false,
  callsAvailable: true,
  smsAvailable: true,
  inStock: true,
  instant: true,
  ...over,
});

describe("numberOptions", () => {
  it("keeps only numbers with calls, in stock, at once and without an ID check; US first", () => {
    const options = numberOptions([
      {
        code: "GB",
        types: [type({ needsKyc: true }), type({ numberType: "toll_free", smsAvailable: false })],
      },
      {
        code: "US",
        types: [
          type({}),
          type({ numberType: "toll_free" }),
          type({ numberType: "mobile", inStock: false }),
        ],
      },
      { code: "CA", types: [type({ instant: false })] },
    ]);
    expect(options).toEqual([
      { country: "US", numberType: "local", monthlyCents: 300, sms: true },
      { country: "US", numberType: "toll_free", monthlyCents: 300, sms: true },
      { country: "GB", numberType: "toll_free", monthlyCents: 300, sms: false },
    ]);
  });
});

describe("display helpers", () => {
  it("formats prices and North American numbers", () => {
    expect(monthly(300)).toBe("$3/month");
    expect(monthly(1250)).toBe("$12.50/month");
    expect(displayNumber("+14155550142")).toBe("(415) 555-0142");
    expect(displayNumber("+442071234567")).toBe("+442071234567");
  });
});

describe("parsePurchase", () => {
  const options = [{ country: "US", numberType: "local" as const, monthlyCents: 300, sms: true }];
  const form = (v: Record<string, string>) => {
    const f = new FormData();
    for (const [k, val] of Object.entries(v)) f.set(k, val);
    return f;
  };
  const ok = {
    country: "US",
    numberType: "local",
    phoneNumber: "+14155550142",
    purchaseIntentId: "0b6f4e0a-3c1d-4a8e-9f2b-7d5c1e2a3b4c",
  };

  it("takes an offered option, an E.164 number and the purchase key", () => {
    expect(parsePurchase(form(ok), options)).toEqual({
      ok: true,
      value: {
        option: options[0],
        phoneNumber: "+14155550142",
        purchaseIntentId: ok.purchaseIntentId,
      },
    });
  });

  it("refuses anything else", () => {
    expect(parsePurchase(form({ ...ok, country: "GB" }), options).ok).toBe(false);
    expect(parsePurchase(form({ ...ok, phoneNumber: "415" }), options).ok).toBe(false);
    expect(parsePurchase(form({ ...ok, purchaseIntentId: "x" }), options).ok).toBe(false);
  });
});
