// Promotions as stored (table `promotions`, Staff → Promotions, 24 Nov) and as the app uses them
// (promotions.ts). Pure: the row mapping and the edit form's checks.

import { z } from "zod";
import type { Tables } from "@/lib/supabase/database.types";
import {
  BAR_AUDIENCES,
  PROMO_TIME_ZONE,
  barTextOf,
  parseBarText,
  type BarAudience,
  type Promotion,
  type PromotionKind,
} from "./promotions";

export type PromotionRow = Tables<"promotions">;

const date = (v: string | null): Date | null => (v ? new Date(v) : null);

/** Pure: one row as the app's promotion. Unknown audiences fall back to never-paid Owners. */
export function rowToPromotion(r: PromotionRow): Promotion {
  const audience: BarAudience = (BAR_AUDIENCES as readonly string[]).includes(r.audience)
    ? (r.audience as BarAudience)
    : "never_paid_owners";
  const lastDayStarts = date(r.last_day_starts_at);
  return {
    id: r.id,
    name: r.name,
    kind: r.kind === "referral" ? "referral" : "seasonal",
    enabled: r.enabled,
    startsAt: date(r.starts_at),
    endsAt: date(r.ends_at),
    trialDays: r.trial_days,
    countdown: r.countdown,
    rewardMonths: r.reward_months,
    bar: {
      enabled: r.bar_enabled,
      audience,
      startsAt: null,
      endsAt: null,
      link: r.bar_link,
      label: r.bar_label,
      lines: parseBarText(r.bar_text),
      phoneLines: parseBarText(r.bar_phone_text),
      cta: r.bar_cta,
      phoneCta: r.bar_phone_cta,
    },
    pass: {
      dayName: [r.day_name_1, r.day_name_2],
      headline: r.headline,
      small: r.subline,
    },
    lastDay: lastDayStarts
      ? {
          startsAt: lastDayStarts,
          bar: {
            label: r.last_bar_label,
            lines: parseBarText(r.last_bar_text),
            phoneLines: parseBarText(r.last_bar_phone_text),
            cta: r.bar_cta,
            phoneCta: r.bar_phone_cta,
          },
          pass: {
            dayName: [r.last_day_name_1, r.last_day_name_2],
            headline: r.last_headline,
            small: r.last_subline,
          },
        }
      : null,
  };
}

/** What staff edit: every column but the bookkeeping ones. */
export type PromotionFields = Omit<PromotionRow, "created_at" | "updated_at" | "updated_by">;

/** Pure: a row's editable fields (drops the bookkeeping columns). */
export function rowToFields(r: PromotionRow): PromotionFields {
  const out: Partial<PromotionRow> = { ...r };
  delete out.created_at;
  delete out.updated_at;
  delete out.updated_by;
  return out as PromotionFields;
}

const iso = (d: Date | null) => (d ? d.toISOString() : null);

/** Pure: a promotion as editable fields (the code defaults' rows, the form's starting values). */
export function promotionToFields(p: Promotion): PromotionFields {
  return {
    id: p.id,
    name: p.name,
    kind: p.kind,
    enabled: p.enabled,
    starts_at: iso(p.startsAt),
    ends_at: iso(p.endsAt),
    trial_days: p.trialDays,
    countdown: p.countdown,
    reward_months: p.rewardMonths,
    bar_enabled: p.bar.enabled,
    audience: p.bar.audience,
    bar_label: p.bar.label,
    bar_text: barTextOf(p.bar.lines),
    bar_phone_text: barTextOf(p.bar.phoneLines),
    bar_cta: p.bar.cta,
    bar_phone_cta: p.bar.phoneCta,
    bar_link: p.bar.link,
    day_name_1: p.pass.dayName[0],
    day_name_2: p.pass.dayName[1],
    headline: p.pass.headline,
    subline: p.pass.small,
    last_day_starts_at: iso(p.lastDay?.startsAt ?? null),
    last_bar_label: p.lastDay?.bar.label ?? "",
    last_bar_text: p.lastDay ? barTextOf(p.lastDay.bar.lines) : "",
    last_bar_phone_text: p.lastDay ? barTextOf(p.lastDay.bar.phoneLines) : "",
    last_day_name_1: p.lastDay?.pass.dayName[0] ?? "",
    last_day_name_2: p.lastDay?.pass.dayName[1] ?? "",
    last_headline: p.lastDay?.pass.headline ?? "",
    last_subline: p.lastDay?.pass.small ?? "",
  };
}

