import { brandedEmail, brandedText, honeyButton, paragraph } from "@/lib/email/frame";
import { accountName, DAY_MS, joinAccounts, type IdleAccount } from "./idle";

// The day-23 warning (decided 19 Nov). Pure: no I/O. Branded like every Waggle email.

export interface IdleWarningInput {
  orgName: string;
  /** The owner's first name, when known. */
  firstName: string | null;
  accounts: IdleAccount[];
  daysAway: number;
  disconnectOn: Date;
  now: Date;
  appUrl: string;
}

/** "Saturday, November 29" (UTC: the job runs on UTC days). */
export function disconnectDay(d: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(d);
}

export function idleWarningEmail(input: IdleWarningInput): {
  subject: string;
  text: string;
  html: string;
} {
  const daysLeft = Math.max(
    1,
    Math.round((input.disconnectOn.getTime() - input.now.getTime()) / DAY_MS),
  );
  const inDays = `in ${daysLeft} ${daysLeft === 1 ? "day" : "days"}`;
  const one = input.accounts.length === 1;
  const subject = one
    ? `${accountName(input.accounts[0]!)} disconnects ${inDays}`
    : `Your accounts disconnect ${inDays}`;
  const keep = one ? "it" : "them";
  const greeting = input.firstName ? `Hi ${input.firstName}, you` : "You";
  const lines = [
    `${greeting} haven’t signed in to Waggle for ${input.daysAway} days. On the Free plan, we disconnect ${joinAccounts(input.accounts)} after 30 days away, on ${disconnectDay(input.disconnectOn)}.`,
    `Sign in once to keep ${keep} connected. Your answers and settings stay either way.`,
  ];
  const footer =
    "Paid plans never disconnect for being away. To stay connected while you’re away, upgrade to Solo or above.";
  const button = { href: `${input.appUrl.replace(/\/$/, "")}/login`, label: "Sign in to Waggle" };
  const because = `an Owner of ${input.orgName}`;
  const html = brandedEmail({
    eyebrow: { text: "Free plan", tone: "honey" },
    title: subject,
    // The button sits above the plan line, so the line reads as a footnote.
    bodyHtml:
      lines.map((l) => paragraph(l)).join("") +
      `<div style="margin:4px 0 20px">${honeyButton(button.href, button.label)}</div>` +
      paragraph(footer, { muted: true }),
    button: null,
    businessName: input.orgName,
    because,
    preheader: lines[1],
  });
  const text = brandedText({
    title: subject,
    lines: [...lines, "", `${button.label}: ${button.href}`, "", footer],
    because,
  });
  return { subject, text, html };
}
