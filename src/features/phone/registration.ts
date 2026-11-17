// US texting registration (T82c, design "Texting (US)"): carriers must approve the business
// before its number can send. Waggle's own form (the partner's hosted form is on its domain):
// a company (10DLC, needs an EIN) or a sole proprietor (a code goes to the owner's mobile).
// Toll-free verification needs an opt-in screenshot upload; it comes later.

export const ENTITY_TYPES = {
  PRIVATE_PROFIT: "Private company",
  PUBLIC_PROFIT: "Public company",
  NON_PROFIT: "Non-profit",
} as const;

export const VERTICALS = {
  HOSPITALITY: "Food, drink and hospitality",
  RETAIL: "Shop or retail",
  HEALTHCARE: "Health and wellness",
  PROFESSIONAL: "Professional services",
  REAL_ESTATE: "Real estate",
  EDUCATION: "Education",
  ENTERTAINMENT: "Entertainment and events",
  CONSTRUCTION: "Construction and home services",
  TRANSPORTATION: "Transport",
  TECHNOLOGY: "Technology",
} as const;

export const USECASES = {
  CUSTOMER_CARE: "Answering customers (questions, bookings, orders)",
  ACCOUNT_NOTIFICATION: "Updates about their orders and bookings",
  MARKETING: "Offers and promotions",
} as const;

type Bad = { ok: false; field: string; error: string };
const val = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const phone = (raw: string) => {
  const digits = raw.replace(/[\s().-]/g, "");
  return /^\+\d{8,15}$/.test(digits) ? digits : null;
};
const https = (raw: string) => /^https:\/\/\S+\.\S+/.test(raw);

export function parseRegistration(
  f: FormData,
  phoneNumber: string,
): { ok: true; kind: "company" | "sole"; body: Record<string, unknown> } | Bad {
  const kind = val(f, "kind") === "sole" ? "sole" : "company";
  const displayName = val(f, "displayName").slice(0, 100);
  if (!displayName)
    return { ok: false, field: "displayName", error: "Add the name customers know you by." };

  const brand: Record<string, unknown> = { displayName };
  if (kind === "company") {
    const companyName = val(f, "companyName").slice(0, 100);
    if (!companyName)
      return { ok: false, field: "companyName", error: "Add the legal company name." };
    const ein = val(f, "ein");
    if (!/^\d{2}-?\d{7}$/.test(ein)) {
      return { ok: false, field: "ein", error: "The EIN has 9 digits, like 12-3456789." };
    }
    const entityType = val(f, "entityType");
    if (!(entityType in ENTITY_TYPES))
      return { ok: false, field: "entityType", error: "Pick the kind of business." };
    const businessPhone = phone(val(f, "businessPhone"));
    if (!businessPhone) {
      return {
        ok: false,
        field: "businessPhone",
        error: "Add the business phone with the country code.",
      };
    }
    Object.assign(brand, {
      entityType,
      companyName,
      ein: ein.includes("-") ? ein : `${ein.slice(0, 2)}-${ein.slice(2)}`,
      phone: businessPhone,
    });
  } else {
    const mobilePhone = phone(val(f, "mobilePhone"));
    if (!mobilePhone) {
      return {
        ok: false,
        field: "mobilePhone",
        error: "Add your mobile number: a code is texted to it.",
      };
    }
    Object.assign(brand, { entityType: "SOLE_PROPRIETOR", mobilePhone });
  }

  const website = val(f, "website");
  if (!https(website)) {
    return {
      ok: false,
      field: "website",
      error: "Add your website or social page, starting with https://.",
    };
  }
  const street = val(f, "street");
  if (!street) return { ok: false, field: "street", error: "Add the street address." };
  const city = val(f, "city");
  if (!city) return { ok: false, field: "city", error: "Add the city." };
  const state = val(f, "state").toUpperCase();
  if (!/^[A-Z]{2}$/.test(state))
    return { ok: false, field: "state", error: "Use the 2-letter state, like CA." };
  const postalCode = val(f, "postalCode");
  if (!/^\d{5}(-\d{4})?$/.test(postalCode))
    return { ok: false, field: "postalCode", error: "Use the 5-digit ZIP." };
  const vertical = val(f, "vertical");
  if (!(vertical in VERTICALS))
    return { ok: false, field: "vertical", error: "Pick what the business does." };
  Object.assign(brand, { street, city, state, postalCode, country: "US", website, vertical });

  const usecase = val(f, "usecase");
  if (!(usecase in USECASES))
    return { ok: false, field: "usecase", error: "Pick what you'll text about." };
  const optInPage = val(f, "optInPage");
  if (!https(optInPage)) {
    return {
      ok: false,
      field: "optInPage",
      error: "Carriers need the page where people agree to texts, starting with https://.",
    };
  }
  const sample1 = val(f, "sample1");
  const sample2 = val(f, "sample2");
  if (sample1.length < 20)
    return { ok: false, field: "sample1", error: "Write a real example, at least 20 characters." };
  if (sample2.length < 20 || sample2 === sample1) {
    return {
      ok: false,
      field: "sample2",
      error: "Write a second, different example of 20+ characters.",
    };
  }

  return {
    ok: true,
    kind,
    body: {
      registrationType: kind === "company" ? "standard_10dlc" : "sole_prop_10dlc",
      phoneNumbers: [phoneNumber],
      brand,
      campaign: {
        usecase,
        description: `${displayName} answers customers who text its number: questions, bookings and orders.`,
        messageFlow: `Customers text ${displayName} first, or opt in on ${optInPage}. Replies only go to people who texted or opted in.`,
        sample1: sample1.slice(0, 1000),
        sample2: sample2.slice(0, 1000),
        optinKeywords: "START",
        optoutKeywords: "STOP",
        helpKeywords: "HELP",
      },
    },
  };
}
