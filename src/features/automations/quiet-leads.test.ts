import { describe, expect, it } from "vitest";
import { followupDue, followupSteps, parseFollowupForm, type QuietLeadFacts } from "./quiet-leads";

const now = new Date("2026-11-18T12:00:00Z");
const h = (hours: number) => new Date(now.getTime() - hours * 60 * 60_000);
const lead = (over: Partial<QuietLeadFacts> = {}): QuietLeadFacts => ({
  platform: "instagram",
  stage: "talking",
  followedUpAt: null,
  lastCustomerAt: h(21),
  lastOursAt: h(20.5),
  hasContact: true,
  hasTemplate: false,
  ...over,
});

describe("followupDue", () => {
  it("a lead we answered who went quiet for the wait, inside Meta's window", () => {
    expect(followupDue(lead(), 20 * 60, now)).toBe(true);
  });
  it("not before the wait, nor past 24 hours on Instagram and Facebook", () => {
    expect(followupDue(lead({ lastCustomerAt: h(5), lastOursAt: h(4) }), 20 * 60, now)).toBe(false);
    expect(followupDue(lead({ lastCustomerAt: h(24), lastOursAt: h(23) }), 20 * 60, now)).toBe(
      false,
    );
  });
  it("not when they wrote last (it's our turn), once only, never booked or done", () => {
    expect(followupDue(lead({ lastOursAt: h(22) }), 20 * 60, now)).toBe(false);
    expect(followupDue(lead({ followedUpAt: h(1).toISOString() }), 20 * 60, now)).toBe(false);
    expect(followupDue(lead({ stage: "booked" }), 20 * 60, now)).toBe(false);
    expect(followupDue(lead({ stage: "done" }), 20 * 60, now)).toBe(false);
    expect(followupDue(lead({ stage: null }), 20 * 60, now)).toBe(true);
  });
  it("needs the person's Zernio contact, and a platform it can reach", () => {
    expect(followupDue(lead({ hasContact: false }), 20 * 60, now)).toBe(false);
    expect(followupDue(lead({ platform: "tiktok" }), 20 * 60, now)).toBe(false);
  });
  it("WhatsApp: only with a template, up to a week", () => {
    expect(
      followupDue(
        lead({ platform: "whatsapp", lastCustomerAt: h(30), lastOursAt: h(29) }),
        20 * 60,
        now,
      ),
    ).toBe(false);
    expect(
      followupDue(
        lead({ platform: "whatsapp", hasTemplate: true, lastCustomerAt: h(30), lastOursAt: h(29) }),
        20 * 60,
        now,
      ),
    ).toBe(true);
    expect(
      followupDue(
        lead({
          platform: "whatsapp",
          hasTemplate: true,
          lastCustomerAt: h(200),
          lastOursAt: h(199),
        }),
        20 * 60,
        now,
      ),
    ).toBe(false);
  });
});

describe("the follow-up's form and steps", () => {
  const form = (m: Record<string, string>) => (f: string) => m[f] ?? null;
  it("reads the card", () => {
    expect(
      parseFollowupForm(
        form({
          enabled: "on",
          waitHours: "20",
          message: "Hi {first name}, still keen?",
          template: "still_interested|en|1",
        }),
      ),
    ).toEqual({
      ok: true,
      value: {
        enabled: true,
        waitMinutes: 1200,
        message: "Hi {first name}, still keen?",
        whatsappTemplate: { name: "still_interested", language: "en", variables: 1 },
      },
    });
  });
  it("keeps the wait inside Meta's 24 hours, and needs a message", () => {
    expect(parseFollowupForm(form({ waitHours: "30", message: "x" }))).toMatchObject({
      ok: false,
      field: "waitHours",
    });
    expect(parseFollowupForm(form({ waitHours: "0", message: "x" }))).toMatchObject({
      ok: false,
      field: "waitHours",
    });
    expect(parseFollowupForm(form({ waitHours: "5", message: " " }))).toMatchObject({
      ok: false,
      field: "message",
    });
  });
  it("one step: the message (with {{first_name}}) or the WhatsApp template", () => {
    expect(
      followupSteps("instagram", { message: "Hi {First Name}!", whatsappTemplate: null }),
    ).toEqual([{ order: 1, delayMinutes: 1, message: { text: "Hi {{first_name}}!" } }]);
    expect(followupSteps("whatsapp", { message: "x", whatsappTemplate: null })).toBeNull();
    expect(
      followupSteps("whatsapp", {
        message: "x",
        whatsappTemplate: { name: "t", language: "en", variables: 1 },
      })?.[0],
    ).toMatchObject({
      template: { name: "t", language: "en", variableMapping: { "1": { field: "name" } } },
    });
  });
});
