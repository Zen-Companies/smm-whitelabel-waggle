import { describe, expect, it } from "vitest";
import { aiAddress, answererOf, defaultGreeting, parseVoiceForm } from "./voice";

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

  it("voicemail only clears the forward; ringing needs a phone", () => {
    expect(parseVoiceForm(form({ ...base, mode: "voicemail" }))).toMatchObject({
      ok: true,
      value: { forwardTo: "" },
    });
    expect(parseVoiceForm(form({ ...base, mode: "ring", forwardTo: "" }))).toMatchObject({
      ok: false,
      field: "forwardTo",
    });
  });

  it("an AI receptionist: Vapi by username, Retell and ElevenLabs by the number (T82e)", () => {
    const ai = (over: Record<string, string>) =>
      parseVoiceForm(form({ ...base, mode: "ai", ...over }), "+14155550142");
    expect(ai({ aiService: "vapi", vapiUsername: "harbour-bean" })).toMatchObject({
      ok: true,
      value: { forwardTo: "sip:harbour-bean@sip.vapi.ai" },
    });
    expect(ai({ aiService: "retell" })).toMatchObject({
      value: { forwardTo: "sip:+14155550142@sip.retellai.com:5060;transport=tcp" },
    });
    expect(ai({ aiService: "elevenlabs" })).toMatchObject({
      value: { forwardTo: "sip:+14155550142@sip.rtc.elevenlabs.io:5061;transport=tls" },
    });
    expect(ai({ aiService: "other", aiAddress: "wss://agent.example.com/media" })).toMatchObject({
      value: { forwardTo: "wss://agent.example.com/media" },
    });
    expect(ai({ aiService: "vapi", vapiUsername: "has space" })).toMatchObject({
      field: "vapiUsername",
    });
    expect(ai({ aiService: "other", aiAddress: "https://x" })).toMatchObject({
      field: "aiAddress",
    });
  });

  it("reads who answers back from the forward address", () => {
    expect(answererOf(null)).toEqual({ mode: "voicemail" });
    expect(answererOf("tel:+14155550199")).toEqual({ mode: "ring", phone: "+14155550199" });
    expect(answererOf("sip:hb@sip.vapi.ai")).toEqual({
      mode: "ai",
      service: "vapi",
      vapiUsername: "hb",
    });
    expect(answererOf(aiAddress("elevenlabs", "+14155550142", {}))).toMatchObject({
      service: "elevenlabs",
    });
    expect(answererOf("wss://x.example/m")).toMatchObject({
      service: "other",
      address: "wss://x.example/m",
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
