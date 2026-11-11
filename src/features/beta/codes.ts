import { randomInt } from "node:crypto";

// Beta codes: generated ones look like WAGGLE-7K2P (no 0/O or 1/I, which people misread);
// typed ones are letters, numbers and dashes. Pure, so it is unit tested.

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateBetaCode(prefix = "WAGGLE", length = 4): string {
  let tail = "";
  for (let i = 0; i < length; i++) tail += ALPHABET[randomInt(ALPHABET.length)];
  return `${prefix}-${tail}`;
}

/** A typed code, cleaned: capitals, no spaces. Null when it can't be a code. */
export function normalizeBetaCode(raw: string): string | null {
  const code = raw.trim().toUpperCase().replace(/\s+/g, "");
  return /^[A-Z0-9][A-Z0-9-]{2,31}$/.test(code) ? code : null;
}

export type RedeemStatus =
  "ok" | "already" | "not_found" | "used_up" | "expired" | "off" | "too_many";

export const REDEEM_ERRORS: Record<Exclude<RedeemStatus, "ok" | "already">, string> = {
  not_found: "That code doesn't exist. Check the spelling in your invitation email.",
  used_up: "This code has been used up. Ask whoever sent it for a new one.",
  expired: "This code has expired. Ask whoever sent it for a new one.",
  off: "This code was turned off. Ask whoever sent it for a new one.",
  too_many: "Too many tries. Wait 15 minutes, then try again.",
};
