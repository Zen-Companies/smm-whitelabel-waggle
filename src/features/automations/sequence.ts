import { z } from "zod";
import type { SequenceStep } from "@/lib/social/types";

// Sequences (T77c, design "Automations · Sequences"): timed follow-ups to people the owner adds
// (`/v1/sequences`). Each step waits after the previous one (VERIFY: Zernio's docs don't say
// whether `delayMinutes` counts from the previous step or from enrolment), then sends a message
// or, on WhatsApp after 24 hours, an approved template.

/** Platforms Zernio runs sequences on that Waggle connects. */
export const SEQUENCE_PLATFORMS = new Set(["whatsapp", "instagram", "facebook", "telegram", "bluesky"]);

/** WhatsApp only allows templates 24 hours after the person's last message. */
export const needsTemplate = (platform: string, waitMinutes: number) =>
  platform === "whatsapp" && waitMinutes >= 24 * 60;

export type OwnerStep =
  | { waitMinutes: number; text: string }
  | { waitMinutes: number; template: { name: string; language: string; variables: number } };

const placeholders = (s: string) => s.replace(/\{\s*first\s*name\s*\}/gi, "{{first_name}}");

export function toSequenceSteps(steps: OwnerStep[]): SequenceStep[] {
  return steps.map((s, i) =>
    "template" in s
      ? {
          order: i + 1,
          delayMinutes: s.waitMinutes,
          template: {
            name: s.template.name,
            language: s.template.language,
            // A template's one placeholder is the person's name (as in T67).
            ...(s.template.variables >= 1 ? { variableMapping: { "1": { field: "name" as const } } } : {}),
          },
        }
      : { order: i + 1, delayMinutes: s.waitMinutes, message: { text: placeholders(s.text) } },
  );
}

const stepSchema = z.union([
  z.object({
    waitMinutes: z.coerce.number().int().min(0).max(60 * 24 * 90),
    template: z.object({ name: z.string().min(1), language: z.string().min(1), variables: z.coerce.number().int().min(0) }),
  }),
  z.object({ waitMinutes: z.coerce.number().int().min(0).max(60 * 24 * 90), text: z.string().trim().min(1).max(1000) }),
]);

export interface SequenceForm {
  name: string;
  platform: string;
  accountId: string;
  steps: OwnerStep[];
  exitOnReply: boolean;
  exitOnUnsubscribe: boolean;
}

export function parseSequenceForm(
  f: FormData,
): { ok: true; value: SequenceForm } | { ok: false; field: string; error: string } {
  const name = String(f.get("name") ?? "").trim();
  const platform = String(f.get("platform") ?? "");
  const accountId = String(f.get("accountId") ?? "");
  if (!name) return { ok: false, field: "name", error: "Give it a name." };
  if (!accountId || !SEQUENCE_PLATFORMS.has(platform)) {
    return { ok: false, field: "accountId", error: "Pick a WhatsApp, Instagram, Facebook, Telegram or Bluesky account." };
  }
  let raw: unknown = [];
  try {
    raw = JSON.parse(String(f.get("steps") ?? "[]"));
  } catch {
    raw = [];
  }
  const steps = (Array.isArray(raw) ? raw : []).slice(0, 10).flatMap((s): OwnerStep[] => {
    const p = stepSchema.safeParse(s);
    return p.success ? [p.data] : [];
  });
  if (!steps.length) return { ok: false, field: "steps", error: "Add at least one message." };
  const late = steps.findIndex((s) => needsTemplate(platform, s.waitMinutes) && !("template" in s));
  if (late >= 0) {
    return {
      ok: false,
      field: "steps",
      error: `Message ${late + 1} goes out a day or more later: WhatsApp only allows an approved template then.`,
    };
  }
  return {
    ok: true,
    value: {
      name: name.slice(0, 100),
      platform,
      accountId,
      steps,
      exitOnReply: f.get("exitOnReply") === "yes",
      // Always: someone who unsubscribed never gets more.
      exitOnUnsubscribe: true,
    },
  };
}
