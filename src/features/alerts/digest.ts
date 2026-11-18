// Email summaries (design "Waggle emails: one summary per sender", approved 18 Nov). Pure: no I/O.
//
// Each person picks how often Waggle emails them. Alerts for someone on "every hour" or "every
// 2 hours" wait as digest entries; their summary goes out once the oldest waiting entry is that
// old, one block per person who wrote, people who need you first. Lost connections and RCS news
// always go right away (they block replies).

import { brandedEmail, brandedText, escapeHtml } from "@/lib/email/frame";
import { escalationReason, itemUrl, type AlertContent, type ComposedEmail } from "./compose";
import { platformLabel } from "@/lib/social/platforms";

export const FREQUENCIES = ["now", "hourly", "two_hours"] as const;
export type Frequency = (typeof FREQUENCIES)[number];
export const isFrequency = (v: unknown): v is Frequency =>
  typeof v === "string" && (FREQUENCIES as readonly string[]).includes(v);

export const FREQUENCY_LABELS: Record<Frequency, { label: string; line: string }> = {
  now: { label: "Right away", line: "One email per thing that needs you" },
  hourly: { label: "Every hour", line: "One summary, grouped by person" },
  two_hours: { label: "Every 2 hours", line: "One summary, grouped by person" },
};

/** Never batched: they stop replies until someone acts. */
export const IMMEDIATE_KINDS: ReadonlySet<string> = new Set(["disconnect", "rcs_status"]);

const WAIT_MS: Record<Exclude<Frequency, "now">, number> = {
  hourly: 60 * 60_000,
  two_hours: 2 * 60 * 60_000,
};

/** A person's summary is due once their oldest waiting entry has waited the full interval. */
export function digestDue(oldest: Date, frequency: Frequency, now: Date): boolean {
  if (frequency === "now") return true;
  return now.getTime() - oldest.getTime() >= WAIT_MS[frequency];
}

/** One waiting alert, as the summary shows it. Names, places and reasons only (rule 10). */
export interface DigestLine {
  /** Who it's about: the person who wrote, or a group ("Replies waiting"). */
  person: string;
  /** "Instagram DM", "Google review", "your ad". */
  place: string;
  line: string;
  needsYou: boolean;
  href: string;
}

const EMAIL = new Set(["google", "microsoft", "imap"]);
const placeOf = (platform: string, kind: "comment" | "dm" | "review" | "call") =>
  kind === "call"
    ? "Phone call"
    : `${platformLabel(platform as never)} ${kind === "dm" ? (EMAIL.has(platform) ? "email" : "DM") : kind}`;

export function digestLine(content: AlertContent, appUrl: string): DigestLine | null {
  switch (content.kind) {
    case "escalation":
      return {
        person: content.authorName ?? "A customer",
        place: placeOf(content.platform, content.itemKind),
        line: escalationReason(content.reason, content.status),
        needsYou: true,
        href: itemUrl(appUrl, content.itemId),
      };
    case "lead":
      return {
        person: content.name ?? content.authorName ?? "Someone",
        place: placeOf(content.platform, content.itemKind),
        line: `New lead${content.request ? `: ${content.request}` : ""}`.slice(0, 200),
        needsYou: true,
        href: itemUrl(appUrl, content.itemId),
      };
    case "ad_lead": {
      const get = (...keys: string[]) => keys.map((k) => content.fields[k]?.trim()).find(Boolean);
      const name =
        get("full_name", "name") ??
        ([get("first_name"), get("last_name")].filter(Boolean).join(" ") || "Someone");
      return {
        person: name,
        place: "your ad",
        line: `Filled ${content.formName ?? "your lead form"}`,
        needsYou: true,
        href: `${appUrl}/contacts/ad-leads`,
      };
    }
    case "draft_waiting":
      return {
        person: "Replies waiting",
        place: "Inbox",
        line: `${content.count} ${content.count === 1 ? "reply is" : "replies are"} waiting for your OK`,
        needsYou: true,
        href: `${appUrl}/inbox`,
      };
    default:
      return null;
  }
}

interface Block {
  person: string;
  places: string[];
  lines: string[];
  needsYou: boolean;
  href: string;
}

