// The owner emails (pure). Escalation emails carry who and why plus a link, never the customer's
// message (it stays in the app); lead emails carry the lead's details, which are the point.

export type AlertContent =
  | {
      kind: "escalation";
      itemId: string;
      itemKind: "comment" | "dm" | "review";
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
      itemKind: "comment" | "dm" | "review";
      authorName: string | null;
      name: string | null;
      contact: string | null;
      request: string | null;
    }
  | { kind: "disconnect"; platform: string; username: string | null }
  | { kind: "draft_waiting"; count: number };

export interface ComposedEmail {
  subject: string;
  text: string;
  html: string;
}

const PLATFORM: Record<string, string> = { instagram: "Instagram", facebook: "Facebook" };
const platformName = (p: string) => PLATFORM[p] ?? p;
const where = (platform: string, kind: "comment" | "dm" | "review") =>
  `${platformName(platform)} ${kind === "dm" ? "DM" : kind}`;

/** Why an item came to the owner, from the policy / send step / runner reason codes. */
export function escalationReason(reason: string | null, status: string): string {
  const reasons: Record<string, string> = {
    complaint: "It looks like a complaint.",
    unclear: "Waggle couldn't tell what it's about.",
    low_confidence: "Waggle wasn't sure what it's about.",
    needs_human: "Your knowledge base doesn't cover the question.",
    mode_off: "AI replies are off for this kind of message.",
    ai_cap_reached: "This month's AI allowance is used up, so no reply was suggested.",
    dm_window_closed: "Instagram's 24-hour DM reply window closed before the reply went out.",
    dm_window_closing: "Instagram's 24-hour DM reply window closes within the hour.",
    account_inactive: "The account was disconnected before the reply went out.",
    tenant_inactive: "Your subscription isn't active, so the reply wasn't sent.",
    send_rejected: "Instagram/Facebook refused the reply.",
    retries_exhausted: "Waggle couldn't process or send it after 3 tries.",
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
