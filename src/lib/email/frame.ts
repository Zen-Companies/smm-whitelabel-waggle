// One look for every Waggle email (design "Waggle emails", approved 18 Nov). Pure: no I/O.
//
// Email-safe HTML: tables and inline styles only, no web fonts needed (Outfit falls back to
// Arial), no images. The waggle. wordmark, a honey strip, a white card, one honey button, and a
// footer saying why you got it with a link to change it.

const HONEY = "#F6B21B";
const INK = "#17140F";
const INK2 = "#4F4A40";
const INK3 = "#6B6458";
const PAGE = "#F4F1E9";
const LINE = "#ECE8DF";

export const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

export interface FrameInput {
  /** Short line above the title ("Needs you", "New lead"); plain text. */
  eyebrow?: { text: string; tone: "needs" | "honey" | "quiet" } | null;
  /** The headline; plain text. */
  title: string;
  /** The card's body, already HTML (use `paragraph` / `detailRows` / escapeHtml). */
  bodyHtml: string;
  button?: { href: string; label: string } | null;
  /** Top right: the business the email is about; plain text. */
  businessName?: string | null;
  /** "You get this because you're …"; plain text, e.g. "an Owner of Harbour Bean Café". */
  because: string;
  /** Where to change what Waggle emails you; omitted for sign-in and invite emails. */
  settingsUrl?: string | null;
  /** Hidden preview line in the inbox list; plain text. */
  preheader?: string | null;
}

const EYEBROW: Record<"needs" | "honey" | "quiet", string> = {
  needs: "#8C2A1E",
  honey: "#7A4F00",
  quiet: INK3,
};

export const paragraph = (text: string, opts: { muted?: boolean } = {}) =>
  `<p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:${opts.muted ? INK3 : INK2}">${escapeHtml(text)}</p>`;

/** Label / value rows (lead details); plain text in, HTML out. */
export function detailRows(rows: [string, string][]): string {
  if (!rows.length) return "";
  const trs = rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 12px 6px 0;color:${INK3};font-size:14px;vertical-align:top;width:120px">${escapeHtml(k)}</td>` +
        `<td style="padding:6px 0;font-size:14px;font-weight:600;color:${INK};vertical-align:top">${escapeHtml(v)}</td></tr>`,
    )
    .join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:0 0 20px">${trs}</table>`;
}

export const honeyButton = (href: string, label: string) =>
  `<a href="${escapeHtml(href)}" style="display:inline-block;background:${HONEY};color:${INK};font-weight:600;font-size:15px;text-decoration:none;padding:12px 20px;border-radius:10px">${escapeHtml(label)}</a>`;

export function brandedEmail(input: FrameInput): string {
  const eyebrow = input.eyebrow
    ? `<p style="margin:0 0 6px;font-size:13px;font-weight:600;color:${EYEBROW[input.eyebrow.tone]}">${escapeHtml(input.eyebrow.text)}</p>`
    : "";
  const button = input.button
    ? `<div style="margin:4px 0 0">${honeyButton(input.button.href, input.button.label)}</div>`
    : "";
  const change = input.settingsUrl
    ? ` <a href="${escapeHtml(input.settingsUrl)}" style="color:#7A4F00;font-weight:600;text-decoration:underline">Change what Waggle emails you</a>`
    : "";
  const preheader = input.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(input.preheader)}</div>`
    : "";
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:0;background:${PAGE};font-family:Inter,Arial,Helvetica,sans-serif;color:${INK}">${preheader}
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:${PAGE}"><tr><td align="center" style="padding:28px 16px">
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px">
<tr><td style="padding:0 4px 14px"><table role="presentation" cellpadding="0" cellspacing="0" style="width:100%"><tr>
<td style="font-family:Outfit,Arial,Helvetica,sans-serif;font-weight:700;font-size:22px;letter-spacing:-0.5px;color:${INK}">waggle<span style="color:${HONEY}">.</span></td>
<td align="right" style="font-size:12px;color:${INK3}">${escapeHtml(input.businessName ?? "")}</td>
</tr></table></td></tr>
<tr><td style="background:#FFFFFF;border:1px solid ${LINE};border-radius:16px;overflow:hidden">
<div style="height:6px;line-height:6px;font-size:0;background:${HONEY};border-radius:16px 16px 0 0">&nbsp;</div>
<div style="padding:26px 28px">${eyebrow}
<h1 style="margin:0 0 12px;font-family:Outfit,Arial,Helvetica,sans-serif;font-weight:600;font-size:24px;line-height:1.25;color:${INK}">${escapeHtml(input.title)}</h1>
${input.bodyHtml}${button}
</div></td></tr>
<tr><td style="padding:16px 4px 0;font-size:12px;line-height:1.6;color:${INK3}">You get this because you&#39;re ${escapeHtml(input.because)}.${change}<br>Waggle &middot; AI that runs your socials &middot; gowaggle.ai</td></tr>
</table></td></tr></table></body></html>`;
}

/** The plain-text part that goes with it. */
export function brandedText(input: {
  title: string;
  lines: string[];
  button?: { href: string; label: string } | null;
  because: string;
  settingsUrl?: string | null;
}): string {
  return [
    input.title,
    "",
    ...input.lines,
    ...(input.button ? ["", `${input.button.label}: ${input.button.href}`] : []),
    "",
    "--",
    `You get this because you're ${input.because}.`,
    ...(input.settingsUrl ? [`Change what Waggle emails you: ${input.settingsUrl}`] : []),
  ].join("\n");
}
