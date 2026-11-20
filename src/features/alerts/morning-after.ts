import { brandedEmail, brandedText, honeyButton, paragraph } from "@/lib/email/frame";
import { startOfDayIn } from "@/lib/time/zone";

// First connect, "Next morning" (canvas board approved 20 Nov): one email, once per organization,
// the morning after its first account connected, when new customer messages came in overnight
// and replies are drafted. Pure: no I/O.
//
// "Morning" is 8–10am in the owner's time zone. The app doesn't store one yet (the browser's zone
// lives in a cookie, waggle_tz, read per request), so the job passes null and the window falls
// back to 13:00–15:00 UTC (8–10am US Eastern).

/** The window opens at this local hour. */
export const MORNING_HOUR = 8;
/** Without a stored time zone: the window opens at this UTC hour. */
export const FALLBACK_MORNING_UTC_HOUR = 13;
/** How long the window stays open. */
export const MORNING_WINDOW_MS = 2 * 60 * 60 * 1000;
/** "Overnight": the morning must be at least this long after the connect. */
export const MIN_OVERNIGHT_MS = 6 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

export interface MorningWindow {
  from: Date;
  to: Date;
}

/** The morning after `connectedAt`: the first window opening at least MIN_OVERNIGHT_MS later. */
export function morningWindow(connectedAt: Date, timeZone: string | null): MorningWindow {
  const zone = timeZone ?? "UTC";
  const hour = timeZone ? MORNING_HOUR : FALLBACK_MORNING_UTC_HOUR;
  const earliest = connectedAt.getTime() + MIN_OVERNIGHT_MS;
  let day = startOfDayIn(connectedAt, zone);
  for (let i = 0; i < 3; i++) {
    const from = day.getTime() + hour * HOUR_MS;
    if (from >= earliest) return { from: new Date(from), to: new Date(from + MORNING_WINDOW_MS) };
    // The next local day (36h on lands inside it whatever daylight saving does).
    day = startOfDayIn(new Date(day.getTime() + 36 * HOUR_MS), zone);
  }
  // Unreachable: two days on always clears six hours.
  return { from: new Date(earliest), to: new Date(earliest + MORNING_WINDOW_MS) };
}

export type MorningDecision = "wait" | "send" | "skip_passed" | "skip_nothing_new";

/** Whether to send now, wait for the window, or settle it without an email (never retried). */
export function decideMorning(input: {
  now: Date;
  window: MorningWindow;
  messages: number;
  replies: number;
}): MorningDecision {
  if (input.now < input.window.from) return "wait";
  if (input.now >= input.window.to) return "skip_passed";
  if (input.messages === 0 || input.replies === 0) return "skip_nothing_new";
  return "send";
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "2pm", "9:30am" in the zone. */
function clock(at: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(at);
  const h = parts.find((p) => p.type === "hour")?.value ?? "";
  const m = parts.find((p) => p.type === "minute")?.value ?? "00";
  const ap = (parts.find((p) => p.type === "dayPeriod")?.value ?? "").toLowerCase();
  return `${h}${m === "00" ? "" : `:${m}`}${ap}`;
}

/**
 * "1 message expires at 2pm." With no known time zone the hour would mislead, so it says how
 * long is left instead. Null when nothing expires.
 */
export function expiryLine(
  expiring: { count: number; first: Date } | null,
  now: Date,
  timeZone: string | null,
): string | null {
  if (!expiring || expiring.count === 0) return null;
  const when = timeZone
    ? `at ${clock(expiring.first, timeZone)}`
    : `in ${plural(Math.max(1, Math.round((expiring.first.getTime() - now.getTime()) / HOUR_MS)), "hour", "hours")}`;
  return expiring.count === 1
    ? `1 message expires ${when}.`
    : `${expiring.count} messages expire soon, the first ${when}.`;
}

export interface MorningEmailInput {
  /** The owner's first name, when known. */
  firstName: string | null;
  /** "@harbourbean", or "your accounts" when messages came to more than one. */
  handle: string;
  orgName: string;
  messages: number;
  customers: number;
  replies: number;
  expiry: string | null;
  appUrl: string;
}

export function morningEmail(input: MorningEmailInput): {
  subject: string;
  text: string;
  html: string;
} {
  const subject = `Waggle caught ${plural(input.messages, "new message", "new messages")} overnight`;
  const hello = input.firstName ? `Good morning, ${input.firstName}.` : "Good morning.";
  const ready = `${plural(input.replies, "reply is", "replies are")} ready`;
  const line = [
    hello,
    `${plural(input.customers, "customer", "customers")} wrote to ${input.handle} overnight.`,
    `${ready} for you to approve.`,
    ...(input.expiry ? [input.expiry] : []),
  ].join(" ");
  const footer = "Sent once, the morning after you connect. Turn these off in Tell me when.";
  const base = input.appUrl.replace(/\/$/, "");
  const button = {
    href: `${base}/inbox`,
    label: `Approve ${plural(input.replies, "reply", "replies")}`,
  };
  const settingsUrl = `${base}/settings/notifications`;
  const because = `an Owner of ${input.orgName}`;
  const html = brandedEmail({
    title: subject,
    bodyHtml:
      paragraph(line) +
      `<div style="margin:4px 0 20px">${honeyButton(button.href, button.label)}</div>` +
      paragraph(footer, { muted: true }),
    button: null,
    businessName: input.orgName,
    because,
    settingsUrl,
    preheader: `${ready} for you to approve.`,
  });
  const text = brandedText({
    title: subject,
    lines: [line, "", `${button.label}: ${button.href}`, "", footer],
    because,
    settingsUrl,
  });
  return { subject, text, html };
}
