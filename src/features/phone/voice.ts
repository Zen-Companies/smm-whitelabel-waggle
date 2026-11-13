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

export function parseVoiceForm(
  f: FormData,
): { ok: true; value: VoiceForm } | { ok: false; field: string; error: string } {
  const raw = String(f.get("forwardTo") ?? "").trim();
  let forwardTo = "";
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
