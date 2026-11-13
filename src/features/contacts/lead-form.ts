import { CONSENT_KEY } from "@/lib/social/lead-consent";
import { normalizePhone } from "./contact-form";

export { CONSENT_KEY, leadConsented } from "@/lib/social/lead-consent";

// Ad lead forms (T78c, design "Contacts · Leads from ad lead forms"): a form shown inside a
// Facebook or Instagram ad (`POST /v1/ads/lead-forms`, made on the Facebook Page). Each form
// carries an optional, unticked "messages" box: a lead counts as agreeing to messages only
// when they ticked it (consent is never assumed).

const STANDARD = ["FULL_NAME", "EMAIL", "PHONE"] as const;

export type LeadFormInput = {
  name: string;
  /** The Facebook Page account (Zernio id). */
  accountId: string;
  questions: (typeof STANDARD)[number][];
  /** The owner's own short-answer questions. */
  custom: string[];
  privacyPolicyUrl: string;
  thankYou: string;
  verifyPhone: boolean;
};

export function parseLeadForm(
  f: FormData,
): { ok: true; value: LeadFormInput } | { ok: false; field: string; error: string } {
  const name = String(f.get("name") ?? "").trim();
  if (!name) return { ok: false, field: "name", error: "Give the form a name." };
  const accountId = String(f.get("accountId") ?? "");
  if (!accountId) return { ok: false, field: "accountId", error: "Connect your Facebook Page first." };
  const questions = STANDARD.filter((q) => f.get(`q_${q}`) === "yes");
  if (!questions.includes("EMAIL") && !questions.includes("PHONE")) {
    return { ok: false, field: "questions", error: "Ask for an email or a phone number, so you can reach them." };
  }
  const custom = String(f.get("custom") ?? "")
    .split("\n")
    .map((s) => s.trim().slice(0, 80))
    .filter(Boolean)
    .slice(0, 10);
  const privacyPolicyUrl = String(f.get("privacyPolicyUrl") ?? "").trim();
  if (!/^https:\/\/\S+\.\S+/.test(privacyPolicyUrl)) {
    return { ok: false, field: "privacyPolicyUrl", error: "Meta needs a link to your privacy policy that starts with https://." };
  }
  return {
    ok: true,
    value: {
      name: name.slice(0, 100),
      accountId,
      questions,
      custom,
      privacyPolicyUrl,
      thankYou: String(f.get("thankYou") ?? "").trim().slice(0, 300) || "Thanks! We'll be in touch soon.",
      verifyPhone: f.get("verifyPhone") === "yes" && questions.includes("PHONE"),
    },
  };
}

/** The createLeadForm body (Meta shape, `platformSpecificData`). */
export function toLeadFormBody(v: LeadFormInput, businessName: string) {
  return {
    accountId: v.accountId,
    name: v.name,
    privacyPolicyUrl: v.privacyPolicyUrl,
    platformSpecificData: {
      questions: [
        ...v.questions.map((type) => ({ type })),
        ...v.custom.map((label, i) => ({ type: "CUSTOM", key: `q${i + 1}`, label })),
      ],
      thankYouTitle: "Thank you!",
      thankYouBody: v.thankYou,
      isPhoneSmsVerifyEnabled: v.verifyPhone,
      customDisclaimer: {
        title: "Messages",
        body: `${businessName} may reply to you about this request.`,
        checkboxes: [
          {
            key: CONSENT_KEY,
            text: `I agree to get messages from ${businessName} on WhatsApp.`,
            isRequired: false,
            isCheckedByDefault: false,
          },
        ],
      },
    },
  };
}

/** Name, email and phone from a lead's answers (Meta's field keys). */
export function leadContact(fields: Record<string, string>): { name: string; email?: string; phone?: string } {
  const get = (...keys: string[]) => keys.map((k) => fields[k]?.trim()).find(Boolean);
  const name =
    get("full_name", "name") ?? [get("first_name"), get("last_name")].filter(Boolean).join(" ");
  const phoneRaw = get("phone_number", "phone");
  return {
    name: name || "Lead",
    email: get("email"),
    phone: phoneRaw ? (normalizePhone(phoneRaw) ?? undefined) : undefined,
  };
}
