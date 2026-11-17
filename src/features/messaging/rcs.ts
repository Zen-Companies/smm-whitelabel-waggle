import type { RcsAgentStatus, RcsAgentView } from "@/lib/social/types";

// RCS branded texts (T83a, design "Settings · Messaging"): Waggle's own request form, filed with
// the brand's own company (never a brand reused across the team: brands are team-wide upstream).
// docs.zernio.com/platforms/rcs and /platforms/rcs/connect.

export const RCS_COUNTRIES = {
  US: "United States",
  GB: "United Kingdom",
  AT: "Austria",
  BD: "Bangladesh",
  BR: "Brazil",
  CD: "DR Congo",
  FR: "France",
  DE: "Germany",
  IN: "India",
  IT: "Italy",
  MX: "Mexico",
  NL: "Netherlands",
  NG: "Nigeria",
  NO: "Norway",
  PT: "Portugal",
  SG: "Singapore",
  ZA: "South Africa",
  ES: "Spain",
  SE: "Sweden",
} as const;
export type RcsCountry = keyof typeof RCS_COUNTRIES;

export const LEGAL_ENTITY_TYPES = {
  LIMITED_LIABILITY_COMPANY: "LLC",
  CORPORATION: "Corporation",
  S_CORPORATION: "S corporation",
  PARTNERSHIP: "Partnership",
  SOLE_PROPRIETORSHIP: "Sole proprietor",
} as const;

export const ORGANIZATION_TYPES = {
  PRIVATE_PROFIT: "Private company",
  PUBLIC_PROFIT: "Public company",
  NON_PROFIT: "Non-profit",
  GOVERNMENT: "Government",
} as const;

/** What the owner will send; OTP (login codes) isn't something Waggle brands send. */
export const RCS_USE_CASES = {
  MULTI_USE: "Updates and offers",
  TRANSACTIONAL: "Updates only (orders, bookings, reminders)",
  PROMOTIONAL: "Offers only",
} as const;

export const RCS_PRICES = {
  setupCents: 15_000,
  usApprovalCents: 75_000,
  monthlyUsCents: 16_000,
  monthlyElsewhereCents: 7_500,
} as const;

/** Fees set aside on the prepaid balance when requesting (docs: $1,060 US, $225 elsewhere). */
export const upfrontCents = (country: string) =>
  country === "US"
    ? RCS_PRICES.setupCents + RCS_PRICES.usApprovalCents + RCS_PRICES.monthlyUsCents
    : RCS_PRICES.setupCents + RCS_PRICES.monthlyElsewhereCents;

export const MAX_IMAGE_BYTES = 2_500_000;
export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

// --- Steps ---------------------------------------------------------------------------------

const US_STEPS = [
  { label: "Request sent", statuses: ["requested", "changes_requested"] },
  { label: "Business check", statuses: ["brand_vetting"] },
  { label: "Agent review", statuses: ["agent_review"] },
  { label: "Testing on your phone", statuses: ["testing"] },
  { label: "Launch review", statuses: ["launch_review", "launching"] },
  { label: "Live", statuses: ["live"] },
] as const;
const OTHER_STEPS = [
  { label: "Request sent", statuses: ["requested", "changes_requested"] },
  { label: "Business check", statuses: ["brand_vetting"] },
  { label: "Carrier review", statuses: ["launching"] },
  { label: "Live", statuses: ["live"] },
] as const;

export type RcsStep = { label: string; state: "done" | "now" | "next" };

/** The progress steps for an agent; US agents add testing and launch review. */
export function rcsSteps(country: string | null, status: RcsAgentStatus): RcsStep[] {
  const steps = country === "US" || !country ? US_STEPS : OTHER_STEPS;
  const at = steps.findIndex((s) => (s.statuses as readonly string[]).includes(status));
  return steps.map((s, i) => ({
    label: s.label,
    state: status === "live" || i < at ? "done" : i === at ? "now" : "next",
  }));
}

/** The brand's agent to show: the open one, else the latest closed one (for its reason). */
export function currentAgent(agents: RcsAgentView[]): RcsAgentView | null {
  return (
    agents.find((a) => a.status !== "rejected" && a.status !== "deactivated") ?? agents[0] ?? null
  );
}

export const isClosed = (a: RcsAgentView) => a.status === "rejected" || a.status === "deactivated";

/** Only before the details reach the carriers can the request be changed. */
export const canFix = (a: RcsAgentView) => a.status === "changes_requested";

// --- Colour ----------------------------------------------------------------------------------

/** WCAG contrast of a #RRGGBB colour against white (carriers need 4.5:1). */
export function contrastOnWhite(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return 0;
  const n = parseInt(m[1], 16);
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const l = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return 1.05 / (l + 0.05);
}

// --- The request form ------------------------------------------------------------------------