/** One block per person (same name, same business), people who need you first. */
export function groupByPerson(lines: DigestLine[]): Block[] {
  const blocks = new Map<string, Block>();
  for (const l of lines) {
    const key = l.person.trim().toLowerCase();
    const b = blocks.get(key);
    if (!b) {
      blocks.set(key, {
        person: l.person,
        places: [l.place],
        lines: [l.line],
        needsYou: l.needsYou,
        href: l.href,
      });
      continue;
    }
    if (!b.places.includes(l.place)) b.places.push(l.place);
    b.lines.push(l.line);
    b.needsYou ||= l.needsYou;
    b.href = l.href; // the latest one
  }
  return [...blocks.values()].sort((a, b) => Number(b.needsYou) - Number(a.needsYou));
}

/** "Ana sent 3": repeated lines collapse into a count. */
function summarize(lines: string[]): string[] {
  const counts = new Map<string, number>();
  for (const l of lines) counts.set(l, (counts.get(l) ?? 0) + 1);
  return [...counts.entries()].map(([l, n]) => (n > 1 ? `${n}× ${l}` : l));
}

const INK2 = "#4F4A40";
const INK3 = "#6B6458";

export function composeDigest(
  lines: DigestLine[],
  ctx: { businessName: string; appUrl: string },
): ComposedEmail {
  const blocks = groupByPerson(lines);
  const people = blocks.filter((b) => b.needsYou && b.person !== "Replies waiting").length;
  const title =
    people > 0
      ? `${people} ${people === 1 ? "person needs" : "people need"} you`
      : "Replies are waiting for you";
  const subject = `${ctx.businessName}: ${title.toLowerCase()}`;
  const settingsUrl = `${ctx.appUrl}/settings/notifications`;
  const because = `on the team of ${ctx.businessName}`;
  const initial = (name: string) => escapeHtml((name.trim()[0] ?? "?").toUpperCase());
  const blockHtml = blocks
    .map((b) => {
      const items = summarize(b.lines)
        .map((l) => `<li style="margin:2px 0">${escapeHtml(l)}</li>`)
        .join("");
      const first = b.person.split(/\s+/)[0];
      return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-top:1px solid #F0ECE3"><tr>
<td style="width:48px;padding:14px 0;vertical-align:top"><div style="width:36px;height:36px;line-height:36px;border-radius:18px;background:#FFF4D9;color:#7A4F00;text-align:center;font-weight:700">${initial(b.person)}</div></td>
<td style="padding:14px 0;vertical-align:top"><b style="font-size:15px">${escapeHtml(b.person)}</b> <span style="color:${INK3};font-size:14px">&middot; ${escapeHtml(b.places.join(", "))}</span>
<ul style="margin:4px 0 6px;padding-left:18px;font-size:14px;line-height:1.5;color:${INK2}">${items}</ul>
<a href="${escapeHtml(b.href)}" style="font-size:13px;font-weight:600;color:#7A4F00">${b.person === "Replies waiting" ? "Review replies" : `Open ${escapeHtml(first)}&#39;s conversation`} &rarr;</a></td></tr></table>`;
    })
    .join("");
  const html = brandedEmail({
    eyebrow: { text: "Your summary", tone: "quiet" },
    title,
    bodyHtml:
      `<p style="margin:0 0 6px;font-size:15px;line-height:1.55;color:${INK2}">These came in since the last summary:</p>` +
      blockHtml +
      `<div style="height:16px"></div>`,
    button: { href: `${ctx.appUrl}/inbox`, label: "Open your inbox" },
    businessName: ctx.businessName,
    because,
    settingsUrl,
    preheader: blocks.map((b) => b.person).join(", "),
  });
  const text = brandedText({
    title,
    lines: blocks.flatMap((b) => [
      `${b.person} (${b.places.join(", ")})`,
      ...summarize(b.lines).map((l) => `  - ${l}`),
      `  ${b.href}`,
      "",
    ]),
    button: { href: `${ctx.appUrl}/inbox`, label: "Open your inbox" },
    because,
    settingsUrl,
  });
  return { subject, text, html };
}
