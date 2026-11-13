import { describe, expect, it } from "vitest";
import { DRAFT_PROMPT_VERSION, DRAFT_PROMPTS } from "./prompts";

describe("draft prompt 2026-11-13.1 (T81d)", () => {
  const p = DRAFT_PROMPTS["2026-11-13.1"];
  const base = {
    kind: "dm" as const,
    category: "lead",
    text: "Can we book catering for 30 on Saturday?",
    facts: [{ id: "k1", title: "Opening hours", content: "Mon to Sat, 8 AM to 6 PM" }],
    platform: "imap",
  };

  it("is the current version, names email, and only offers times inside opening hours", () => {
    expect(DRAFT_PROMPT_VERSION).toBe("2026-11-13.1");
    const system = p.system("Harbour Bean");
    expect(system).toContain("emails");
    expect(system).toMatch(
      /9\. CALENDAR.*opening hours in BUSINESS INFO.*Never confirm a booking/s,
    );
  });

  it("adds the busy times only when a calendar was read", () => {
    const withCal = p.user({
      ...base,
      calendar: { today: "Today is Fri 13 Nov 2026.", busy: ["Sat 14 Nov, 09:00 to 09:30"] },
    });
    expect(withCal).toContain(
      "CALENDAR (busy times, next 7 days):\nToday is Fri 13 Nov 2026.\n- Sat 14 Nov, 09:00 to 09:30",
    );
    expect(
      p.user({ ...base, calendar: { today: "Today is Fri 13 Nov 2026.", busy: [] } }),
    ).toContain("(nothing booked)");
    expect(p.user(base)).not.toContain("CALENDAR");
  });
});
