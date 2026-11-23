"use client";

import { X } from "lucide-react";
import { SidePanel } from "@/components/app/side-panel";
import { EmptySpot } from "@/components/app/empty-spot";
import { useActionState, useState } from "react";
import { PlatformMark } from "@/components/app/platform-mark";
import { Button } from "@/components/ui/button";
import { platformLabel } from "@/lib/social/platforms";
import type { Sequence } from "@/lib/social/types";
import { changeSequence, saveSequence, type AutomationFormState, type EnrollState } from "./actions";
import type { AutomationAccount } from "./comment-dm-form";
import { needsTemplate } from "./sequence";

export type SequenceTemplate = { name: string; language: string; variables: number; body: string };

type Unit = "now" | "hours" | "days";
type DraftStep = { amount: number; unit: Unit; text: string; template: string };

const minutes = (s: DraftStep) => (s.unit === "now" ? 0 : s.unit === "hours" ? s.amount * 60 : s.amount * 1440);
const tKey = (t: SequenceTemplate) => `${t.name}|${t.language}`;

/** Sequences (T77c, design "Automations · Sequences"): list, add people, on/pause/delete, New. */
export function SequencesSection({
  sequences,
  accounts,
  templates,
  canEdit,
}: {
  sequences: Sequence[];
  accounts: AutomationAccount[];
  /** Approved WhatsApp templates (≤ 1 placeholder) per WhatsApp account id. */
  templates: Record<string, SequenceTemplate[]>;
  canEdit: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-5">
      {sequences.length === 0 && <EmptySpot>No sequences yet. A sequence sends timed follow-up messages to the people you add.</EmptySpot>}
      {sequences.length > 0 && (
        <ul className="card divide-line flex flex-col divide-y">
          {sequences.map((s) => (
            <SequenceRow key={s.id} s={s} canEdit={canEdit} />
          ))}
        </ul>
      )}
      {canEdit && !open && (
        <Button type="button" variant="primary" className="self-start" onClick={() => setOpen(true)} disabled={!accounts.length}>
          New sequence
        </Button>
      )}
      {canEdit && open && accounts.length > 0 && (
        <SidePanel label="New sequence" onClose={() => setOpen(false)}>
          <p className="text-ink-2 text-sm">Timed follow-up messages to the people you add.</p>
          <SequenceForm accounts={accounts} templates={templates} onDone={() => setOpen(false)} />
        </SidePanel>
      )}
      {!accounts.length && <p className="meta">Connect WhatsApp, Instagram, Facebook, Telegram or Bluesky first.</p>}
    </div>
  );
}

