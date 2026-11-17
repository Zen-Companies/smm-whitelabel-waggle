import { z } from "zod";
import type { SequenceStep } from "@/lib/social/types";

// Follow-ups for leads that go quiet (Pricing Bible, 18 Nov; design "Billing round 2" §4). Pure;
// tested. The owner writes the follow-up once; when a lead stops answering, Waggle adds them to
// a Zernio sequence that sends it and stops if they reply. No AI.

/** Where it can go out: Meta's DMs (inside 24 hours) and WhatsApp (a template after 24 hours). */
export const FOLLOWUP_PLATFORMS = ["instagram", "facebook", "whatsapp"] as const;
export type FollowupPlatform = (typeof FOLLOWUP_PLATFORMS)[number];
export const isFollowupPlatform = (p: string): p is FollowupPlatform =>
  (FOLLOWUP_PLATFORMS as readonly string[]).includes(p);

const HOUR = 60 * 60_000;
/** Meta's window; the follow-up leaves 10 minutes to spare. */
const META_WINDOW_MS = 24 * HOUR - 10 * 60_000;
/** WhatsApp templates: no window, but a follow-up a week later is no longer a follow-up. */
const WHATSAPP_MAX_MS = 7 * 24 * HOUR;

export const WAIT_HOURS_MIN = 1;
export const WAIT_HOURS_MAX = 23;

export interface FollowupSettingsInput {
  enabled: boolean;
  waitMinutes: number;
  message: string;
  whatsappTemplate: { name: string; language: string; variables: number } | null;
}

const settingsSchema = z.object({
  enabled: z.boolean(),
  waitHours: z.coerce
    .number()
    .int()
    .min(WAIT_HOURS_MIN, `Wait ${WAIT_HOURS_MIN} to ${WAIT_HOURS_MAX} hours.`)
    .max(
      WAIT_HOURS_MAX,
      `Wait ${WAIT_HOURS_MIN} to ${WAIT_HOURS_MAX} hours: Instagram and Facebook only allow a message within 24 hours of theirs.`,
    ),
  message: z
    .string()
    .trim()
    .min(1, "Write the follow-up.")
    .max(1000, "Keep it under 1,000 characters."),
  template: z.string().trim().max(200).optional(),
});

/** Pure: the Automations card's form. The WhatsApp template is "name|language|variables". */
export function parseFollowupForm(
  get: (field: string) => FormDataEntryValue | null,
): { ok: true; value: FollowupSettingsInput } | { ok: false; error: string; field: string } {
  const r = settingsSchema.safeParse({
    enabled: get("enabled") === "on",
    waitHours: get("waitHours"),
    message: get("message") ?? "",
    template: get("template") || undefined,
  });
  if (!r.success) {
    const issue = r.error.issues[0];
    return { ok: false, error: issue.message, field: String(issue.path[0] ?? "message") };
  }
  let whatsappTemplate: FollowupSettingsInput["whatsappTemplate"] = null;
  if (r.data.template) {
    const [name, language, vars] = r.data.template.split("|");
    if (!name || !language)
      return { ok: false, error: "Pick a WhatsApp template again.", field: "template" };
    whatsappTemplate = { name, language, variables: Number(vars) || 0 };
  }
  return {
    ok: true,
    value: {
      enabled: r.data.enabled,
      waitMinutes: r.data.waitHours * 60,
      message: r.data.message,
      whatsappTemplate,
    },
  };
}

/** Pure: the one-step sequence for an account (sent a minute after Waggle adds the lead). */
export function followupSteps(
  platform: FollowupPlatform,
  s: Pick<FollowupSettingsInput, "message" | "whatsappTemplate">,
): SequenceStep[] | null {
  if (platform === "whatsapp") {
    if (!s.whatsappTemplate) return null;
    return [
      {
        order: 1,
        delayMinutes: 1,
        template: {
          name: s.whatsappTemplate.name,
          language: s.whatsappTemplate.language,
          ...(s.whatsappTemplate.variables >= 1
            ? { variableMapping: { "1": { field: "name" as const } } }
            : {}),
        },
      },
    ];
  }
  return [
    {
      order: 1,
      delayMinutes: 1,
      message: { text: s.message.replace(/\{\s*first\s*name\s*\}/gi, "{{first_name}}") },
    },
  ];
}

export interface QuietLeadFacts {
  platform: string;
  /** Board stage as stored (null: New until someone replied, then Talking). */
  stage: string | null;
  followedUpAt: string | null;
  /** The customer's latest message. */
  lastCustomerAt: Date | null;
  /** Our latest sent reply in that conversation. */
  lastOursAt: Date | null;
  hasContact: boolean;
  hasTemplate: boolean;
}

/**
 * Pure: whether a lead gets its follow-up now. They went quiet: we answered after their last
 * message and they haven't written since, for at least `waitMinutes`; once per lead; never
 * booked or done; Instagram and Facebook only inside Meta's 24-hour window, WhatsApp only with a
 * template and within a week.
 */
export function followupDue(lead: QuietLeadFacts, waitMinutes: number, now: Date): boolean {
  if (!isFollowupPlatform(lead.platform)) return false;
  if (lead.followedUpAt || !lead.hasContact) return false;
  if (lead.stage === "booked" || lead.stage === "done") return false;
  if (!lead.lastCustomerAt || !lead.lastOursAt) return false;
  if (lead.lastOursAt.getTime() <= lead.lastCustomerAt.getTime()) return false;
  const quiet = now.getTime() - lead.lastCustomerAt.getTime();
  if (quiet < waitMinutes * 60_000) return false;
  if (lead.platform === "whatsapp") return lead.hasTemplate && quiet <= WHATSAPP_MAX_MS;
  return quiet <= META_WINDOW_MS;
}
