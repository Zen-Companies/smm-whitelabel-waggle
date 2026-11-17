import { describe, expect, it } from "vitest";
import { CONSENT_KEY, leadConsented, leadContact, parseLeadForm, toLeadFormBody } from "./lead-form";

const form = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

describe("lead forms", () => {
  it("reads the builder: standard questions, own questions, privacy link", () => {
    const r = parseLeadForm(
      form({
        name: "Catering inquiry",
        accountId: "acc_fb",
        q_FULL_NAME: "yes",
        q_EMAIL: "yes",
        q_PHONE: "yes",
        custom: "How many people?\nWhich date?\n\n",
        privacyPolicyUrl: "https://harbourbean.ph/privacy",
        thankYou: "Thanks! We'll message you today.",
        verifyPhone: "yes",
      }),
    );
    expect(r).toMatchObject({
      ok: true,
      value: {
        name: "Catering inquiry",
        questions: ["FULL_NAME", "EMAIL", "PHONE"],
        custom: ["How many people?", "Which date?"],
        verifyPhone: true,
      },
    });
  });

  it("needs a name, a https privacy link and a way to reach the person", () => {
    expect(parseLeadForm(form({ name: "", accountId: "a", privacyPolicyUrl: "https://x.ph/p", q_EMAIL: "yes" }))).toMatchObject({ ok: false, field: "name" });
    expect(parseLeadForm(form({ name: "x", accountId: "a", privacyPolicyUrl: "x.ph/p", q_EMAIL: "yes" }))).toMatchObject({ ok: false, field: "privacyPolicyUrl" });
    expect(parseLeadForm(form({ name: "x", accountId: "a", privacyPolicyUrl: "https://x.ph/p", q_FULL_NAME: "yes" }))).toMatchObject({ ok: false, field: "questions" });
  });

  it("always adds an optional, unticked consent box for messages", () => {
    const body = toLeadFormBody(
      {
        name: "Catering",
        accountId: "acc_fb",
        questions: ["FULL_NAME", "PHONE"],
        custom: ["How many people?"],
        privacyPolicyUrl: "https://x.ph/p",
        thankYou: "Thanks!",
        verifyPhone: false,
      },
      "Harbour Bean",
    );
    expect(body.platformSpecificData.questions).toEqual([
      { type: "FULL_NAME" },
      { type: "PHONE" },
      { type: "CUSTOM", key: "q1", label: "How many people?" },
    ]);
    expect(body.platformSpecificData.customDisclaimer.checkboxes).toEqual([
      {
        key: CONSENT_KEY,
        text: "I agree to get messages from Harbour Bean on WhatsApp.",
        isRequired: false,
        isCheckedByDefault: false,
      },
    ]);
  });

  it("a lead agreed only if they ticked our box", () => {
    expect(leadConsented([{ checkboxKey: CONSENT_KEY, isChecked: true }])).toBe(true);
    expect(leadConsented([{ checkboxKey: CONSENT_KEY, isChecked: false }])).toBe(false);
    expect(leadConsented([{ checkboxKey: "other", isChecked: true }])).toBe(false);
    expect(leadConsented(undefined)).toBe(false);
  });

  it("finds the person's name, email and phone in the answers", () => {
    expect(
      leadContact({ full_name: "Maria Santos", email: "maria@gmail.com", phone_number: "+63 917 555 0142", q1: "30" }),
    ).toEqual({ name: "Maria Santos", email: "maria@gmail.com", phone: "+639175550142" });
    expect(leadContact({ first_name: "Paolo", last_name: "Lim" })).toEqual({ name: "Paolo Lim", email: undefined, phone: undefined });
  });
});
