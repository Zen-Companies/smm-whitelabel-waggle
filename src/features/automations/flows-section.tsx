"use client";

import { ArrowDown, ArrowUp, X } from "lucide-react";
import { SidePanel } from "@/components/app/side-panel";
import { EmptySpot } from "@/components/app/empty-spot";
import { useActionState, useState } from "react";
import { PlatformMark } from "@/components/app/platform-mark";
import { Button } from "@/components/ui/button";
import { platformLabel } from "@/lib/social/platforms";
import type { ChatFlow } from "@/lib/social/types";
import { changeFlow, saveFlow, type AutomationFormState } from "./actions";
import type { FlowStep } from "./chat-flow";
import { chatLink, linkCode, pageHandle } from "./links";
import type { AutomationAccount } from "./comment-dm-form";

const STEP_LABEL: Record<FlowStep["kind"], string> = {
  send: "Send a message",
  wait: "Wait for their answer",
  tag: "Tag them",
  handoff: "Hand over to you",
};

const START: FlowStep[] = [
  { kind: "send", text: "For how many people, and what day?" },
  { kind: "wait", hours: 24, saveAs: "answer" },
  { kind: "tag", tag: "booking" },
  { kind: "handoff", note: "Booking request" },
];

/** Chat flows (T77b, design "Automations · chat flow"): list, on/off, delete, and New. */
export function FlowsSection({
  flows,
  accounts,
  canEdit,
}: {
  flows: ChatFlow[];
  accounts: AutomationAccount[];
  canEdit: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-5">
      {flows.length === 0 && <EmptySpot>No chat flows yet. A flow runs a short conversation on its own, then hands over to you.</EmptySpot>}
      {flows.length > 0 && (
        <ul className="card divide-line flex flex-col divide-y">
          {flows.map((f) => (
            <FlowRow key={f.id} f={f} canEdit={canEdit} />
          ))}
        </ul>
      )}
      {canEdit && !open && (
        <Button type="button" variant="primary" className="self-start" onClick={() => setOpen(true)} disabled={!accounts.length}>
          New chat flow
        </Button>
      )}
      {canEdit && open && accounts.length > 0 && (
        <SidePanel label="New chat flow" onClose={() => setOpen(false)}>
          <p className="text-ink-2 text-sm">A short conversation that runs on its own, then hands over to you.</p>
          <FlowForm accounts={accounts} onDone={() => setOpen(false)} />
        </SidePanel>
      )}
      {!accounts.length && <p className="meta">Connect WhatsApp, Instagram, Facebook, Telegram, Bluesky or TikTok first.</p>}
    </div>
  );
}

