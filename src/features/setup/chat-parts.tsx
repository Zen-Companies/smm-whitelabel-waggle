"use client";

import { forwardRef, useState, useTransition, type ReactNode } from "react";
import {
  Clock,
  Info,
  MapPin,
  MessagesSquare,
  Phone,
  Store,
  Tag,
  type LucideIcon,
} from "lucide-react";
import { cn } from "cn";
import { BeeBody } from "@/components/app/bee";
// The server action files directly: their feature indexes also export server-only code.
import { decideDraft } from "@/features/approvals/actions";
import { sendFeedback } from "@/features/feedback/actions";
import { Combs } from "./combs";
import type { FactField } from "./chat-fields";
import { highlightParts } from "./copy";
import { PRIMARY, QUIET } from "./setup-frame";
import type { BatchReply } from "./topics";

// The pieces of step 3's thread (board "Step 3 is a conversation with Waggle", approved 23 Nov):
// Waggle's bubbles (the bee as its avatar), the owner's answers (tap one to change it), chips,
// the typing box, the typing combs, and the cards that sit inside Waggle's turns. Every word in
// them is ours; anything a person or the AI wrote shows as plain text.

/** The bee in a honey circle: Waggle. */
export function WaggleAvatar({ size = 28 }: { size?: number }) {
  return (
    <span
      aria-hidden
      className="bg-honey-tint border-honey-border inline-grid shrink-0 place-items-center rounded-full border"
      style={{ width: size, height: size }}
    >
      <svg width={Math.round(size * 0.64)} height={Math.round(size * 0.43)} viewBox="0 0 24 16">
        <BeeBody flutter={false} />
      </svg>
    </span>
  );
}

/** A small flying bee, for "Sending…" and "Still writing". */
export function BeeSmall({ moving = true }: { moving?: boolean }) {
  return (
    <svg
      width="22"
      height="15"
      viewBox="0 0 24 16"
      aria-hidden
      className={cn("shrink-0", moving && "page-loading-dot")}
    >
      <BeeBody flutter={moving} />
    </svg>
  );
}

/** The chat window's top bar (board "Step 3 chat: separate it from the page", option A, 23 Nov). */
export function ChatHeader({ details }: { details: ReactNode }) {
  return (
    <div className="border-line bg-surface flex shrink-0 items-center gap-2 border-b px-3.5 py-3">
      <WaggleAvatar />
      <span className="text-[13px] leading-tight">
        <b className="font-semibold">Waggle</b>
        <br />
        <span className="text-ink-3 text-[12px]">Your assistant · here to help</span>
      </span>
      <span className="ml-auto">{details}</span>
    </div>
  );
}

/** A thin labelled line where a topic starts in the thread. */
export function Divider({ label }: { label: string }) {
  return (
    <p className="text-ink-3 my-1 flex items-center gap-2.5 text-[10.5px] font-bold tracking-[0.6px] uppercase">
      <span aria-hidden className="bg-line h-px flex-1" />
      {label}
      <span aria-hidden className="bg-line h-px flex-1" />
    </p>
  );
}

/** Waggle says: our words, then (optionally) a card. */
export function Waggle({ children, card }: { children?: ReactNode; card?: ReactNode }) {
  return (
    <div className="part-in flex items-start gap-2">
      <WaggleAvatar />
      <div className="flex max-w-[min(460px,calc(100%-36px))] min-w-0 flex-1 flex-col gap-1.5">
        {children !== undefined && children !== null && (
          <span className="border-line bg-surface self-start rounded-[14px_14px_14px_4px] border px-3 py-2 text-[13.5px] break-words">
            {children}
          </span>
        )}
        {card}
      </div>
    </div>
  );
}

/** The owner's answer. Tapped, Waggle asks that question again in place. */
export function Mine({ children, onChange }: { children: ReactNode; onChange?: () => void }) {
  const bubble =
    "bg-ink text-surface max-w-[380px] rounded-[14px_14px_4px_14px] px-3 py-2 text-[13.5px] font-semibold break-words";
  return (
    <div className="part-in flex justify-end">
      {onChange ? (
        <button
          type="button"
          onClick={onChange}
          title="Change this answer"
          aria-label={`Change this answer: ${typeof children === "string" ? children : ""}`}
          className={cn(bubble, "hover:ring-honey text-left hover:ring-2")}
        >
          {children}
        </button>
      ) : (
        <span className={bubble}>{children}</span>
      )}
    </div>
  );
}

/** Waggle is writing: three combs hop (they rest with reduced motion). */
export function Typing() {
  return (
    <div className="flex items-center gap-2" role="status" aria-label="Waggle is writing">
      <WaggleAvatar />
      <span className="border-line bg-surface inline-flex gap-1 rounded-[14px] border px-3 py-2">
        {[0, 1, 2].map((i) => (
          <span key={i} className="page-loading-dot" style={{ animationDelay: `${i * 0.18}s` }}>
            <Combs on={1} of={1} size={9} />
          </span>
        ))}
      </span>
    </div>
  );
}

export interface Chip {
  key: string;
  label: string;
  onClick: () => void;
  /** The first, honey one. */
  main?: boolean;
}