function SequenceRow({ s, canEdit }: { s: Sequence; canEdit: boolean }) {
  const [state, act, pending] = useActionState<EnrollState, FormData>(changeSequence, {});
  const [confirm, setConfirm] = useState(false);
  const [adding, setAdding] = useState(false);
  const op = (value: string, label: string, danger = false) => (
    <form action={act}>
      <input type="hidden" name="id" value={s.id} />
      <input type="hidden" name="op" value={value} />
      <Button type="submit" variant="quiet" className={danger ? "text-danger" : undefined} disabled={pending}>
        {label}
      </Button>
    </form>
  );
  return (
    <li className="flex flex-col gap-2 px-4 py-3.5">
      <div className="flex flex-wrap items-start gap-3">
        <PlatformMark platform={s.platform} size={30} />
        <span className="flex min-w-[200px] flex-1 flex-col">
          <b className="font-semibold">{s.name}</b>
          <span className="meta">
            {s.steps} {s.steps === 1 ? "message" : "messages"} · {s.enrolled} in it · {s.completed} finished ·{" "}
            {s.exited} stopped
          </span>
          {s.preview && <span className="text-ink-2 truncate text-sm">“{s.preview}”</span>}
        </span>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${s.status === "active" ? "bg-success-soft text-success" : "bg-subtle text-ink-2"}`}
        >
          {s.status === "active" ? "On" : s.status === "paused" ? "Paused" : "Draft"}
        </span>
        {canEdit && (
          <span className="flex flex-wrap items-center gap-1">
            <Button type="button" variant="quiet" onClick={() => setAdding((a) => !a)}>
              Add people
            </Button>
            {s.status === "active" ? op("off", "Pause") : op("on", "Turn on")}
            {confirm ? (
              <>
                {op("delete", "Delete for good", true)}
                <Button type="button" variant="quiet" onClick={() => setConfirm(false)}>
                  Keep
                </Button>
              </>
            ) : (
              <Button type="button" variant="quiet" onClick={() => setConfirm(true)}>
                Delete
              </Button>
            )}
          </span>
        )}
      </div>
      {adding && (
        <form action={act} className="flex flex-wrap items-center gap-2 pl-11">
          <input type="hidden" name="id" value={s.id} />
          <input type="hidden" name="op" value="enroll" />
          <label htmlFor={`tag-${s.id}`} className="text-sm">
            Everyone tagged
          </label>
          <input id={`tag-${s.id}`} name="tag" placeholder="new-customer" className="field h-9 w-44 py-1" />
          <Button type="submit" variant="secondary" disabled={pending}>
            Add them
          </Button>
          <span className="meta w-full">People already in it, or who can&apos;t get messages there, are skipped.</span>
        </form>
      )}
      {state.enrolled !== undefined && !state.error && (
        <p role="status" className="pl-11 text-sm">
          Added {state.enrolled}.{state.failed ? ` ${state.failed} skipped.` : ""}
        </p>
      )}
      {state.error && (
        <p role="alert" className="text-danger pl-11 text-sm">
          {state.error}
        </p>
      )}
    </li>
  );
}

function SequenceForm({
  accounts,
  templates,
  onDone,
}: {
  accounts: AutomationAccount[];
  templates: Record<string, SequenceTemplate[]>;
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState<AutomationFormState, FormData>(
    async (prev, data) => {
      const next = await saveSequence(prev, data);
      if (next.savedAt && !next.error) onDone();
      return next;
    },
    {},
  );
  const [accountId, setAccountId] = useState(accounts[0]?.zernioId ?? "");
  const [steps, setSteps] = useState<DraftStep[]>([
    { amount: 0, unit: "now", text: "Hi {first name}! Thanks for visiting.", template: "" },
    { amount: 2, unit: "days", text: "", template: "" },
  ]);
  const account = accounts.find((a) => a.zernioId === accountId);
  const platform = account?.platform ?? "";
  const tpls = templates[accountId] ?? [];
  const payload = steps.map((s) => {
    const wait = minutes(s);
    const t = tpls.find((x) => tKey(x) === s.template);
    return needsTemplate(platform, wait) && t
      ? { waitMinutes: wait, template: { name: t.name, language: t.language, variables: t.variables } }
      : { waitMinutes: wait, text: s.text };
  });
  const update = (i: number, patch: Partial<DraftStep>) =>
    setSteps((all) => all.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="platform" value={platform} />
      <input type="hidden" name="steps" value={JSON.stringify(payload)} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="seq-name" className="text-sm font-medium">
          Name
        </label>
        <input id="seq-name" name="name" placeholder="New customer welcome" className="field" required />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="seq-account" className="text-sm font-medium">
          Send from
        </label>
        <select id="seq-account" name="accountId" value={accountId} onChange={(e) => setAccountId(e.target.value)} className="field">
          {accounts.map((a) => (
            <option key={a.zernioId} value={a.zernioId}>
              {platformLabel(a.platform)} @{a.username ?? "account"}
            </option>
          ))}
        </select>
      </div>
      <ol className="flex flex-col gap-2">
        {steps.map((s, i) => {
          const late = needsTemplate(platform, minutes(s));
          return (
            <li key={i} className="border-line flex flex-col gap-2 rounded-xl border p-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <b className="font-semibold">Message {i + 1}</b>
                <span className="text-ink-2">{i === 0 ? "when they're added," : "after the previous one,"}</span>
                {s.unit !== "now" && (
                  <input
                    type="number"
                    min={1}
                    max={90}
                    aria-label={`Message ${i + 1}: how long to wait`}
                    value={s.amount}
                    onChange={(e) => update(i, { amount: Number(e.target.value) || 1 })}
                    className="field h-9 w-20 py-1"
                  />
                )}
                <select
                  aria-label={`Message ${i + 1}: wait`}
                  value={s.unit}
                  onChange={(e) => update(i, { unit: e.target.value as Unit, amount: s.amount || 1 })}
                  className="field h-9 w-36 py-1"
                >
                  <option value="now">right away</option>
                  <option value="hours">hours later</option>
                  <option value="days">days later</option>
                </select>
                <button type="button" aria-label={`Remove message ${i + 1}`} onClick={() => setSteps((all) => all.filter((_, j) => j !== i))} className="hover:bg-subtle ml-auto inline-flex size-8 items-center justify-center rounded-md">
                  <X className="size-4" aria-hidden />
                </button>
              </div>
              {late ? (
                tpls.length ? (
                  <select aria-label={`Message ${i + 1}: WhatsApp template`} value={s.template} onChange={(e) => update(i, { template: e.target.value })} className="field">
                    <option value="">Pick an approved template</option>
                    {tpls.map((t) => (
                      <option key={tKey(t)} value={tKey(t)}>
                        {t.name} ({t.language}) · {t.body.slice(0, 60)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="meta">A day or more later, WhatsApp only allows an approved template, and this number has none yet. Add one in Settings → WhatsApp templates.</p>
                )
              ) : (
                <textarea aria-label={`Message ${i + 1}: text`} rows={2} value={s.text} onChange={(e) => update(i, { text: e.target.value })} className="field min-h-16 py-2" />
              )}
              {late && <span className="meta">Meta charges for template messages on your WhatsApp account.</span>}
            </li>
          );
        })}
      </ol>
      <Button type="button" variant="secondary" className="self-start" onClick={() => setSteps((all) => [...all, { amount: 1, unit: "days", text: "", template: "" }])}>
        + Add a message
      </Button>
      <p className="meta">{"{first name}"} is filled in for each person.</p>
      <label className="flex min-h-9 items-center gap-3 text-sm">
        <input type="checkbox" name="exitOnReply" value="yes" defaultChecked className="size-4" />
        Stop when they reply
      </label>
      <p className="meta">It always stops for anyone who unsubscribes.</p>
      {state.error && (
        <p role="alert" className="text-danger text-sm">
          {state.error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" name="intent" value="on" variant="primary" disabled={pending}>
          {pending ? "Saving…" : "Turn on"}
        </Button>
        <Button type="submit" name="intent" value="draft" variant="secondary" disabled={pending}>
          Save as draft
        </Button>
        <Button type="button" variant="quiet" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
