import type { ImessageSenderView } from "@/lib/social/types";

// iMessage (T83c, design "Settings · Messaging"): a dedicated Apple-registered number per brand,
// US or UK, $200 a month. docs.zernio.com/platforms/imessage, /connect, /pricing, /new-contacts.
// Only the `imessage:` opt-in link is used: the provider's hosted pages carry its name.

export const IMESSAGE_MONTHLY_CENTS = 20_000;
export const IMESSAGE_REGIONS = { US: "US number", GB: "UK number" } as const;
export type ImessageRegion = keyof typeof IMESSAGE_REGIONS;

/** New conversations a sender may open per day while it warms up (new-contacts docs). */
export const WARM_UP = [
  { days: "Days 1–2", perDay: 2 },
  { days: "Days 3–4", perDay: 5 },
  { days: "Days 5–7", perDay: 10 },
  { days: "Days 8–14", perDay: 20 },
  { days: "Days 15–21", perDay: 30 },
  { days: "After 3 weeks", perDay: 50 },
] as const;

export const SENDER_STATUS: Record<ImessageSenderView["status"], string> = {
  ordering: "Ordering",
  awaiting_payment: "Ordering",
  activating: "Turning on",
  active: "Ready",
  suspended: "Paused",
  canceled: "Canceled",
  failed: "Couldn't be ordered",
};

/** The brand's number: the live one, else the latest failed one (for its reason). */
export function currentSender(senders: ImessageSenderView[]): ImessageSenderView | null {
  return senders.find((s) => s.status !== "failed") ?? senders[0] ?? null;
}

/** A brand has one number; a failed order can be tried again. */
export const holdsNumber = (senders: ImessageSenderView[]) =>
  senders.some((s) => s.status !== "failed" && s.status !== "canceled");

type Bad = { ok: false; field: string; error: string };
const val = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

/** The contact card people see when they save the number: the business name, as a first name. */
export function contactOf(name: string): { firstName: string; lastName?: string } {
  const clean = name.replace(/\s+/g, " ").trim().slice(0, 60);
  return { firstName: clean };
}

export function parseOrder(f: FormData):
  | {
      ok: true;
      value: {
        region: ImessageRegion;
        availableNumberId?: string;
        zipCode?: string;
        cardName: string;
      };
    }
  | Bad {
  const region = val(f, "region");
  if (region !== "US" && region !== "GB")
    return { ok: false, field: "region", error: "Pick a US or UK number." };
  if (f.get("agree") !== "yes") {
    return {
      ok: false,
      field: "agree",
      error: "Tick to confirm the $200 a month before ordering.",
    };
  }
  const cardName = val(f, "cardName");
  if (cardName.length < 2 || cardName.length > 60)
    return {
      ok: false,
      field: "cardName",
      error: "Add the name people see when they save the number.",
    };
  const pick = val(f, "availableNumberId");
  const zip = val(f, "zipCode");
  if (pick && pick !== "any")
    return { ok: true, value: { region, availableNumberId: pick, cardName } };
  if (zip && (region !== "US" || !/^\d{5}$/.test(zip)))
    return { ok: false, field: "zipCode", error: "Use a 5-digit US ZIP, or leave it empty." };
  return { ok: true, value: { region, ...(zip ? { zipCode: zip } : {}), cardName } };
}

/** The opt-in link with the brand's own first message, for sharing (a QR code, a website). */
export function optInLinkWith(link: string, text: string): string {
  try {
    const u = new URL(link);
    u.searchParams.set("body", text);
    return u.toString();
  } catch {
    return link;
  }
}
