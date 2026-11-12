"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { PlatformMark } from "@/components/app/platform-mark";
import { Button } from "@/components/ui/button";
import { markHandledAction, sendTemplateAction, type DecisionFormState } from "./actions";
import type { InboxEntry } from "./inbox-data";

export interface TemplateChoice {
  id: string;
  label: string;
  /** The text the customer will see, name filled in. */
  preview: string;
}

/**
 * T67 (design v3 "WhatsApp · window and templates"): the 24-hour window closed, so only an
 * approved template can restart the chat. Meta charges for it; that's said where the button is.
 */
export function WhatsAppWindowCard({
  entry,
  templates,
  loadError,
}: {
  entry: InboxEntry;
  templates: TemplateChoice[];
  loadError: boolean;
}) {
  const router = useRouter();
  const [picked, setPicked] = useState(templates[0]?.id ?? "");
  const [sent, send, sending] = useActionState<DecisionFormState, FormData>(sendTemplateAction, {});
  const [handled, handle, handling] = useActionState<DecisionFormState, FormData>(
    markHandledAction,
    {},
  );
  useEffect(() => {
    if (sent.approved) router.refresh();
  }, [sent.approved, router]);
  const choice = templates.find((t) => t.id === picked);

  if (sent.approved) {
    return (
      <p role="status" className="border-line rounded-xl border px-4 py-3.5">
        Template sent to {entry.authorName ?? "them"}. When they answer, Waggle can reply normally
        again.
      </p>
    );
  }

  return (
    <section
      aria-labelledby={`wa-window-${entry.itemId}`}
      className="border-line-strong flex flex-col gap-3 rounded-xl border p-4"
    >
      <div className="flex items-center gap-2.5">
        <PlatformMark platform="whatsapp" size={28} />
        <h3 id={`wa-window-${entry.itemId}`} className="font-semibold">
          The 24-hour window closed
        </h3>
      </div>
      <p className="text-ink-2">
        WhatsApp only allows an approved template now. Pick one to restart the chat; when they
        answer, Waggle can reply normally again.
      </p>
      {loadError ? (
        <p role="alert" className="text-danger text-sm">
          Couldn&apos;t load your templates from WhatsApp. Reload in a minute.
        </p>
      ) : templates.length === 0 ? (
        <p className="text-ink-2 text-sm">
          No approved templates yet. Add one in{" "}
          <a href="/settings?section=whatsapp" className="font-medium underline">
            Settings → WhatsApp templates
          </a>
          ; Meta reviews it, usually within a day.
        </p>
      ) : (
        <form action={send} className="flex flex-col gap-3">
          <input type="hidden" name="itemId" value={entry.itemId} />
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold">Template</span>
            <select
              name="templateId"
              value={picked}
              onChange={(e) => setPicked(e.target.value)}
              className="field"
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          {choice && (
            <p className="rounded-xl bg-[#F0FDF4] px-3.5 py-3 whitespace-pre-wrap text-[#14532D]">
              {choice.preview}
            </p>
          )}
          <span className="text-ink-3 text-xs">
            Meta charges for template messages. It shows on your Meta bill, not Waggle&apos;s.
          </span>
          {sent.error && (
            <p role="alert" className="text-danger text-sm">
              {sent.error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="primary" disabled={sending || !picked}>
              {sending ? "Sending…" : "Send template"}
            </Button>
          </div>
        </form>
      )}
      <form action={handle} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="itemId" value={entry.itemId} />
        <Button type="submit" variant="secondary" disabled={handling}>
          {handling ? "Saving…" : "Mark as handled"}
        </Button>
        <span className="text-ink-3 text-xs">If you called them or answered on your phone.</span>
        {handled.error && (
          <p role="alert" className="text-danger w-full text-sm">
            {handled.error}
          </p>
        )}
      </form>
    </section>
  );
}