function FlowRow({ f, canEdit }: { f: ChatFlow; canEdit: boolean }) {
  const [state, act, pending] = useActionState<AutomationFormState, FormData>(changeFlow, {});
  const [confirm, setConfirm] = useState(false);
  const op = (value: string, label: string, danger = false) => (
    <form action={act}>
      <input type="hidden" name="id" value={f.id} />
      <input type="hidden" name="op" value={value} />
      <Button type="submit" variant="quiet" className={danger ? "text-danger" : undefined} disabled={pending}>
        {label}
      </Button>
    </form>
  );
  return (
    <li className="flex flex-wrap items-start gap-3 px-4 py-3.5">
      <PlatformMark platform={f.platform} size={30} />
      <span className="flex min-w-0 flex-1 flex-col">
        <b className="font-semibold">{f.name}</b>
        <span className="meta">
          {platformLabel(f.platform)} · {f.started} started · {f.completed} finished
        </span>
        {state.error && (
          <span role="alert" className="text-danger text-sm">
            {state.error}
          </span>
        )}
      </span>
      <span
        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${f.status === "active" ? "bg-success-soft text-success" : "bg-subtle text-ink-2"}`}
      >
        {f.status === "active" ? "On" : f.status === "paused" ? "Paused" : "Draft"}
      </span>
      {canEdit && (
        <span className="flex flex-wrap items-center gap-1">
          {f.status === "active" ? op("off", "Pause") : op("on", "Turn on")}
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
    </li>
  );
}

/**
 * The chat flow form. `mode: "link"` (T77d) starts it from an ig.me / m.me link code instead of
 * words, and shows the link as it's typed.
 */
export function FlowForm({
  accounts,
  onDone,
  mode = "words",
}: {
  accounts: AutomationAccount[];
  onDone: () => void;
  mode?: "words" | "link";
}) {
  const [state, action, pending] = useActionState<AutomationFormState, FormData>(
    async (prev, data) => {
      const next = await saveFlow(prev, data);
      if (next.savedAt && !next.error) onDone();
      return next;
    },
    {},
  );
  const [accountId, setAccountId] = useState(accounts[0]?.zernioId ?? "");
  const [steps, setSteps] = useState<FlowStep[]>(START);
  const [code, setCode] = useState("");
  const [page, setPage] = useState("");
  const account = accounts.find((a) => a.zernioId === accountId);
  const update = (i: number, s: FlowStep) => setSteps((all) => all.map((x, j) => (j === i ? s : x)));
  const move = (i: number, by: number) =>
    setSteps((all) => {
      const next = [...all];
      const [s] = next.splice(i, 1);
      next.splice(i + by, 0, s);
      return next;
    });
  const add = (kind: FlowStep["kind"]) =>
    setSteps((all) => [
      ...all,
      kind === "send"
        ? { kind, text: "" }
        : kind === "wait"
          ? { kind, hours: 24, saveAs: "answer" }
          : kind === "tag"
            ? { kind, tag: "" }
            : { kind, note: "" },
    ]);
  const err = (field: string) =>
    state.field === field && state.error ? (
      <p role="alert" className="text-danger text-sm">
        {state.error}
      </p>
    ) : null;

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="platform" value={account?.platform ?? ""} />
      <input type="hidden" name="steps" value={JSON.stringify(steps)} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="flow-name" className="text-sm font-medium">
          Name
        </label>
        <input id="flow-name" name="name" placeholder="Bookings by message" className="field" required />
        {err("name")}
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="flow-account" className="text-sm font-medium">
          Account
        </label>
        <select id="flow-account" name="accountId" value={accountId} onChange={(e) => setAccountId(e.target.value)} className="field">
          {accounts.map((a) => (
            <option key={a.zernioId} value={a.zernioId}>
              {platformLabel(a.platform)} @{a.username ?? "account"}
            </option>
          ))}
        </select>
        {err("accountId")}
      </div>
      {mode === "words" ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="flow-words" className="text-sm font-medium">
            When someone sends
          </label>
          <input id="flow-words" name="keywords" placeholder="BOOK, reserve" className="field" />
          <span className="meta">Words, separated by commas. Leave empty to start on any message. Starts again for the same person after a day at the earliest.</span>
        </div>
      ) : (
        <LinkFields account={account} code={code} setCode={setCode} page={page} setPage={setPage} error={err} />
      )}
      <ol className="flex flex-col gap-2">
        {steps.map((s, i) => (
          <li key={i} className="border-line flex flex-col gap-2 rounded-xl border p-3">
            <div className="flex items-center gap-2">
              <span className="text-ink-3 w-5 text-sm tabular-nums">{i + 1}</span>
              <b className="flex-1 text-sm font-semibold">{STEP_LABEL[s.kind]}</b>
              <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)} className="hover:bg-subtle inline-flex size-8 items-center justify-center rounded-md disabled:opacity-30">
                <ArrowUp className="size-4" aria-hidden />
              </button>
              <button type="button" aria-label="Move down" disabled={i === steps.length - 1} onClick={() => move(i, 1)} className="hover:bg-subtle inline-flex size-8 items-center justify-center rounded-md disabled:opacity-30">
                <ArrowDown className="size-4" aria-hidden />
              </button>
              <button type="button" aria-label="Remove step" onClick={() => setSteps((all) => all.filter((_, j) => j !== i))} className="hover:bg-subtle inline-flex size-8 items-center justify-center rounded-md">
                <X className="size-4" aria-hidden />
              </button>
            </div>
            {s.kind === "send" && (
              <textarea aria-label={`Step ${i + 1}: message`} rows={2} value={s.text} onChange={(e) => update(i, { ...s, text: e.target.value })} className="field min-h-16 py-2" />
            )}
            {s.kind === "wait" && (
              <label className="flex flex-wrap items-center gap-2 text-sm">
                Up to
                <input type="number" min={1} max={720} value={s.hours} onChange={(e) => update(i, { ...s, hours: Number(e.target.value) || 24 })} className="field h-9 w-20 py-1" />
                hours, and keep the answer
              </label>
            )}
            {s.kind === "tag" && (
              <input aria-label={`Step ${i + 1}: tag`} value={s.tag} onChange={(e) => update(i, { ...s, tag: e.target.value })} placeholder="booking" className="field" />
            )}
            {s.kind === "handoff" && (
              <input aria-label={`Step ${i + 1}: note for you`} value={s.note} onChange={(e) => update(i, { ...s, note: e.target.value })} placeholder="Note for you, e.g. Booking request" className="field" />
            )}
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-2">
        {(Object.keys(STEP_LABEL) as FlowStep["kind"][]).map((k) => (
          <Button key={k} type="button" variant="secondary" onClick={() => add(k)}>
            + {STEP_LABEL[k]}
          </Button>
        ))}
      </div>
      {err("steps")}
      {account && (account.platform === "instagram" || account.platform === "facebook") && (
        <p className="meta">Instagram and Facebook flows can only message within 24 hours of the person&apos;s last message.</p>
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
        {state.error && !state.field && (
          <p role="alert" className="text-danger text-sm">
            {state.error}
          </p>
        )}
      </div>
    </form>
  );
}

function LinkFields({
  account,
  code,
  setCode,
  page,
  setPage,
  error,
}: {
  account: AutomationAccount | undefined;
  code: string;
  setCode: (v: string) => void;
  page: string;
  setPage: (v: string) => void;
  error: (field: string) => React.ReactNode;
}) {
  const fb = account?.platform === "facebook";
  const known = fb ? pageHandle(account?.username ?? null) : (account?.username ?? null);
  const handle = fb ? (pageHandle(page) ?? known) : known;
  const clean = linkCode(code);
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="link-code" className="text-sm font-medium">
          Link code
        </label>
        <input
          id="link-code"
          name="linkCode"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="table-menu"
          className="field"
          required
        />
        <span className="meta">Letters, numbers and dashes. It goes at the end of the link.</span>
        {error("linkCode")}
      </div>
      {fb && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="link-page" className="text-sm font-medium">
            Your Page&apos;s username
          </label>
          <input
            id="link-page"
            name="pageHandle"
            value={page}
            onChange={(e) => setPage(e.target.value)}
            placeholder={known ?? "harbourbeancafe"}
            className="field"
          />
          <span className="meta">As in facebook.com/yourpage.</span>
          {error("pageHandle")}
        </div>
      )}
      {account && handle && clean && (
        <p className="meta">
          Link: <span className="text-ink font-mono">{chatLink(account.platform, handle, clean)}</span>
        </p>
      )}
    </>
  );
}
