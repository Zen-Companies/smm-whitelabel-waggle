import { emailOk, phoneOk, type KnownFact } from "./chat-fields";

// The replica's fix editors in step 3's chat (24 Nov, copied from the replica's train-chat):
// address with a landmark, contact as phone and email, one answer, and the "update my hours
// answer too?" offer after new hours. How their values are split for the fields and joined back
// into the one line the fact keeps. Pure, tested.

/** "12 Mabini St (Across from the church)": the address and its landmark. */
export function splitAddress(value: string): { address: string; landmark: string } {
  const m = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(value);
  return m ? { address: m[1], landmark: m[2] } : { address: value, landmark: "" };
}

export function joinAddress(address: string, landmark: string): string {
  const a = address.trim();
  const l = landmark.trim();
  return `${a}${l ? ` (${l})` : ""}`;
}

const SPLIT = /\s*(?:,|;|·|\||\bor\b|\band\b)\s*/i;
const WORDS =
  /^(?:(?:call|text|phone|tel|mobile|email|e-mail|mail|viber|whatsapp|us|on|at|or)\b[\s:]*|:\s*)+/i;

/**
 * The contact line as the editor's Phone and Email; anything else in it (a website, "DM us on
 * Instagram") is kept as it was and saved back after them.
 */
export function splitContact(value: string): { phone: string; email: string; rest: string[] } {
  let phone = "";
  let email = "";
  const rest: string[] = [];
  for (const raw of value.split(SPLIT)) {
    const part = raw.trim();
    if (!part) continue;
    const bare = part.replace(WORDS, "").replace(/[.,]$/, "").trim();
    if (!email && bare.includes("@") && emailOk(bare)) email = bare;
    else if (!phone && !bare.includes("@") && !/https?:\/\/|www\./i.test(bare) && phoneOk(bare))
      phone = bare;
    else rest.push(part);
  }
  return { phone, email, rest };
}

export function joinContact(phone: string, email: string, rest: readonly string[] = []): string {
  return [phone.trim(), email.trim(), ...rest].filter(Boolean).join(" · ");
}

/** What's wrong with the contact editor's fields, in our words (null: fine). */
export function contactProblem(phone: string, email: string): string | null {
  const p = phone.trim();
  const e = email.trim();
  if (!p && !e) return "Add a phone number or an email.";
  if (p && !phoneOk(p)) return "That phone number doesn’t look right.";
  if (e && !emailOk(e)) return "That email doesn’t look right.";
  return null;
}

/** The owner's bubble after a save: "✓ Address: 12 Mabini St". */
export const savedBubble = (label: string, value: string): string => `✓ ${label}: ${value}`;

/** The answer that tells customers the hours (the replica's /\b(open|hours?)\b/ on its question). */
export function hoursAnswerOf(known: readonly KnownFact[]): KnownFact | null {
  return known.find((k) => k.field === "answer" && /\b(open|hours?)\b/i.test(k.label)) ?? null;
}

/** Waggle's line after a fix: in the facts, the replica's "Anything else?" follows. */
export const anythingElse = (line: string, inFacts: boolean): string =>
  inFacts ? `${line} Anything else?` : line;
