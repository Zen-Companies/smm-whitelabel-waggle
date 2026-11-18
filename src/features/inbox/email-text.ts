// Email in the inbox (18 Nov). Pure: no I/O.
//
// Zernio gives an email's plain-text part (docs.zernio.com/webhooks/inbox/message-received). For
// newsletters and app emails that part spells out every tracking link, often wrapped over many
// lines, so the message drowns in code. And automatic emails (no-reply senders, our own alerts)
// never need an answer.

/** Mailboxes connected from More connections (Gmail, Outlook, any IMAP). */
export const EMAIL_PLATFORMS = ["google", "microsoft", "imap"] as const;
export const isEmailPlatform = (p: string): boolean =>
  (EMAIL_PLATFORMS as readonly string[]).includes(p);

const URL_RE = /\bhttps?:\/\/[^\s<>()[\]]+/gi;

function host(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "link";
  }
}

/** A line that is one long unbroken run (a wrapped link or token), not words. */
const isCodeLine = (line: string) => {
  const t = line.trim();
  return t.length >= 24 && !/\s/.test(t) && !/^[\p{L}'’.,!?-]+$/u.test(t);
};

/**
 * The email's words, readable: links become their site name in brackets, wrapped link pieces and
 * long codes are dropped, and runs of blank lines collapse. Safe to run twice.
 */
export function readableEmailText(text: string): string {
  const lines = text
    .replace(/\r\n?/g, "\n")
    // "Open it [https://…]" and "<https://…>": the label stays, the link becomes its site.
    .replace(/[[<](https?:\/\/[^\]>\s]*)[\]>]?/gi, (_m, url: string) => `(${host(url)})`)
    .replace(URL_RE, (url) => `(${host(url)})`)
    .split("\n")
    .filter((line) => !isCodeLine(line));
  return lines
    .join("\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const AUTOMATED_LOCAL =
  /^(no-?reply|do-?not-?reply|donotreply|notifications?|notify|mailer-daemon|postmaster|bounces?|alerts?|newsletters?|automated|system)([+._-].*)?$/i;

/** The sender's address, from whichever field Zernio filled with it. */
export function senderAddress(sender: {
  id?: string | null;
  username?: string | null;
  name?: string | null;
}): string | null {
  for (const v of [sender.id, sender.username, sender.name]) {
    const m = v?.match(/[^\s<>"]+@[^\s<>"]+\.[^\s<>"]+/);
    if (m) return m[0].toLowerCase();
  }
  return null;
}

/**
 * An email nobody needs to answer: a no-reply style sender, or Waggle's own mail (its sending
 * domain, e.g. sign-up alerts and trial emails), which would otherwise land as "things that
 * need you" and then fail to send.
 */
export function isAutomatedEmail(address: string | null, ownDomains: readonly string[]): boolean {
  if (!address) return false;
  const [local, domain = ""] = address.toLowerCase().split("@");
  if (AUTOMATED_LOCAL.test(local)) return true;
  return ownDomains.some((d) => {
    const own = d.toLowerCase();
    return own !== "" && (domain === own || domain.endsWith(`.${own}`));
  });
}

/** Our own sending domains: the alert sender's domain, plus gowaggle.ai. */
export function ownEmailDomains(alertFrom: string | undefined): string[] {
  const domains = ["gowaggle.ai"];
  const m = alertFrom?.match(/@([^\s>]+)/);
  if (m) domains.push(m[1].toLowerCase());
  return domains;
}

/**
 * Waggle's own email by its look, for when the sender's address isn't in the payload: sent by
 * our alert sender's name (or "Waggle") and linking to gowaggle.ai. Breaks the loop where an alert
 * lands in a connected Gmail, becomes an item, and raises the next alert (18 Nov).
 */
export function looksLikeWaggleEmail(
  senderName: string | null | undefined,
  text: string | null | undefined,
  alertFrom: string | undefined,
): boolean {
  const names = ["waggle"];
  const display = alertFrom
    ?.match(/^\s*"?([^"<]+?)"?\s*</)?.[1]
    ?.trim()
    .toLowerCase();
  if (display) names.push(display);
  const name = (senderName ?? "").trim().toLowerCase();
  return names.includes(name) && /gowaggle\.ai/i.test(text ?? "");
}
