import { describe, expect, it } from "vitest";
import { defaultGreeting, parseVoiceForm } from "./voice";

const form = (v: Record<string, string>) => {
  const f = new FormData();
  for (const [k, val] of Object.entries(v)) f.set(k, val);
  return f;
};

describe("parseVoiceForm", () => {
  const base = {
    forwardTo: "+1 (415) 555-0199",
    voicemailGreeting: "Hi, you've reached Harbour Bean. Leave a message!",
    timezone: "America/Los_Angeles",
  };

  it("rings a phone in E.164 form, with the greeting and no open hours", () => {
    expect(parseVoiceForm(form(base))).toEqual({
      ok: true,
      value: {
        forwardTo: "tel:+14155550199",
        voicemailGreeting: base.voicemailGreeting,
        businessHoursEnabled: false,
        businessHoursTimezone: "America/Los_Angeles",
        businessHours: [],
      },
    });
  });

  it("an empty phone means voicemail only", () => {
    expect(parseVoiceForm(form({ ...base, forwardTo: "" }))).toMatchObject({
      ok: true,
      value: { forwardTo: "" },
    });
  });

  it("reads open days, Sunday as 0, and skips closed ones", () => {
    const r = parseVoiceForm(
      form({
        ...base,
        hoursOn: "yes",
        open_1: "yes",
        from_1: "08:00",
        to_1: "18:00",
        open_0: "",
        from_0: "09:00",
        to_0: "12:00",
      }),
    );
    expect(r).toMatchObject({
      ok: true,
      value: {
        businessHoursEnabled: true,
        businessHours: [{ day: 1, open: "08:00", close: "18:00" }],
      },
    });
  });

  it("refuses a bad phone, an empty greeting, a closing before opening and a made-up zone", () => {
    expect(parseVoiceForm(form({ ...base, forwardTo: "call me" }))).toMatchObject({
      field: "forwardTo",
    });
    expect(parseVoiceForm(form({ ...base, voicemailGreeting: " " }))).toMatchObject({
      field: "voicemailGreeting",
    });
    expect(
      parseVoiceForm(
        form({ ...base, hoursOn: "yes", open_2: "yes", from_2: "18:00", to_2: "08:00" }),
      ),
    ).toMatchObject({ field: "hours" });
    expect(
      parseVoiceForm(
        form({
          ...base,
          hoursOn: "yes",
          open_2: "yes",
          from_2: "08:00",
          to_2: "18:00",
          timezone: "Mars/Base",
        }),
      ),
    ).toMatchObject({
      field: "timezone",
    });
    expect(parseVoiceForm(form({ ...base, hoursOn: "yes" }))).toMatchObject({ field: "hours" });
  });

  it("writes a greeting in the business's name", () => {
    expect(defaultGreeting("Harbour Bean Café")).toBe(
      "Hi, you've reached Harbour Bean Café. We can't take your call right now. Please leave a message after the tone and we'll call you back.",
    );
  });
});