type Bad = { ok: false; field: string; error: string };
const val = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const e164 = (raw: string) => {
  const digits = raw.replace(/[\s().-]/g, "");
  return /^\+\d{8,15}$/.test(digits) ? digits : null;
};
const https = (raw: string) => /^https:\/\/[^\s/]+\.[^\s]+$/.test(raw);
const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
};

const FREE_MAIL =
  /@(gmail|googlemail|yahoo|ymail|hotmail|outlook|live|msn|icloud|me|mac|aol|proton|protonmail|gmx|mail|yandex|zoho)\.[a-z]{2,3}(\.[a-z]{2})?$/i;
const GROUP_MAIL =
  /^(info|support|hello|contact|sales|admin|team|office|help|enquiries|inquiries|noreply|no-reply)@/i;

export type RcsRequest = {
  brand: Record<string, unknown>;
  displayName: string;
  useCase: keyof typeof RCS_USE_CASES;
  /** The public profile without the logo and banner (uploaded separately). */
  profile: Record<string, unknown>;
};

/** Validates the request form (T83a). Field names match the form's inputs. */
export function parseRcsRequest(f: FormData): { ok: true; value: RcsRequest } | Bad {
  // The company carriers check.
  const legalName = val(f, "legalName").slice(0, 200);
  if (!legalName)
    return {
      ok: false,
      field: "legalName",
      error: "Add the legal company name, exactly as registered.",
    };
  const legalEntityType = val(f, "legalEntityType");
  if (!(legalEntityType in LEGAL_ENTITY_TYPES))
    return { ok: false, field: "legalEntityType", error: "Pick the kind of company." };
  const organizationType = val(f, "organizationType");
  if (!(organizationType in ORGANIZATION_TYPES))
    return { ok: false, field: "organizationType", error: "Pick the kind of organization." };
  const country = val(f, "country");
  if (!(country in RCS_COUNTRIES))
    return { ok: false, field: "country", error: "Pick the country of the company's address." };
  const us = country === "US";
  let taxId = val(f, "taxId");
  if (us) {
    if (!/^\d{2}-?\d{7}$/.test(taxId))
      return { ok: false, field: "taxId", error: "The EIN has 9 digits, like 12-3456789." };
    taxId = taxId.includes("-") ? taxId : `${taxId.slice(0, 2)}-${taxId.slice(2)}`;
  } else if (!taxId || taxId.length > 40) {
    return { ok: false, field: "taxId", error: "Add the company's tax or registration number." };
  }
  const stockSymbol = val(f, "stockSymbol").toUpperCase();
  if (organizationType === "PUBLIC_PROFIT" && !/^[A-Z]{2,10}:[A-Z0-9.]{1,10}$/.test(stockSymbol)) {
    return { ok: false, field: "stockSymbol", error: "Add the stock symbol, like NASDAQ:ACME." };
  }
  const websiteUrl = val(f, "websiteUrl");
  if (!https(websiteUrl))
    return {
      ok: false,
      field: "websiteUrl",
      error: "Add the company website, starting with https://.",
    };
  const line1 = val(f, "line1");
  if (!line1) return { ok: false, field: "line1", error: "Add the street address." };
  const line2 = val(f, "line2");
  const city = val(f, "city");
  if (!city) return { ok: false, field: "city", error: "Add the city." };
  const state = val(f, "state").toUpperCase();
  if (us && !/^[A-Z]{2}$/.test(state))
    return { ok: false, field: "state", error: "Use the 2-letter state, like CA." };
  const postalCode = val(f, "postalCode");
  if (us ? !/^\d{5}(-\d{4})?$/.test(postalCode) : !postalCode)
    return {
      ok: false,
      field: "postalCode",
      error: us ? "Use the 5-digit ZIP." : "Add the postal code.",
    };

  // A named person at the company (carriers reject free-mail and shared inboxes).
  const firstName = val(f, "firstName");
  const lastName = val(f, "lastName");
  if (!firstName || !lastName)
    return {
      ok: false,
      field: "contactName",
      error: "Add the first and last name of a person at the company.",
    };
  const email = val(f, "contactEmail").toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return { ok: false, field: "contactEmail", error: "Add their work email." };
  if (FREE_MAIL.test(email) || GROUP_MAIL.test(email)) {
    return {
      ok: false,
      field: "contactEmail",
      error: "Carriers need a person's own email on the company's domain, not Gmail or info@.",
    };
  }
  const site = hostOf(websiteUrl);
  const mailDomain = email.split("@")[1];
  if (
    site &&
    mailDomain !== site &&
    !mailDomain.endsWith(`.${site}`) &&
    !site.endsWith(`.${mailDomain}`)
  ) {
    return {
      ok: false,
      field: "contactEmail",
      error: `Use an email on the website's domain (${site}).`,
    };
  }
  const contactPhone = e164(val(f, "contactPhone"));
  if (!contactPhone)
    return {
      ok: false,
      field: "contactPhone",
      error: "Add their phone with the country code, like +1 415 555 0142.",
    };
  const title = val(f, "contactTitle").slice(0, 80);

  // The sender customers see.
  const displayName = val(f, "displayName");
  if (!displayName || displayName.length > 40)
    return {
      ok: false,
      field: "displayName",
      error: "Add the name customers see, up to 40 characters.",
    };
  const description = val(f, "description");
  if (!description || description.length > 100)
    return {
      ok: false,
      field: "description",
      error: "Add a short description, up to 100 characters.",
    };
  const useCase = val(f, "useCase");
  if (!(useCase in RCS_USE_CASES))
    return { ok: false, field: "useCase", error: "Pick what you'll send." };
  const brandColor = val(f, "brandColor").toUpperCase();
  if (!/^#[0-9A-F]{6}$/.test(brandColor))
    return { ok: false, field: "brandColor", error: "Pick a brand color." };
  if (contrastOnWhite(brandColor) < 4.5)
    return {
      ok: false,
      field: "brandColor",
      error: "That color is too light to read on white. Pick a darker one.",
    };
  const privacyPolicyUrl = val(f, "privacyPolicyUrl");
  if (!https(privacyPolicyUrl))
    return {
      ok: false,
      field: "privacyPolicyUrl",
      error: "Add your privacy policy link, starting with https://.",
    };
  const termsUrl = val(f, "termsUrl");
  if (!https(termsUrl))
    return { ok: false, field: "termsUrl", error: "Add your terms link, starting with https://." };

  const profile: Record<string, unknown> = {
    description,
    brandColor,
    privacyPolicyUrl,
    termsUrl,
  };
  const callRaw = val(f, "buttonPhone");
  if (callRaw) {
    const number = e164(callRaw);
    if (!number)
      return { ok: false, field: "buttonPhone", error: "Add the phone with the country code." };
    profile.phone = { number, label: "Call us" };
  }
  const mailRaw = val(f, "buttonEmail").toLowerCase();
  if (mailRaw) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mailRaw))
      return { ok: false, field: "buttonEmail", error: "That email doesn't look right." };
    profile.email = { address: mailRaw, label: "Email us" };
  }
  if (!profile.phone && !profile.email)
    return {
      ok: false,
      field: "buttonPhone",
      error: "Add a phone or an email customers can reach you on.",
    };
  profile.website = { url: websiteUrl, label: "Website" };

  const address: Record<string, unknown> = { line1, city, postalCode, country };
  if (line2) address.line2 = line2;
  if (us) address.state = state;
  const contact: Record<string, unknown> = { firstName, lastName, email, phone: contactPhone };
  if (title) contact.title = title;
  const brand: Record<string, unknown> = {
    displayName,
    legalName,
    legalEntityType,
    organizationType,
    websiteUrl,
    taxId,
    address,
    contact,
  };
  if (organizationType === "PUBLIC_PROFIT") brand.stockSymbol = stockSymbol;

  return {
    ok: true,
    value: { brand, displayName, useCase: useCase as RcsRequest["useCase"], profile },
  };
}

