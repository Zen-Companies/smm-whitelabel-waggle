"use client";

import { useState, type ReactNode } from "react";
import type { KnownFact } from "./chat-fields";
import {
  contactProblem,
  joinAddress,
  joinContact,
  splitAddress,
  splitContact,
} from "./chat-editors";
import { PRIMARY, QUIET } from "./setup-frame";

// Step 3's fix editors, copied from the replica's train-chat (24 Nov): labelled rows like a
// phone's Settings list, Save and a quiet Cancel. Every word is the replica's; what the owner (or
// the checked AI value) put in the fields shows as plain text.

const SECONDARY =
  "border-line bg-surface hover:border-honey inline-flex min-h-11 items-center justify-center rounded-xl border px-4 text-sm font-semibold disabled:opacity-60";
const fieldInput =
  "min-w-0 flex-1 bg-transparent py-1.5 text-[14px] outline-none placeholder:text-ink-3";

/** "From what you said: “…”" over an editor the owner's typing opened. */
export function Said({ hint }: { hint: string }) {
  if (!hint) return null;
  return <p className="text-ink-3 px-1 text-xs break-words">From what you said: “{hint}”</p>;
}

function FieldRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex min-h-12 items-center gap-3 px-3.5 py-1.5">
      <span className="text-ink-2 w-[72px] shrink-0 text-sm">{label}</span>
      {children}
    </label>
  );
}

/** Save, and a quiet Cancel (none where "Skip for now" is the way out). */
function Actions({
  save,
  disabled,
  busy,
  onSave,
  onCancel,
  children,
}: {
  save: string;
  disabled: boolean;
  busy: boolean;
  onSave: () => void;
  onCancel?: () => void;
  children?: ReactNode;
}) {
  return (
    <span className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        className={PRIMARY}
        disabled={disabled || busy}
        data-busy={busy || undefined}
        onClick={onSave}
      >
        {busy ? "Saving…" : save}
      </button>
      {children}
      {onCancel && (
        <button type="button" className={QUIET} disabled={busy} onClick={onCancel}>
          Cancel
        </button>
      )}
    </span>
  );
}

const group = "card divide-line flex flex-col divide-y overflow-hidden";

export function AddressCard({
  value,
  hint,
  busy,
  onSave,
  onCancel,
}: {
  value: string;
  hint: string;
  busy: boolean;
  onSave: (v: string) => void;
  onCancel?: () => void;
}) {
  const [start] = useState(() => splitAddress(value));
  const [address, setAddress] = useState(start.address);
  const [landmark, setLandmark] = useState(start.landmark);
  return (
    <div className="flex flex-col gap-2">
      <Said hint={hint} />
      <div className={group}>
        <FieldRow label="Address">
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            maxLength={180}
            autoFocus
            className={fieldInput}
          />
        </FieldRow>
        <FieldRow label="Landmark">
          <input
            value={landmark}
            onChange={(e) => setLandmark(e.target.value)}
            maxLength={80}
            placeholder="Across from the church"
            className={fieldInput}
          />
        </FieldRow>
      </div>
      <p className="text-ink-3 px-1 text-xs">A landmark helps customers find you.</p>
      <Actions
        save="Save address"
        busy={busy}
        disabled={!address.trim()}
        onSave={() => onSave(joinAddress(address, landmark))}
        onCancel={onCancel}
      />
    </div>
  );
}

export function ContactCard({
  value,
  hint,
  busy,
  onSave,
  onCancel,
}: {
  value: string;
  hint: string;
  busy: boolean;
  onSave: (v: string) => void;
  onCancel?: () => void;
}) {
  const [start] = useState(() => splitContact(value));
  const [phone, setPhone] = useState(start.phone);
  const [email, setEmail] = useState(start.email);
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <Said hint={hint} />
      <div className={group}>
        <FieldRow label="Phone">
          <input
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              setProblem(null);
            }}
            inputMode="tel"
            autoComplete="off"
            maxLength={30}
            aria-invalid={problem ? true : undefined}
            className={fieldInput}
          />
        </FieldRow>
        <FieldRow label="Email">
          <input
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setProblem(null);
            }}
            inputMode="email"
            autoComplete="off"
            maxLength={120}
            aria-invalid={problem ? true : undefined}
            className={fieldInput}
          />
        </FieldRow>
      </div>
      {problem && (
        <p role="alert" className="text-danger px-1 text-xs">
          {problem}
        </p>
      )}
      <Actions
        save="Save contact"
        busy={busy}
        disabled={!(phone.trim() || email.trim())}
        onSave={() => {
          const p = contactProblem(phone, email);
          if (p) return setProblem(p);
          onSave(joinContact(phone, email, start.rest));
        }}
        onCancel={onCancel}
      />
    </div>
  );
}

/** "Which one?": the brand's answers, by their question. */
export function AnswerList({
  answers,
  onPick,
}: {
  answers: readonly KnownFact[];
  onPick: (a: KnownFact) => void;
}) {
  return (
    <div className={group}>
      {answers.map((a) => (
        <button
          key={a.id}
          type="button"
          onClick={() => onPick(a)}
          className="hover:bg-subtle flex min-h-12 items-center px-3.5 text-left text-[14px] break-words transition-colors"
        >
          {a.label}
        </button>
      ))}
    </div>
  );
}

/** One answer: the question as a chip, the answer to change, Save / Ask me instead / Cancel. */
export function AnswerCard({
  question,
  value,
  hint,
  busy,
  onSave,
  onAskMe,
  onCancel,
}: {
  question: string;
  value: string;
  hint: string;
  busy: boolean;
  onSave: (v: string) => void;
  onAskMe: () => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(value);
  return (
    <div className="flex flex-col gap-2">
      <Said hint={hint} />
      <div className="card flex flex-col gap-2 p-3">
        <p className="bg-subtle self-start rounded-2xl rounded-bl-md px-3 py-1.5 text-sm break-words">
          {question}
        </p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          maxLength={600}
          autoFocus
          aria-label={`Answer to “${question}”`}
          className="bg-honey-tint focus:ring-honey w-[88%] resize-none self-end rounded-2xl rounded-br-md px-3 py-2 text-[14px] outline-none focus:ring-2"
        />
      </div>
      <Actions
        save="Save answer"
        busy={busy}
        disabled={!text.trim()}
        onSave={() => onSave(text.trim())}
        onCancel={onCancel}
      >
        <button type="button" className={SECONDARY} disabled={busy} onClick={onAskMe}>
          Ask me instead
        </button>
      </Actions>
    </div>
  );
}

/** After new hours: the hours answer rewritten, Update it / Keep the old one. */
export function SyncCard({
  value,
  busy,
  onUpdate,
  onKeep,
}: {
  value: string;
  busy: boolean;
  onUpdate: () => void;
  onKeep: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="card flex flex-col p-3">
        <p className="bg-honey-tint self-end rounded-2xl rounded-br-md px-3 py-2 text-[14px] break-words whitespace-pre-line">
          {value}
        </p>
      </div>
      <span className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={PRIMARY}
          disabled={busy}
          data-busy={busy || undefined}
          onClick={onUpdate}
        >
          {busy ? "Saving…" : "Update it"}
        </button>
        <button type="button" className={QUIET} disabled={busy} onClick={onKeep}>
          Keep the old one
        </button>
      </span>
    </div>
  );
}
