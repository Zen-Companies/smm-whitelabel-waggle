/** Pure: has this person been answered yet? (design v2, Leads "Status"). */
export function leadReplied(itemStatus: string): boolean {
  return itemStatus === "sent" || itemStatus === "handled";
}

export function leadStatusText(itemStatus: string): string {
  if (leadReplied(itemStatus)) return "Replied";
  if (itemStatus === "awaiting_approval") return "Reply waiting for you";
  if (itemStatus === "escalated" || itemStatus === "failed") return "For you";
  return "Reply being written";
}

/** A tel: link when the contact looks like a phone number, else null. */
export function phoneHref(contact: string | null): string | null {
  if (!contact) return null;
  const digits = contact.replace(/[^\d+]/g, "");
  if (contact.includes("@") || digits.replace("+", "").length < 7) return null;
  return `tel:${digits}`;
}