export function Chips({ chips, disabled }: { chips: Chip[]; disabled?: boolean }) {
  return (
    <div className="flex flex-wrap gap-1.5 pl-9">
      {chips.map((c) => (
        <button
          key={c.key}
          type="button"
          disabled={disabled}
          onClick={c.onClick}
          className={cn(
            "inline-flex min-h-8 items-center rounded-full border px-2.5 text-[12.5px] disabled:opacity-50",
            c.main
              ? "bg-honey border-honey font-semibold text-[#17140F]"
              : "border-line bg-surface hover:border-honey",
          )}
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}

/** "Tell me what to change, like you'd tell a new staff member." */
export const TypeBox = forwardRef<
  HTMLInputElement,
  {
    value: string;
    onChange: (v: string) => void;
    onSend: () => void;
    disabled: boolean;
    placeholder: string;
    max: number;
  }
>(function TypeBox({ value, onChange, onSend, disabled, placeholder, max }, ref) {
  return (
    <form
      className="border-honey bg-surface flex items-center gap-1.5 rounded-[14px] border py-1.5 pr-1.5 pl-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!disabled && value.trim()) onSend();
      }}
    >
      <input
        ref={ref}
        type="text"
        value={value}
        maxLength={max}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label="Tell Waggle what to change"
        className="min-w-0 flex-1 bg-transparent py-1.5 text-[13.5px] outline-none disabled:opacity-60"
      />
      <button
        type="submit"
        disabled={disabled || !value.trim()}
        aria-label="Send"
        className="bg-honey inline-grid size-9 shrink-0 place-items-center rounded-full text-[15px] font-semibold text-[#17140F] disabled:opacity-50"
      >
        ↑
      </button>
    </form>
  );
});

export type FactKind = "business" | FactField;

// Each fact's icon and tint (approved 23 Nov): a honeycomb cell, the ink icon inside.
const FACT_ICON: Record<FactKind, { Icon: LucideIcon; fill: string; edge: string }> = {
  business: { Icon: Store, fill: "var(--honey-tint)", edge: "var(--honey-border)" },
  hours: { Icon: Clock, fill: "var(--info-soft)", edge: "var(--line-strong)" },
  address: { Icon: MapPin, fill: "var(--success-soft)", edge: "var(--line-strong)" },
  area: { Icon: MapPin, fill: "var(--success-soft)", edge: "var(--line-strong)" },
  contact: { Icon: Phone, fill: "var(--subtle)", edge: "var(--line-strong)" },
  price: { Icon: Tag, fill: "var(--honey-tint)", edge: "var(--honey-border)" },
  answer: { Icon: MessagesSquare, fill: "var(--info-soft)", edge: "var(--line-strong)" },
};

const HEX = "M7 1 13 4.5v7L7 15 1 11.5v-7Z";

/** The fact's honeycomb tile: tinted when checked, a dashed outline when unchecked or missing. */
function FactTile({ kind, dashed }: { kind?: FactKind; dashed: boolean }) {
  const look = kind ? FACT_ICON[kind] : null;
  const Icon = look?.Icon ?? Info;
  return (
    <span aria-hidden className="relative inline-grid size-8 shrink-0 place-items-center">
      <svg width="28" height="32" viewBox="0 0 14 16" className="absolute inset-0 m-auto">
        {dashed ? (
          <path
            d={HEX}
            fill="none"
            stroke="var(--ink-3)"
            strokeWidth="0.6"
            strokeDasharray="1.2 1"
          />
        ) : (
          <path
            d={HEX}
            fill={look?.fill ?? "var(--subtle)"}
            stroke={look?.edge ?? "var(--line-strong)"}
            strokeWidth="0.6"
          />
        )}
      </svg>
      <Icon
        size={14}
        strokeWidth={1.75}
        className={cn("relative", dashed ? "text-ink-2" : "text-ink")}
      />
    </span>
  );
}

/** One line of the facts card (tap it to fix it). */
export function FactLine({
  kind,
  label,
  value,
  tag,
  onClick,
}: {
  kind?: FactKind;
  label: string;
  value: string | null;
  tag?: string | null;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="border-line hover:bg-subtle flex w-full items-center gap-2.5 border-t px-3 py-2 text-left first:border-t-0"
    >
      <FactTile kind={kind} dashed={!value || !!tag} />
      <span className="min-w-0 flex-1 text-[13px]">
        <span className="text-ink-3 text-[11px]">{label}</span>
        {tag && (
          <span className="bg-honey-tint ml-1.5 rounded-full px-1.5 py-px text-[10.5px] text-[#7A4F00] dark:text-[#F3DFA8]">
            {tag}
          </span>
        )}
        <br />
        {value ? (
          <span className="break-words whitespace-pre-line">{value}</span>
        ) : (
          // Not a dead end (user feedback, 23 Nov): a gentle prompt to add it.
          <span className="text-ink-2 italic">Not set yet · tap to add</span>
        )}
      </span>
      {value ? (
        <span aria-hidden className="text-ink-3">
          ›
        </span>
      ) : (
        <span
          aria-hidden
          className="border-honey-border bg-honey-tint shrink-0 rounded-full border px-2 py-px text-[11px] font-semibold"
        >
          + Add
        </span>
      )}
    </button>
  );
}

/** A reply's text, the facts found on the account (not checked yet) marked. */
export function ReplyText({ text, marks }: { text: string; marks?: string[] }) {
  return (
    <>
      {highlightParts(text, marks ?? []).map((p, i) =>
        p.mark ? (
          <mark
            key={i}
            className="border-honey-border rounded border bg-[#FFF4D9] px-0.5 text-inherit dark:bg-[#3A2E12]"
          >
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  );
}

export function Tick({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex size-[18px] shrink-0 items-center justify-center rounded-[5px] text-[11px]",
        on ? "bg-ink text-surface" : "border-line-strong border-[1.5px]",
      )}
    >
      {on ? "✓" : ""}
    </span>
  );
}

const short = (s: string, n: number) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
};

/** One reply in the "Send them?" card: tick, who and what they asked, Waggle's reply, Edit. */
export function ReplyRow({
  reply,
  on,
  marks,
  onToggle,
  onEdit,
  locked,
}: {
  reply: BatchReply;
  on: boolean;
  marks?: string[];
  onToggle: () => void;
  onEdit: () => void;
  locked: boolean;
}) {
  const name = reply.author ?? "A customer";
  return (
    <li className="border-line flex gap-2 border-t px-3 py-2">
      <label className="flex min-h-9 cursor-pointer items-start pt-0.5">
        <input
          type="checkbox"
          checked={on}
          disabled={locked}
          onChange={onToggle}
          className="sr-only"
          aria-label={`Send the reply to ${name}`}
        />
        <Tick on={on} />
      </label>
      <div className="flex min-w-0 flex-1 flex-col gap-1 text-[12.5px]">
        <span className="break-words">
          <b className="font-semibold">{name}</b>{" "}
          <span className="text-ink-3">· {short(reply.text, 70)}</span>
        </span>
        <span className="bg-honey-tint rounded-[9px] px-2 py-1 text-[13px] break-words whitespace-pre-line">
          <ReplyText text={reply.reply} marks={marks} />
        </span>
        {!locked && (
          <button
            type="button"
            onClick={onEdit}
            className="text-ink-3 hover:text-ink self-start text-[12px] underline"
          >
            Edit
          </button>
        )}
      </div>
    </li>
  );
}

/** One reply changed in place and sent alone (the Inbox's approve with an edit). */
export function EditReply({
  reply,
  onCancel,
  onSent,
}: {
  reply: BatchReply;
  onCancel: () => void;
  onSent: () => void;
}) {
  const [body, setBody] = useState(reply.reply);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <li className="border-line flex flex-col gap-2 border-t px-3 py-2.5">
      <span className="text-[12.5px] break-words">
        <b className="font-semibold">{reply.author ?? "A customer"}</b>{" "}
        <span className="text-ink-3">· {short(reply.text, 70)}</span>
      </span>
      <label className="flex flex-col gap-1 text-xs font-medium">
        Your reply
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          className="field text-[13px] font-normal"
        />
      </label>
      {error && (
        <p role="alert" className="text-danger text-xs">
          {error}
        </p>
      )}
      <span className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className={PRIMARY}
          disabled={pending || !body.trim()}
          data-busy={pending || undefined}
          onClick={() =>
            start(async () => {
              const fd = new FormData();
              fd.set("intent", "approve");
              fd.set("itemId", reply.itemId);
              fd.set("draftId", reply.draftId);
              fd.set("body", body);
              const r = await decideDraft({}, fd);
              if (r.error) setError(r.error);
              else onSent();
            })
          }
        >
          {pending ? "Sending…" : "Send this one"}
        </button>
        <button type="button" className={QUIET} onClick={onCancel}>
          Cancel
        </button>
      </span>
    </li>
  );
}

/** "Tell the team you'd like it": their words, editable, sent with the feedback feature. */
export function FeedbackCard({
  initial,
  tenantId,
  onSent,
  onCancel,
}: {
  initial: string;
  tenantId: string;
  onSent: () => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="card flex flex-col gap-2 p-3">
      <label className="flex flex-col gap-1 text-[12.5px] font-medium">
        To the Waggle team
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          maxLength={4000}
          className="field text-[13px] font-normal"
        />
      </label>
      {error && (
        <p role="alert" className="text-danger text-xs">
          {error}
        </p>
      )}
      <span className="flex flex-wrap items-center justify-end gap-3">
        <button type="button" className={QUIET} onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className={PRIMARY}
          disabled={pending || !text.trim()}
          data-busy={pending || undefined}
          onClick={() =>
            start(async () => {
              const fd = new FormData();
              fd.set("message", text);
              fd.set("type", "idea");
              fd.set("path", "/setup");
              fd.set("tenantId", tenantId);
              const r = await sendFeedback({}, fd);
              if (r.error) setError(r.error);
              else onSent();
            })
          }
        >
          {pending ? "Sending…" : "Send"}
        </button>
      </span>
    </div>
  );
}
