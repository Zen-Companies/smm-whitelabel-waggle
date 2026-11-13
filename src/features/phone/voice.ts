// Calls on the brand's number (T82b, design "Settings · Phone" → Calls): which phone rings, the
// voicemail greeting (always ours: the partner's default wording isn't documented), and open
// hours (outside them callers go straight to voicemail). Voicemail picks up after about 25
// seconds of ringing; that isn't adjustable upstream. Call recording is held (user decision).

export const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export type VoiceForm = {
  /** "tel:+E164", or "" for voicemail only. */
  forwardTo: string;
  voicemailGreeting: string;
  businessHoursEnabled: boolean;
  businessHoursTimezone: string;
  businessHours: { day: number; open: string; close: string }[];
};

export const defaultGreeting = (businessName: string) =>
  `Hi, you've reached ${businessName}. We can't take your call right now. Please leave a message after the tone and we'll call you back.`;

const validZone = (tz: string) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

/**
 * T82e (design "Who answers calls"): an AI receptionist on the forwarding lane only. Vapi takes
 * the agent's SIP username; Retell and ElevenLabs take the number itself, imported on their side
 * (docs.zernio.com/platforms/voice/integrations/*). Their SIP trunk lane would hand the owner the
 * partner's credentials, so it isn't offered. Handing a caller to a person is a transfer set up
 * in the AI service; voicemail catches a call the AI doesn't answer.
 */
export const AI_SERVICES = {
  vapi: "Vapi",
  retell: "Retell",
  elevenlabs: "ElevenLabs",
  other: "Another service (its address)",
} as const;
export type AiService = keyof typeof AI_SERVICES;
export type Answerer =
  | { mode: "ring"; phone: string }
  | { mode: "voicemail" }
  | { mode: "ai"; service: AiService; vapiUsername?: string; address?: string };

/** The AI service's address for this number. */
export function aiAddress(
  service: AiService,
  phoneNumber: string,
  input: { vapiUsername?: string; address?: string },
): string | null {
  if (service === "vapi") {
    const u = (input.vapiUsername ?? "").trim();
    return /^[A-Za-z0-9._-]{1,64}$/.test(u) ? `sip:${u}@sip.vapi.ai` : null;
  }
  if (service === "retell") return `sip:${phoneNumber}@sip.retellai.com:5060;transport=tcp`;
  if (service === "elevenlabs")
    return `sip:${phoneNumber}@sip.rtc.elevenlabs.io:5061;transport=tls`;
  const a = (input.address ?? "").trim();
  return /^(sip:[^\s@]+@[^\s]+|wss:\/\/\S+)$/.test(a) ? a : null;
}

/** Who answers today, read back from the number's forward address. */
export function answererOf(forwardTo: string | null): Answerer {
  if (!forwardTo) return { mode: "voicemail" };
  if (forwardTo.startsWith("tel:")) return { mode: "ring", phone: forwardTo.slice(4) };
  const vapi = /^sip:([^@]+)@sip\.vapi\.ai$/.exec(forwardTo);
  if (vapi) return { mode: "ai", service: "vapi", vapiUsername: vapi[1] };
  if (forwardTo.includes("@sip.retellai.com")) return { mode: "ai", service: "retell" };
  if (forwardTo.includes("@sip.rtc.elevenlabs.io")) return { mode: "ai", service: "elevenlabs" };
  return { mode: "ai", service: "other", address: forwardTo };
}

export function parseVoiceForm(
  f: FormData,
  phoneNumber = "",
): { ok: true; value: VoiceForm } | { ok: false; field: string; error: string } {
  const mode = String(f.get("mode") ?? "ring");
  let forwardTo = "";
  if (mode === "ai") {
    const service = String(f.get("aiService") ?? "") as AiService;
    if (!(service in AI_SERVICES))
      return { ok: false, field: "aiService", error: "Pick your AI service." };
    const address = aiAddress(service, phoneNumber, {
      vapiUsername: String(f.get("vapiUsername") ?? ""),
      address: String(f.get("aiAddress") ?? ""),
    });
    if (!address) {
      return service === "vapi"
        ? {
            ok: false,
            field: "vapiUsername",
            error: "Paste the SIP username you made for the assistant in Vapi.",
          }
        : {
            ok: false,
            field: "aiAddress",
            error: "Paste the address that starts with sip: or wss://.",
          };
    }
    forwardTo = address;
  }
  const raw = mode === "ring" ? String(f.get("forwardTo") ?? "").trim() : "";
  if (mode === "ring" && !raw) {
    return { ok: false, field: "forwardTo", error: "Add the phone to ring, or choose voicemail." };
  }
  if (raw) {
    const digits = raw.replace(/[\s().-]/g, "");
    if (!/^\+\d{7,15}$/.test(digits)) {
      return {
        ok: false,
        field: "forwardTo",
        error: "Use the full number with the country code, like +1 415 555 0199.",
      };
    }
    forwardTo = `tel:${digits}`;
  }
  const voicemailGreeting = String(f.get("voicemailGreeting") ?? "").trim();
  if (!voicemailGreeting) {
    return {
      ok: false,
      field: "voicemailGreeting",
      error: "Write what callers hear before they leave a message.",
    };
  }
  if (voicemailGreeting.length > 500) {
    return {
      ok: false,
      field: "voicemailGreeting",
      error: "Keep the greeting under 500 characters.",
    };
  }
  const businessHoursTimezone = String(f.get("timezone") ?? "").trim();
  const businessHoursEnabled = f.get("hoursOn") === "yes";
  const businessHours: VoiceForm["businessHours"] = [];
  if (businessHoursEnabled) {
    if (!validZone(businessHoursTimezone)) {
      return { ok: false, field: "timezone", error: "Pick your time zone." };
    }
    for (let day = 0; day < 7; day++) {
      if (f.get(`open_${day}`) !== "yes") continue;
      const open = String(f.get(`from_${day}`) ?? "");
      const close = String(f.get(`to_${day}`) ?? "");
      if (!/^\d{2}:\d{2}$/.test(open) || !/^\d{2}:\d{2}$/.test(close) || open >= close) {
        return {
          ok: false,
          field: "hours",
          error: `${DAYS[day]}: closing has to be after opening.`,
        };
      }
      businessHours.push({ day, open, close });
    }
    if (!businessHours.length) {
      return {
        ok: false,
        field: "hours",
        error: "Tick at least one open day, or switch open hours off.",
      };
    }
  }
  return {
    ok: true,
    value: {
      forwardTo,
      voicemailGreeting,
      businessHoursEnabled,
      businessHoursTimezone: businessHoursTimezone || "UTC",
      businessHours,
    },
  };
}
