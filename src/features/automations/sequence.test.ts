import { describe, expect, it } from "vitest";
import { needsTemplate, parseSequenceForm, SEQUENCE_PLATFORMS, toSequenceSteps } from "./sequence";

const form = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

describe("sequences", () => {
  it("runs on the messaging platforms Zernio supports and Waggle connects", () => {
    for (const p of ["whatsapp", "instagram", "facebook", "telegram", "bluesky"]) {
      expect(SEQUENCE_PLATFORMS.has(p)).toBe(true);
    }
    expect(SEQUENCE_PLATFORMS.has("tiktok")).toBe(false);
  });

  it("WhatsApp messages sent a day or more after the last one must be templates", () => {
    expect(needsTemplate("whatsapp", 0)).toBe(false);
    expect(needsTemplate("whatsapp", 23 * 60)).toBe(false);
    expect(needsTemplate("whatsapp", 24 * 60)).toBe(true);
    expect(needsTemplate("instagram", 3 * 24 * 60)).toBe(false);
  });

  it("steps become Zernio's order / delayMinutes / message or template", () => {
    expect(
      toSequenceSteps([
        { waitMinutes: 0, text: "Hi {first name}!" },
        { waitMinutes: 2880, template: { name: "visit_reminder", language: "en", variables: 1 } },
      ]),
    ).toEqual([
      { order: 1, delayMinutes: 0, message: { text: "Hi {{first_name}}!" } },
      {
        order: 2,
        delayMinutes: 2880,
        template: { name: "visit_reminder", language: "en", variableMapping: { "1": { field: "name" } } },
      },
    ]);
  });

  it("reads the form, and refuses a late WhatsApp step without a template", () => {
    const steps = JSON.stringify([
      { waitMinutes: 0, text: "Thanks for visiting!" },
      { waitMinutes: 2880, text: "Your 10% off is waiting" },
    ]);
    expect(
      parseSequenceForm(form({ name: "Welcome", platform: "whatsapp", accountId: "a", steps })),
    ).toMatchObject({ ok: false, field: "steps" });
    const ok = parseSequenceForm(form({ name: "Welcome", platform: "instagram", accountId: "a", steps, exitOnReply: "yes" }));
    expect(ok).toMatchObject({ ok: true, value: { name: "Welcome", exitOnReply: true, exitOnUnsubscribe: true } });
  });

  it("needs at least one message", () => {
    expect(parseSequenceForm(form({ name: "x", platform: "instagram", accountId: "a", steps: "[]" }))).toMatchObject({ ok: false, field: "steps" });
  });
});
