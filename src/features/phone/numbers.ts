import type { PhoneCountry, PhoneNumberType } from "@/lib/social/types";

// Phone (T82a, designs "Settings · Phone"). User decisions (13 Nov): staff switch Phone on per
// brand until billing exists (numbers, calls and texts bill our account); only countries and
// types that need no ID check; one number per brand.

export const PHONE_FLAG = "phone";

export type NumberOption = {
  country: string;
  numberType: PhoneNumberType;
  monthlyCents: number;
  sms: boolean;
};

const TYPE_LABEL: Record<PhoneNumberType, string> = {
  local: "Local",
  mobile: "Mobile",
  national: "National",
  toll_free: "Toll-free",
};
export const typeLabel = (t: string) => TYPE_LABEL[t as PhoneNumberType] ?? t;

/** What a brand may buy: calls available, in stock, handed over at once, and no ID check. */
export function numberOptions(countries: PhoneCountry[]): NumberOption[] {
  return countries
    .flatMap((c) =>
      c.types
        .filter((t) => t.callsAvailable && t.inStock && t.instant && !t.needsKyc)
        .map((t) => ({
          country: c.code,
          numberType: t.numberType,
          monthlyCents: t.monthlyCents,
          sms: t.smsAvailable,
        })),
    )
    .sort((a, b) => {
      const rank = (c: string) => (c === "US" ? 0 : 1);
      return rank(a.country) - rank(b.country) || a.country.localeCompare(b.country);
    });
}

export const monthly = (cents: number) =>
  `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}/month`;

/** "+14155550142" → "(415) 555-0142" for US/CA numbers; others keep their + form. */
export function displayNumber(e164: string): string {
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The Choose form: one of the offered options, a number in E.164, and the purchase key. */
export function parsePurchase(
  f: FormData,
  options: NumberOption[],
):
  | { ok: true; value: { option: NumberOption; phoneNumber: string; purchaseIntentId: string } }
  | { ok: false; error: string } {
  const option = options.find(
    (o) => o.country === f.get("country") && o.numberType === f.get("numberType"),
  );
  if (!option) return { ok: false, error: "That kind of number isn't available. Search again." };
  const phoneNumber = String(f.get("phoneNumber") ?? "");
  if (!/^\+\d{6,15}$/.test(phoneNumber))
    return { ok: false, error: "Pick a number from the list." };
  const purchaseIntentId = String(f.get("purchaseIntentId") ?? "");
  if (!UUID.test(purchaseIntentId)) return { ok: false, error: "Reload the page and try again." };
  return { ok: true, value: { option, phoneNumber, purchaseIntentId } };
}