/** Pure: a blank new promotion of a kind (off until staff switch it on). */
export function newPromotionFields(kind: PromotionKind, id: string, name: string): PromotionFields {
  const seasonal = kind === "seasonal";
  return {
    id,
    name,
    kind,
    enabled: false,
    starts_at: null,
    ends_at: null,
    trial_days: 30,
    countdown: seasonal,
    reward_months: 1,
    bar_enabled: false,
    audience: seasonal ? "never_paid_owners" : "all_owners",
    bar_label: name,
    bar_text: "",
    bar_phone_text: "",
    bar_cta: seasonal ? "Choose a plan →" : "Get your link →",
    bar_phone_cta: seasonal ? "Plans →" : "Link →",
    bar_link: seasonal ? "plan-popup" : "/plan#referral-title",
    day_name_1: "",
    day_name_2: "",
    headline: "Your first month is free.",
    subline: "",
    last_day_starts_at: null,
    last_bar_label: "",
    last_bar_text: "",
    last_bar_phone_text: "",
    last_day_name_1: "",
    last_day_name_2: "",
    last_headline: "",
    last_subline: "",
  };
}

// ---- Dates: staff type US Eastern wall time; the table keeps UTC ----

function zoneOffsetMs(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

const WALL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

/** Pure: "2026-11-30T23:59:59" in `timeZone` (US Eastern) as the instant. null if not that shape. */
export function wallToUtc(local: string, timeZone: string = PROMO_TIME_ZONE): Date | null {
  const m = WALL.exec(local.trim());
  if (!m) return null;
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0));
  let t = guess - zoneOffsetMs(new Date(guess), timeZone);
  t = guess - zoneOffsetMs(new Date(t), timeZone);
  return new Date(t);
}

/** Pure: an instant as the form's wall time in `timeZone` ("2026-11-30T23:59:59"). */
export function utcToWall(d: Date, timeZone: string = PROMO_TIME_ZONE): string {
  const off = zoneOffsetMs(d, timeZone);
  return new Date(Math.floor(d.getTime() / 1000) * 1000 + off).toISOString().slice(0, 19);
}

