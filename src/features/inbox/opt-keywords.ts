// Texting channels (SMS, RCS, iMessage) handle STOP and START themselves: the contact is opted
// out or back in upstream (docs.zernio.com/platforms/imessage/opt-in, /platforms/rcs/inbox).
// Those messages aren't questions, so they never become inbox items to answer.

const TEXTING = new Set(["sms", "rcs", "imessage"]);
const KEYWORDS = new Set([
  "STOP",
  "STOPALL",
  "UNSUBSCRIBE",
  "CANCEL",
  "END",
  "QUIT",
  "START",
  "UNSTOP",
  "SUBSCRIBE",
]);

export function isOptKeyword(platform: string, text: string | null | undefined): boolean {
  if (!TEXTING.has(platform)) return false;
  const word = (text ?? "")
    .trim()
    .replace(/[.!]+$/, "")
    .toUpperCase();
  return KEYWORDS.has(word);
}
