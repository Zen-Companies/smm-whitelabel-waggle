// Links and QR codes (T77d, design "Automations · Links and QR"): an ig.me / m.me link with a
// `ref` code opens a chat and starts a chat flow whose trigger is that referral
// (docs.zernio.com/guides/manychat-patterns#ref-link-to-a-workflow). The QR code is drawn by
// Waggle; Zernio has none.

export const LINK_PLATFORMS = new Set(["instagram", "facebook"]);

/** A link code: lowercase letters, digits and dashes, up to 40. */
export function linkCode(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/** Meta's chat links: ig.me/m/<username> and m.me/<page>. */
export function chatLink(platform: string, handle: string, code: string): string {
  const h = handle.trim().replace(/^@/, "");
  return platform === "instagram"
    ? `https://ig.me/m/${encodeURIComponent(h)}?ref=${encodeURIComponent(code)}`
    : `https://m.me/${encodeURIComponent(h)}?ref=${encodeURIComponent(code)}`;
}

/** A flow made by the Links tab keeps its link as its description. */
export const isChatLink = (s: string) => /^https:\/\/(ig\.me\/m|m\.me)\//.test(s);

/** A Facebook Page's handle from what the owner typed, or null when it's a name, not a handle. */
export function pageHandle(value: string | null): string | null {
  if (!value) return null;
  const h = value
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/^(www\.)?(facebook\.com|m\.me)\//, "")
    .replace(/\/+$/, "")
    .replace(/^@/, "");
  return /^[A-Za-z0-9.\-_]{3,80}$/.test(h) ? h : null;
}