/** Pure: "Mon 30 Nov 2026, 11:59 pm ET · 1 Dec, 04:59 UTC". */
export function bothZones(d: Date): string {
  const et = d.toLocaleString("en-GB", {
    timeZone: PROMO_TIME_ZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  const utc = d.toLocaleString("en-GB", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${et} ET · ${utc} UTC`;
}

// ---- The edit form ----

/** Slugs: lowercase letters, digits and dashes, 3–40 (the table's check). */
export const PROMOTION_ID = /^[a-z0-9][a-z0-9-]{2,39}$/;

const text = (max: number, label: string) =>
  z.string().trim().max(max, `${label}: ${max} characters at most.`);
const lines = (max: number, label: string) =>
  z
    .string()
    .transform((v) => v.replace(/\r\n/g, "\n").trim())
    .pipe(z.string().max(max, `${label}: ${max} characters at most.`));
const when = (label: string) =>
  z
    .string()
    .trim()
    .transform((v, ctx) => {
      if (!v) return null;
      // The form sends US Eastern wall time; a full ISO date (with its zone) is taken as is.
      const d = WALL.test(v) ? wallToUtc(v) : /[zZ]|[+-]\d{2}:\d{2}$/.test(v) ? new Date(v) : null;
      if (!d || Number.isNaN(d.getTime())) {
        ctx.addIssue({ code: "custom", message: `${label}: that isn't a date.` });
        return z.NEVER;
      }
      return d.toISOString();
    });
const whole = (min: number, max: number, label: string) =>
  z.coerce
    .number({ error: `${label}: a whole number from ${min} to ${max}.` })
    .int(`${label}: a whole number from ${min} to ${max}.`)
    .min(min, `${label}: a whole number from ${min} to ${max}.`)
    .max(max, `${label}: a whole number from ${min} to ${max}.`);
const on = z
  .string()
  .optional()
  .transform((v) => v === "on");

export const promotionFormSchema = z
  .object({
    name: text(60, "Name").min(1, "Name: give it a name."),
    enabled: on,
    starts_at: when("Starts"),
    ends_at: when("Ends"),
    trial_days: whole(1, 90, "Trial days"),
    countdown: on,
    reward_months: whole(0, 12, "Reward months"),
    bar_enabled: on,
    audience: z.enum(["never_paid_owners", "all_owners", "everyone"], {
      error: "Who sees the bar: pick one.",
    }),
    bar_label: text(40, "Bar label"),
    bar_text: lines(400, "Bar lines"),
    bar_phone_text: lines(200, "Phone bar lines"),
    bar_cta: text(30, "Bar link text").min(1, "Bar link text: say where it goes."),
    bar_phone_cta: text(20, "Phone link text").min(1, "Phone link text: say where it goes."),
    bar_link: z
      .string()
      .trim()
      .refine(
        (v) => v === "plan-popup" || /^\/[A-Za-z0-9/_#?=&.-]*$/.test(v),
        "Bar link: the plan pop-up, or an app path starting with /.",
      ),
    day_name_1: text(20, "Day name, first line"),
    day_name_2: text(20, "Day name, second line"),
    headline: text(80, "Headline"),
    subline: text(160, "Small line"),
    last_day_starts_at: when("Last day starts"),
    last_bar_label: text(40, "Last day bar label"),
    last_bar_text: lines(400, "Last day bar lines"),
    last_bar_phone_text: lines(200, "Last day phone lines"),
    last_day_name_1: text(20, "Last day name, first line"),
    last_day_name_2: text(20, "Last day name, second line"),
    last_headline: text(80, "Last day headline"),
    last_subline: text(160, "Last day small line"),
  })
  .superRefine((v, ctx) => {
    if (v.starts_at && v.ends_at && Date.parse(v.ends_at) <= Date.parse(v.starts_at)) {
      ctx.addIssue({ code: "custom", message: "Ends: must be after it starts." });
    }
    if (v.last_day_starts_at) {
      const t = Date.parse(v.last_day_starts_at);
      if (v.ends_at && t >= Date.parse(v.ends_at)) {
        ctx.addIssue({ code: "custom", message: "Last day starts: must be before it ends." });
      }
      if (v.starts_at && t < Date.parse(v.starts_at)) {
        ctx.addIssue({ code: "custom", message: "Last day starts: must be after it starts." });
      }
    }
    if (v.bar_enabled && !v.bar_text) {
      ctx.addIssue({
        code: "custom",
        message: "Bar lines: write at least one, or turn the bar off.",
      });
    }
  });

export type PromotionFormValues = z.infer<typeof promotionFormSchema>;

/** Pure: the edit form, checked. The first problem is the message (said in place). */
export function parsePromotionForm(
  get: (field: string) => FormDataEntryValue | null,
): { value: PromotionFormValues } | { error: string } {
  const raw: Record<string, unknown> = {};
  for (const key of Object.keys(promotionFormSchema.shape)) {
    const v = get(key);
    raw[key] = typeof v === "string" ? v : undefined;
  }
  const r = promotionFormSchema.safeParse(raw);
  if (!r.success) return { error: r.error.issues[0]?.message ?? "Please check the form." };
  return { value: r.data };
}

/** Pure: the fields that differ (for the history list: "what changed"). */
export function changedFields(
  before: Partial<Record<string, unknown>>,
  after: Partial<Record<string, unknown>>,
): string[] {
  return Object.keys(after).filter(
    (k) => JSON.stringify(before[k] ?? null) !== JSON.stringify(after[k] ?? null),
  );
}
