"use client";

import { useActionState, useState } from "react";
import { PlatformMark } from "@/components/app/platform-mark";
import { Button } from "@/components/ui/button";
import type { Broadcast } from "@/lib/social/types";
import { cancelBroadcast, sendBroadcast, type BroadcastFormState } from "./broadcast-actions";

export type BroadcastTemplate = { name: string; language: string; variables: number; body: string };

const STATUS: Record<Broadcast["status"], { label: string; tone: string }> = {
  draft: { label: "Draft", tone: "bg-subtle text-ink-2" },
  scheduled: { label: "Scheduled", tone: "bg-honey-tint text-honey-text" },
  sending: { label: "Sending", tone: "bg-honey-tint text-honey-text" },
  completed: { label: "Sent", tone: "bg-success-soft text-success" },
  failed: { label: "Couldn't send", tone: "bg-danger-soft text-danger" },
  cancelled: { label: "Cancelled", tone: "bg-subtle text-ink-3" },
};

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** One broadcast with its results (sent, delivered, read, failed). */
export function BroadcastRow({ b, canEdit }: { b: Broadcast; canEdit: boolean }) {
  const [state, act, pending] = useActionState<BroadcastFormState, FormData>(cancelBroadcast, {});
  const s = STATUS[b.status];
  return (
    <li className="flex flex-wrap items-start gap-3 px-4 py-3.5">
      <PlatformMark platform={b.platform} size={28} />
      <span className="flex min-w-[200px] flex-1 flex-col">
        <b className="font-semibold">{b.name}</b>
        <span className="meta">
          {b.status === "scheduled" && b.scheduledAt
            ? `${when(b.scheduledAt)} · ${b.recipients} people`
            : `${b.sent} sent · ${b.delivered} delivered · ${b.read} read${b.failed ? ` · ${b.failed} failed` : ""}`}
        </span>
        {b.preview && <span className="text-ink-2 truncate text-sm">{b.preview}</span>}
        {state.error && (
          <span role="alert" className="text-danger text-sm">
            {state.error}
          </span>
        )}
      </span>
      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${s.tone}`}>{s.label}</span>
      {canEdit && b.status === "scheduled" && (
        <form action={act}>
          <input type="hidden" name="id" value={b.id} />
          <Button type="submit" variant="quiet" disabled={pending}>
            Cancel
          </Button>
        </form>
      )}
    </li>
  );
}

/** New broadcast (T78b): template, who gets it, now or later, asked once more before sending. */
export function BroadcastForm({
  accountId,
  number,
  templates,
}: {
  accountId: string;
  number: string;
  templates: BroadcastTemplate[];
}) {
  const [state, action, pending] = useActionState<BroadcastFormState, FormData>(sendBroadcast, {});
  const [template, setTemplate] = useState("");
  const [whenMode, setWhenMode] = useState<"now" | "later">("now");
  const [local, setLocal] = useState("");
  const [sure, setSure] = useState(false);
  const picked = templates.find((t) => `${t.name}|${t.language}|${t.variables}` === template);
  const err = (f: string) =>
    state.field === f && state.error ? (
      <p role="alert" className="text-danger text-sm">
        {state.error}
      </p>
    ) : null;

  if (state.savedAt && !state.error) {
    return (
      <p role="status" className="card p-5">
        {state.scheduled ? `Scheduled for ${state.recipients} people.` : `Sending to ${state.recipients} people.`} The results show below as
        WhatsApp reports them.
      </p>
    );
  }
  return (
    <form action={action} className="card flex flex-col gap-4 p-5">
      <h2 className="section-title">New broadcast</h2>
      <input type="hidden" name="accountId" value={accountId} />
      <p className="text-ink-2 flex items-center gap-2 text-sm">
        <PlatformMark platform="whatsapp" size={20} /> WhatsApp · {number}
      </p>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Name <span className="text-ink-3 font-normal">(only you see it)</span>
        <input name="name" placeholder="Weekend promo" className="field" required />
        {err("name")}
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Template
        <select name="template" value={template} onChange={(e) => setTemplate(e.target.value)} className="field">
          <option value="">Pick an approved template</option>
          {templates.map((t) => (
            <option key={`${t.name}|${t.language}`} value={`${t.name}|${t.language}|${t.variables}`}>
              {t.name} ({t.language})
            </option>
          ))}
        </select>
        {err("template")}
      </label>
      {picked && (
        <p className="bg-success-soft rounded-xl px-3.5 py-2.5 text-sm">
          {picked.body.replace("{{1}}", "Ana")}
        </p>
      )}
      {!templates.length && (
        <p className="meta">No approved templates yet. Add one in Settings → WhatsApp templates; Meta reviews it first.</p>
      )}
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Who gets it <span className="text-ink-3 font-normal">(a tag, or empty for everyone)</span>
        <input name="tag" placeholder="regular" className="field" />
        {err("tag")}
      </label>
      <p className="meta">Only people who agreed to get messages are included.</p>
      <div className="segmented self-start" role="radiogroup" aria-label="When">
        {(["now", "later"] as const).map((v) => (
          <label key={v} data-active={whenMode === v || undefined}>
            <input type="radio" name="when" value={v} checked={whenMode === v} onChange={() => setWhenMode(v)} className="sr-only" />
            {v === "now" ? "Send now" : "Schedule"}
          </label>
        ))}
      </div>
      {whenMode === "later" && (
        <>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Day and time
            <input type="datetime-local" value={local} onChange={(e) => setLocal(e.target.value)} className="field max-w-64" required />
          </label>
          <input type="hidden" name="scheduledAt" value={local ? new Date(local).toISOString() : ""} />
        </>
      )}
      {err("when")}
      <p className="meta">
        Meta charges for each template message on your WhatsApp account. A new number can reach 250
        new people a day at first; Meta raises it as you send.
      </p>
      {sure ? (
        <div className="border-honey-border bg-honey-tint flex flex-wrap items-center gap-2 rounded-xl border p-3 text-sm">
          <b className="font-semibold">
            {whenMode === "now" ? "Send it now" : "Schedule it"} to everyone who matches? It can&apos;t be unsent.
          </b>
          <Button type="submit" variant="primary" disabled={pending || !picked}>
            {pending ? "Sending…" : whenMode === "now" ? "Send" : "Schedule"}
          </Button>
          <Button type="button" variant="quiet" onClick={() => setSure(false)}>
            Not yet
          </Button>
        </div>
      ) : (
        <Button type="button" variant="primary" className="self-start" disabled={!picked} onClick={() => setSure(true)}>
          {whenMode === "now" ? "Send broadcast" : "Schedule broadcast"}
        </Button>
      )}
      {state.error && !state.field && (
        <p role="alert" className="text-danger text-sm">
          {state.error}
        </p>
      )}
    </form>
  );
}
