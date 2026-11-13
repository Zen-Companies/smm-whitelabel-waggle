// The owner emails (pure). Escalation emails carry who and why plus a link, never the customer's
// message (it stays in the app); lead emails carry the lead's details, which are the point.

import { platformLabel } from "@/lib/social/platforms";

export type AlertContent =
  | {
      kind: "escalation";
      itemId: string;
      itemKind: "comment" | "dm" | "review" | "call";
      platform: string;
      authorName: string | null;
      category: string | null;
      status: string;
      reason: string | null;
    }
  | {
      kind: "lead";
      itemId: string;
      platform: string;
      itemKind: "comment" | "dm" | "review" | "call";
      authorName: string | null;
      name: string | null;
      contact: string | null;
      request: string | null;
    }
  | {
      kind: "ad_lead";
      formName: string | null;
      /** Question key -> answer, as the form sent them. */
      fields: Record<string, string>;
      agreedToMessages: boolean;
    }
  | { kind: "disconnect"; platform: string; username: string | null }
  | { kind: "draft_waiting"; count: number }
  | {
      kind: "rcs_status";
      status: "changes_requested" | "testing" | "live" | "rejected";
      /** The review note, when there is one. */
      reason: string | null;
    };

export interface ComposedEmail {
  subject: string;
  text: string;
  html: string;
}

const platformName = platformLabel;
const where = (platform: string, kind: "comment" | "dm" | "review" | "call") =>
  kind === "call" ? "phone call" : `${platformName(platform)} ${kind === "dm" ? "DM" : kind}`;

/** Why an item came to the owner, from the policy / send step / runner reason codes. */
export function escalationReason(reason: string | null, status: string): string {
  const reasons: Record<string, string> = {
    complaint: "It looks like a complaint.",
    unclear: "Waggle couldn't tell what it's about.",
    low_confidence: "Waggle wasn't sure what it's about.",
    needs_human: "Your knowledge base doesn't cover the question.",
    mode_off: "AI replies are off for this kind of message.",
    ai_cap_reached: "This month's AI allowance is used up, so no reply was suggested.",
    dm_window_closed: "The platform's DM reply window closed before the reply went out.",
    dm_reply_limit:
      "The chat used all the replies the platform allows until the customer writes again.",
    dm_window_closing: "The DM reply window closes within the hour.",
    account_inactive: "The account was disconnected before the reply went out.",
    tenant_inactive: "Your subscription isn't active, so the reply wasn't sent.",
    send_rejected: "The platform refused the reply.",
    retries_exhausted: "Waggle couldn't process or send it after 3 tries.",
    missed_call: "Nobody picked up. Call them back when you can.",
    voicemail: "They left a voicemail. Listen to it in Waggle.",
    delivery_failed: "The reply was sent but not delivered.",
    no_approved_draft: "There was no approved reply to send.",
  };
  if (reason && reasons[reason]) return reasons[reason];
  return status === "failed" ? "Something went wrong handling it." : "Waggle handed it to you.";
}

const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

function render(subject: string, lines: string[], link: { href: string; label: string }) {
  const text = [...lines, "", `${link.label}: ${link.href}`].join("\n");
  const html =
    lines.map((l) => `<p>${escapeHtml(l)}</p>`).join("") +
    `<p><a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a></p>`;
  return { subject, text, html };
}

export const itemUrl = (appUrl: string, itemId: string) => `${appUrl}/inbox/items/${itemId}`;

export function composeAlert(
  content: AlertContent,
  ctx: { businessName: string; appUrl: string },
): ComposedEmail {
  const { businessName, appUrl } = ctx;
  switch (content.kind) {
    case "escalation": {
      const who = content.authorName ?? "A customer";
      const verb = content.status === "failed" ? "couldn't be answered" : "needs you";
      return render(
        `${businessName}: a ${where(content.platform, content.itemKind)} from ${who} ${verb}`,
        [
          `${who} sent a ${where(content.platform, content.itemKind)} that Waggle handed to you.`,
          escalationReason(content.reason, content.status),
        ],
        { href: itemUrl(appUrl, content.itemId), label: "Open the message" },
      );
    }
    case "lead": {
      const who = content.name ?? content.authorName ?? "Someone";
      return render(
        `${businessName}: new lead from ${who}`,
        [
          `New lead from a ${where(content.platform, content.itemKind)}.`,
          `Name: ${content.name ?? "not given"}`,
          `Contact: ${content.contact ?? "not given"}`,
          `Request: ${content.request ?? "not given"}`,
        ],
        { href: itemUrl(appUrl, content.itemId), label: "Open the conversation" },
      );
    }
    case "ad_lead": {
      const get = (...keys: string[]) => keys.map((k) => content.fields[k]?.trim()).find(Boolean);
      const name =
        get("full_name", "name") ??
        ([get("first_name"), get("last_name")].filter(Boolean).join(" ") || null);
      const label = (k: string) => k.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
      return render(
        `${businessName}: new lead from ${name ?? "your ad"}`,
        [
          `Someone filled ${content.formName ?? "your lead form"} in your ad.`,
          ...Object.entries(content.fields).map(([k, v]) => `${label(k)}: ${v}`),
          content.agreedToMessages
            ? "They agreed to get messages from you on WhatsApp."
            : "They didn't tick the messages box: reply to them directly, not with broadcasts.",
        ],
        { href: `${appUrl}/contacts/ad-leads`, label: "Open your leads" },
      );
    }
    case "disconnect": {
      const account = `${platformName(content.platform)}${content.username ? ` @${content.username}` : ""}`;
      return render(
        `${businessName}: ${account} disconnected`,
        [
          `${account} is no longer connected, so Waggle can't see or answer its messages.`,
          "Messages that arrive meanwhile wait until you reconnect.",
        ],
        { href: `${appUrl}/settings`, label: "Reconnect" },
      );
    }
    case "rcs_status": {
      const href = `${appUrl}/settings?section=messaging`;
      const note = content.reason ? [`The note: “${content.reason}”`] : [];
      switch (content.status) {
        case "changes_requested":
          return render(
            `${businessName}: your branded texts request needs a fix`,
            ["Before it goes to the carriers, a detail needs changing.", ...note],
            { href, label: "Fix the request" },
          );
        case "testing":
          return content.reason
            ? render(
                `${businessName}: your launch details came back`,
                ["The carriers' review needs another look at the launch details.", ...note],
                { href, label: "Send them again" },
              )
            : render(
                `${businessName}: branded texts are ready to test`,
                [
                  "Carriers approved your business. Invite your phone, try a few messages, then send the launch details.",
                ],
                { href, label: "Start testing" },
              );
        case "live":
          return render(
            `${businessName}: branded texts are live`,
            [
              "Your texts now show your name, logo and a verified tick. Replies arrive in the inbox.",
            ],
            { href: `${appUrl}/inbox`, label: "Open the inbox" },
          );
        case "rejected":
          return render(
            `${businessName}: carriers didn't approve your branded texts`,
            [...note, "You can send a new request from Settings."],
            { href, label: "Open Messaging" },
          );
      }
      break;
    }
    case "draft_waiting": {
      const n = content.count;
      return render(
        `${businessName}: ${n} ${n === 1 ? "reply is" : "replies are"} waiting for your approval`,
        [
          `${n === 1 ? "A drafted reply has" : `${n} drafted replies have`} been waiting for more than 30 minutes.`,
          "Customers get their answer once you approve.",
        ],
        { href: `${appUrl}/inbox`, label: "Review replies" },
      );
    }
  }
}
