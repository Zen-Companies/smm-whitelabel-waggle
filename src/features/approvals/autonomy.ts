import type { AutonomyMode, Category } from "./policy";

/**
 * Which categories the owner can set. policy() always ignores spam and always escalates
 * complaints and unclear messages (§11 steps 2-3), so only faq and lead have a real choice.
 */
export const CONFIGURABLE_CATEGORIES = ["faq", "lead"] as const satisfies Category[];
export type ConfigurableCategory = (typeof CONFIGURABLE_CATEGORIES)[number];

export const AUTONOMY_MODES = ["off", "approve", "auto"] as const satisfies AutonomyMode[];

export const CATEGORY_LABELS: Record<Category, string> = {
  faq: "Questions (FAQ)",
  lead: "Leads (bookings, orders, quotes)",
  complaint: "Complaints",
  unclear: "Unclear messages",
  spam: "Spam",
};

export const MODE_LABELS: Record<AutonomyMode, string> = {
  off: "Off: send to me, no AI reply",
  approve: "Approve first: AI drafts, I approve",
  auto: "Auto-send: AI replies if the checks pass",
};

/** What always happens to the categories the owner can't change. */
export const FIXED_BEHAVIOUR: Record<Exclude<Category, ConfigurableCategory>, string> = {
  complaint: "Always sent to you",
  unclear: "Always sent to you",
  spam: "Ignored",
};
