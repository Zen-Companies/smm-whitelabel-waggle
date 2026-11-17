import { describe, expect, it } from "vitest";
import { parseRegistration } from "./registration";

const form = (v: Record<string, string>) => {
  const f = new FormData();
  for (const [k, val] of Object.entries(v)) f.set(k, val);
  return f;
};

const company = {
  kind: "company",
  companyName: "Harbour Bean LLC",
  displayName: "Harbour Bean",
  ein: "12-3456789",
  entityType: "PRIVATE_PROFIT",
  businessPhone: "+1 (415) 555-0199",
  website: "https://harbourbean.com",
  street: "123 Market St",
  city: "San Francisco",
  state: "ca",
  postalCode: "94105",
  vertical: "HOSPITALITY",
  usecase: "CUSTOMER_CARE",
  optInPage: "https://harbourbean.com/text-us",
  sample1: "Harbour Bean: your table for 4 is ready at 7pm. Reply STOP to opt out.",
  sample2: "Harbour Bean: thanks for your order! Reply HELP for help.",
};

describe("parseRegistration", () => {
  it("a company: brand and campaign in the carriers' shape, for this number only", () => {
    const r = parseRegistration(form(company), "+14155550142");
    expect(r).toEqual({
      ok: true,
      kind: "company",
      body: {
        registrationType: "standard_10dlc",
        phoneNumbers: ["+14155550142"],
        brand: {
          entityType: "PRIVATE_PROFIT",
          displayName: "Harbour Bean",
          companyName: "Harbour Bean LLC",
          ein: "12-3456789",
          phone: "+14155550199",
          street: "123 Market St",
          city: "San Francisco",
          state: "CA",
          postalCode: "94105",
          country: "US",
          website: "https://harbourbean.com",
          vertical: "HOSPITALITY",
        },
        campaign: {
          usecase: "CUSTOMER_CARE",
          description:
            "Harbour Bean answers customers who text its number: questions, bookings and orders.",
          messageFlow:
            "Customers text Harbour Bean first, or opt in on https://harbourbean.com/text-us. Replies only go to people who texted or opted in.",
          sample1: company.sample1,
          sample2: company.sample2,
          optinKeywords: "START",
          optoutKeywords: "STOP",
          helpKeywords: "HELP",
        },
      },
    });
  });

  it("a sole proprietor: no EIN, the owner's mobile gets a code", () => {
    const r = parseRegistration(
      form({ ...company, kind: "sole", ein: "", companyName: "", mobilePhone: "+14155550123" }),
      "+14155550142",
    );
    expect(r).toMatchObject({
      ok: true,
      kind: "sole",
      body: {
        registrationType: "sole_prop_10dlc",
        brand: { entityType: "SOLE_PROPRIETOR", mobilePhone: "+14155550123" },
      },
    });
    expect(
      (r as unknown as { body: { brand: Record<string, unknown> } }).body.brand.ein,
    ).toBeUndefined();
  });

  it("refuses what carriers reject", () => {
    const bad = (over: Record<string, string>) =>
      parseRegistration(form({ ...company, ...over }), "+14155550142");
    expect(bad({ ein: "123" })).toMatchObject({ ok: false, field: "ein" });
    expect(bad({ website: "harbourbean" })).toMatchObject({ ok: false, field: "website" });
    expect(bad({ state: "California" })).toMatchObject({ ok: false, field: "state" });
    expect(bad({ postalCode: "9410" })).toMatchObject({ ok: false, field: "postalCode" });
    expect(bad({ sample1: "Hi" })).toMatchObject({ ok: false, field: "sample1" });
    expect(bad({ sample2: company.sample1 })).toMatchObject({ ok: false, field: "sample2" });
    expect(bad({ optInPage: "nope" })).toMatchObject({ ok: false, field: "optInPage" });
    expect(bad({ kind: "sole", ein: "", mobilePhone: "" })).toMatchObject({
      ok: false,
      field: "mobilePhone",
    });
  });
});
