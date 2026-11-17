import { describe, expect, it } from "vitest";
import type { RcsAgentView } from "@/lib/social/types";
import {
  checkImage,
  contrastOnWhite,
  currentAgent,
  filedDefaults,
  parseRcsRequest,
  rcsSteps,
  upfrontCents,
} from "./rcs";

const form = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

const base = {
  legalName: "Harbour Bean LLC",
  legalEntityType: "LIMITED_LIABILITY_COMPANY",
  organizationType: "PRIVATE_PROFIT",
  country: "US",
  taxId: "123456789",
  websiteUrl: "https://www.harbourbean.com",
  line1: "12 Pier Rd",
  city: "San Francisco",
  state: "ca",
  postalCode: "94105",
  firstName: "Dana",
  lastName: "Reyes",
  contactEmail: "dana@harbourbean.com",
  contactPhone: "+1 (415) 555-0142",
  displayName: "Harbour Bean",
  description: "Order updates and offers from Harbour Bean Café.",
  useCase: "MULTI_USE",
  brandColor: "#1a73e8",
  privacyPolicyUrl: "https://harbourbean.com/privacy",
  termsUrl: "https://harbourbean.com/terms",
  buttonPhone: "+14155550142",
};

describe("parseRcsRequest (T83a)", () => {
  it("builds the brand and the public profile", () => {
    const r = parseRcsRequest(form(base));
    expect(r).toMatchObject({
      ok: true,
      value: {
        displayName: "Harbour Bean",
        useCase: "MULTI_USE",
        brand: {
          legalName: "Harbour Bean LLC",
          taxId: "12-3456789",
          address: { state: "CA", country: "US", postalCode: "94105" },
          contact: { email: "dana@harbourbean.com", phone: "+14155550142" },
        },
        profile: {
          brandColor: "#1A73E8",
          phone: { number: "+14155550142", label: "Call us" },
          website: { url: "https://www.harbourbean.com", label: "Website" },
        },
      },
    });
  });

  it("refuses free-mail, shared inboxes and other domains for the contact", () => {
    for (const contactEmail of ["dana@gmail.com", "info@harbourbean.com", "dana@otherbrand.com"]) {
      expect(parseRcsRequest(form({ ...base, contactEmail }))).toMatchObject({
        ok: false,
        field: "contactEmail",
      });
    }
    expect(
      parseRcsRequest(form({ ...base, contactEmail: "dana@mail.harbourbean.com" })),
    ).toMatchObject({
      ok: true,
    });
  });

  it("needs a phone or an email button, and a readable color", () => {
    expect(parseRcsRequest(form({ ...base, buttonPhone: "" }))).toMatchObject({
      field: "buttonPhone",
    });
    expect(
      parseRcsRequest(form({ ...base, buttonPhone: "", buttonEmail: "hi@harbourbean.com" })),
    ).toMatchObject({ ok: true, value: { profile: { email: { address: "hi@harbourbean.com" } } } });
    expect(parseRcsRequest(form({ ...base, brandColor: "#FFD966" }))).toMatchObject({
      field: "brandColor",
    });
  });

  it("outside the US: any tax number, no state", () => {
    const r = parseRcsRequest(
      form({ ...base, country: "GB", taxId: "GB123456789", state: "", postalCode: "EC1A 1BB" }),
    );
    expect(r).toMatchObject({ ok: true, value: { brand: { taxId: "GB123456789" } } });
    if (r.ok) expect(r.value.brand.address).not.toHaveProperty("state");
  });

  it("public companies need a stock symbol; names have limits", () => {
    expect(parseRcsRequest(form({ ...base, organizationType: "PUBLIC_PROFIT" }))).toMatchObject({
      field: "stockSymbol",
    });
    expect(parseRcsRequest(form({ ...base, displayName: "x".repeat(41) }))).toMatchObject({
      field: "displayName",
    });
    expect(parseRcsRequest(form({ ...base, taxId: "1234" }))).toMatchObject({ field: "taxId" });
  });
});

describe("rcs steps and money", () => {
  it("US agents show six steps, others four", () => {
    expect(rcsSteps("US", "agent_review").map((s) => s.state)).toEqual([
      "done",
      "done",
      "now",
      "next",
      "next",
      "next",
    ]);
    expect(rcsSteps("US", "changes_requested")[0].state).toBe("now");
    expect(rcsSteps("GB", "launching").map((s) => s.label)).toEqual([
      "Request sent",
      "Business check",
      "Carrier review",
      "Live",
    ]);
    expect(rcsSteps("GB", "live").every((s) => s.state === "done")).toBe(true);
  });

  it("matches the docs' upfront amounts", () => {
    expect(upfrontCents("US")).toBe(106_000);
    expect(upfrontCents("GB")).toBe(22_500);
  });

  it("contrast against white", () => {
    expect(contrastOnWhite("#000000")).toBeCloseTo(21, 0);
    expect(contrastOnWhite("#FFFFFF")).toBeCloseTo(1, 1);
    expect(contrastOnWhite("#1A73E8")).toBeGreaterThan(4.5);
  });

  it("shows the open agent before a closed one", () => {
    const a = (id: string, status: RcsAgentView["status"]) =>
      ({ id, status }) as unknown as RcsAgentView;
    expect(currentAgent([a("1", "rejected"), a("2", "testing")])?.id).toBe("2");
    expect(currentAgent([a("1", "rejected")])?.id).toBe("1");
    expect(currentAgent([])).toBeNull();
  });

  it("checks uploaded images", () => {
    expect(checkImage(null)).toBeNull();
    expect(checkImage(new File([], "x.png", { type: "image/png" }))).toBeNull();
    expect(checkImage(new File(["x"], "x.gif", { type: "image/gif" }))).toBe("bad");
    expect(checkImage(new File(["x"], "x.png", { type: "image/png" }))).toBeInstanceOf(File);
  });
});

describe("filedDefaults", () => {
  it("round-trips a filed request into the form", () => {
    const r = parseRcsRequest(form(base));
    if (!r.ok) throw new Error("expected ok");
    const agent = {
      id: "a1",
      status: "changes_requested",
      country: "US",
      displayName: r.value.displayName,
      useCase: r.value.useCase,
      accountId: null,
      reviewNote: "Fix the EIN",
      declineReason: null,
      launchSent: false,
      testDevices: [],
      filed: { brand: r.value.brand, profile: r.value.profile },
    } satisfies RcsAgentView;
    const again = parseRcsRequest(form(filedDefaults(agent)));
    expect(again).toEqual(r);
  });
});