/** A logo or banner from the form: an image the partner can crop, small enough to send on. */
export function checkImage(file: FormDataEntryValue | null): File | null | "bad" {
  if (!(file instanceof File) || file.size === 0) return null;
  if (!(IMAGE_TYPES as readonly string[]).includes(file.type) || file.size > MAX_IMAGE_BYTES)
    return "bad";
  return file;
}

/** Form values from what was filed, for the fix-and-resend form. */
export function filedDefaults(agent: RcsAgentView): Record<string, string> {
  const s = (v: unknown) => (typeof v === "string" ? v : "");
  const o = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
  const b = o(agent.filed.brand);
  const p = o(agent.filed.profile);
  const address = o(b.address);
  const contact = o(b.contact);
  return {
    displayName: agent.displayName,
    useCase: agent.useCase ?? "",
    description: s(p.description),
    brandColor: s(p.brandColor),
    privacyPolicyUrl: s(p.privacyPolicyUrl),
    termsUrl: s(p.termsUrl),
    buttonPhone: s(o(p.phone).number),
    buttonEmail: s(o(p.email).address),
    legalName: s(b.legalName),
    legalEntityType: s(b.legalEntityType),
    organizationType: s(b.organizationType),
    stockSymbol: s(b.stockSymbol),
    country: s(address.country) || agent.country || "",
    taxId: s(b.taxId),
    websiteUrl: s(b.websiteUrl),
    line1: s(address.line1),
    line2: s(address.line2),
    city: s(address.city),
    state: s(address.state),
    postalCode: s(address.postalCode),
    firstName: s(contact.firstName),
    lastName: s(contact.lastName),
    contactTitle: s(contact.title),
    contactEmail: s(contact.email),
    contactPhone: s(contact.phone),
  };
}
