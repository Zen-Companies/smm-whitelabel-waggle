"use client";

import { Check } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveFollowupsAction, type AutomationFormState } from "./actions";
import type { SequenceTemplate } from "./sequences-section";

/**
 * Follow up quiet leads (design "Billing round 2" §4, approved 18 Nov): set it once. When a lead
 * stops answering, Waggle sends this message and stops if they reply. Team and Business.
 */
export function FollowupsCard({
  settings,
  platforms,
  templates,
  canEdit,
  included,
}: {
  settings: {
    enabled: boolean;
    waitHours: number;
    message: string;
    template: string | null;
  } | null;
  /** The brand's connected platforms it can reach (instagram, facebook, whatsapp). */
  platforms: string[];
  /** Approved WhatsApp templates (≤ 1 placeholder), for after 24 hours. */
  templates: SequenceTemplate[];
  canEdit: boolean;
  /** The brand's plan includes follow-ups (always true while plan limits are off). */
  included: boolean;
}) {
  const [state, action, pending] = useActionState<AutomationFormState, FormData>(
    saveFollowupsAction,
    {},
  );
  if (!included) {
    return (
      <section className="card flex flex-col gap-2 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-semibold">Follow up quiet leads</h3>
          <span className="bg-honey-tint text-honey-text rounded-full px-2.5 py-0.5 text-xs font-semibold">
            Comes with Team and Business
          </span>
        </div>
        <p className="text-ink-2 text-sm">
          On Solo you follow up yourself. Team and Business send your follow-up on their own when a
          lead goes quiet.
        </p>
        <Link href="/plan" className="action-link w-fit text-sm">
          See the plans
        </Link>
      </section>
    );
  }
  const reach = platforms.length
    ? platforms
        .map((p) => (p === "whatsapp" ? "WhatsApp" : p === "instagram" ? "Instagram" : "Facebook"))
        .join(", ")
    : null;
  return (
    <form action={action} className="card flex flex-col gap-3 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold">Follow up quiet leads</h3>
        <label className="inline-flex min-h-9 cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="enabled"
            defaultChecked={settings?.enabled ?? false}
            disabled={!canEdit}
            className="accent-honey size-5"
          />
          On
        </label>
      </div>
      <p className="text-ink-2 text-sm">
        When a lead stops answering, Waggle sends your message once and stops if they reply. It uses
        no AI replies.
      </p>
      <label className="flex flex-wrap items-center gap-2 text-sm">
        After
        <Input
          name="waitHours"
          inputMode="numeric"
          defaultValue={settings?.waitHours ?? 20}
          disabled={!canEdit}
          className="w-20 tabular-nums"
          aria-invalid={state.field === "waitHours" || undefined}
        />
        hours without an answer
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Your follow-up</span>
        <textarea
          name="message"
          rows={3}
          maxLength={1000}
          defaultValue={
            settings?.message ??
            "Hi {first name}, still thinking about it? Just reply here and we'll help."
          }
          disabled={!canEdit}
          aria-invalid={state.field === "message" || undefined}
          className="border-line-strong bg-surface rounded-md border px-3 py-2"
        />
        <span className="meta">
          {"{first name}"} becomes their first name. Use only what&apos;s true for your business.
        </span>
      </label>
      {platforms.includes("whatsapp") && (
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">WhatsApp template (after 24 hours)</span>
          <select
            name="template"
            defaultValue={settings?.template ?? ""}
            disabled={!canEdit}
            className="border-line-strong bg-surface min-h-10 rounded-md border px-3"
          >
            <option value="">No WhatsApp follow-up</option>
            {templates.map((t) => (
              <option
                key={`${t.name}|${t.language}`}
                value={`${t.name}|${t.language}|${t.variables}`}
              >
                {t.name} ({t.language})
              </option>
            ))}
          </select>
        </label>
      )}
      <span className="meta">
        Instagram and Facebook allow a message only within 24 hours of theirs, so it goes out before
        then. {reach ? `Goes out on: ${reach}.` : "Connect Instagram, Facebook or WhatsApp first."}
      </span>
      {canEdit && (
        <div className="flex flex-wrap items-center justify-end gap-3">
          {state.savedAt && !pending && (
            <span role="status" className="meta inline-flex items-center gap-1">
              <Check className="text-success size-4" strokeWidth={1.75} aria-hidden />
              Saved
            </span>
          )}
          {state.error && (
            <span role="alert" className="text-danger text-sm">
              {state.error}
            </span>
          )}
          <Button
            type="submit"
            variant="primary"
            disabled={pending}
            data-busy={pending || undefined}
          >
            {pending ? "Saving…" : "Save"}
          </Button>
        </div>
      )}
    </form>
  );
}
