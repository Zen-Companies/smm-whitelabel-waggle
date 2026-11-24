// The CRM contract (Walter's "Waggle GHL Tags" page, API path, 18 Nov). Change events and fields
// HERE: everything else reads this file. Pure, no I/O.

/** Every event Waggle sends, and what starts it in the app. */
export const CRM_EVENTS = {
  signed_up:
    "A new login (no plan yet): fields + first-touch UTMs, waggle-app-event and waggle-signup",
  feedback: "Send feedback (a note on the contact only: no fields, no tag)",
  page_rating: "A page rating, or its reason (a note on the contact only)",
  trial_started: "Stripe: a subscription starts with a trial",
  account_connected: "The organization's first social account is connected",
  first_reply_approved:
    "The organization's first approved Waggle draft (the step most likely to lead to paying, 19 Nov)",
  business_info_saved: "A business profile is saved for the first time",
  trial_converted: "Stripe: the first payment goes through (trial over, or no trial)",
  plan_changed: "Stripe: the subscription moves to another plan",
  payment_failed: "Stripe: a payment fails (subscription becomes past due)",
  payment_recovered: "Stripe: a past-due subscription is paid",
  canceled: "Stripe: the owner cancels (details.after_paying says which email)",
  trial_expired: "Stripe: the subscription ends without ever being paid",
  inactive: "Daily check: no visit for 2 days",
  app_active: "The first visit after `inactive`",
  usage_80: "AI replies reach 80% of the month's allowance",
  usage_100: "AI replies reach 100%",
  account_limit: "A connect is blocked: the plan's accounts are all in use",
  founding_full: "The 50th founding spot is taken",
  connect_failed:
    "A connect failed, came back with no account, or was abandoned (2 h, no return); once per brand + platform per 6 h",
} as const;

export type CrmEvent = keyof typeof CRM_EVENTS;
export const isCrmEvent = (v: unknown): v is CrmEvent =>
  typeof v === "string" && Object.hasOwn(CRM_EVENTS, v);

/** Events that only add a note to the contact: no fields, no trigger tag, no workflow. */
export const CRM_NOTE_ONLY: ReadonlySet<CrmEvent> = new Set<CrmEvent>(["feedback", "page_rating"]);

/** Extra tags an event adds next to the trigger tag (18 Nov: Walter's workflow starts on the trigger). */
export const CRM_EXTRA_TAGS: Partial<Record<CrmEvent, string>> = { signed_up: "waggle-signup" };

/** HighLevel's workflow starts on this tag, reads `waggle_event`, tags the contact, clears it. */
export const CRM_TRIGGER_TAG = "waggle-app-event";

/**
 * The contact fields sent on EVERY event (Walter's rule: always every field, never empty
 * founding). Keys are HighLevel's, without the `contact.` prefix.
 */
export const CRM_FIELDS = [
  "waggle_event",
  "waggle_event_at",
  "waggle_plan",
  "waggle_from_plan",
  "waggle_founding",
  "waggle_trial_ends",
  "waggle_ends_on",
  "waggle_platform",
  "waggle_accounts_connected",
  "waggle_days_inactive",
  "waggle_replies_used",
  "waggle_reply_limit",
  "waggle_resets_on",
  "waggle_business",
] as const;
export type CrmField = (typeof CRM_FIELDS)[number];

/**
 * Sent with `connect_failed` only (Fix 1, 24 Nov), next to every field above. Walter creates them
 * in HighLevel: platform id; Zernio's error code, or no_account / abandoned; yes / no / unknown;
 * yes / no (the page was open inside Instagram's, Facebook's or TikTok's own browser).
 */
export const CRM_CONNECT_FIELDS = [
  "waggle_connect_platform",
  "waggle_connect_error",
  "waggle_connect_fixable",
  "waggle_connect_in_app",
] as const;
export type CrmConnectField = (typeof CRM_CONNECT_FIELDS)[number];

/** Two events for the same person at least this far apart (the workflow clears the tag first). */
export const CRM_MIN_GAP_MS = 30_000;

/** Days without a visit before `inactive`. */
export const CRM_INACTIVE_AFTER_DAYS = 2;
