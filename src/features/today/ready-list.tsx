"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { Check } from "lucide-react";
import { PlatformMark } from "@/components/app/platform-mark";
import { Button } from "@/components/ui/button";
import { joinNames } from "./today";

type DecisionState = { error?: string; approved?: { at: string }; rejected?: boolean };
type SendAllState = { error?: string; sent?: number; skipped?: number };
type Action<S> = (prev: S, formData: FormData) => Promise<S>;

export type ReadyItem = {
  itemId: string;
  draftId: string;
  name: string;
  platform: string;
  /** "Instagram DM" */
  where: string;
  ago: string;
  text: string;
  reply: string;
  /** The answer it was written from, when there is one. */
  source: string | null;
};

/** Ready to send (design "1 · Today"): Send all asks first, in place, naming who gets a reply. */
export function ReadyList({
  items,
  more,
  decide,
  undo,
  sendAll,
  undoMs,
  replyMax,
  canSend,
}: {
  items: ReadyItem[];
  /** Replies waiting beyond the ones shown here. */
  more: number;
  decide: Action<DecisionState>;
  undo: Action<DecisionState>;
  sendAll: Action<SendAllState>;
  undoMs: number;
  replyMax: number;
  /** Viewers see the replies but can't send them. */
  canSend: boolean;
}) {
  const router = useRouter();
  const [done, setDone] = useState<ReadonlySet<string>>(new Set());
  const [asking, setAsking] = useState(false);
  const [all, sendAllAction, sendingAll] = useActionState(
    async (prev: SendAllState, fd: FormData) => {
      const r = await sendAll(prev, fd);
      if (!r.error) {
        setAsking(false);
        router.refresh();
      }
      return r;
    },
    {},
  );
  const pending = items.filter((i) => !done.has(i.itemId));
  const names = [...new Set(pending.map((i) => i.name))];
  const mark = (id: string, sent: boolean) =>
    setDone((s) => {
      const next = new Set(s);
      if (sent) next.add(id);
      else next.delete(id);
      return next;
    });

  return (
    <section className="card flex flex-col gap-4 p-6" id="ready" aria-labelledby="ready-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="ready-title" className="section-title">
            Ready to send
          </h2>
          <p className="text-ink-3 mt-1 text-sm">
            You asked to check these first. Each one only uses what you wrote in Teach Waggle.
          </p>
        </div>
        {canSend && pending.length > 1 && !asking && (
          <Button type="button" variant="secondary" onClick={() => setAsking(true)}>
            Send all {pending.length}
          </Button>
        )}
      </div>
      {asking && pending.length > 0 && (
        <form
          action={sendAllAction}
          role="group"
          aria-label="Check before sending"
          className="border-honey-border bg-honey-tint flex flex-wrap items-center gap-3 rounded-[14px] border px-4 py-3.5"
        >
          {pending.map((i) => (
            <input key={i.itemId} type="hidden" name="pair" value={`${i.itemId}:${i.draftId}`} />
          ))}
          <p className="min-w-[220px] flex-1 text-sm">
            <b className="font-semibold">
              Send {pending.length} {pending.length === 1 ? "reply" : "replies"}?
            </b>{" "}
            To {joinNames(names)}. Each goes out on its own app, as you.
          </p>
          <Button type="submit" variant="primary" disabled={sendingAll}>
            {sendingAll ? "Sending…" : `Send ${pending.length}`}
          </Button>
          <Button type="button" variant="secondary" onClick={() => setAsking(false)}>
            Cancel
          </Button>
        </form>
      )}
      {all.sent ? (
        <p role="status" className="text-success text-sm font-semibold">
          Sent {all.sent} {all.sent === 1 ? "reply" : "replies"}.
          {all.skipped ? ` ${all.skipped} were already handled.` : ""}
        </p>
      ) : null}
      {all.error && (
        <p role="alert" className="text-danger text-sm">
          {all.error}
        </p>
      )}
      <div className="flex flex-col gap-3">
        {items.map((item) => (
          <ReadyCard
            key={item.itemId}
            item={item}
            decide={decide}
            undo={undo}
            undoMs={undoMs}
            replyMax={replyMax}
            canSend={canSend}
            onSent={(sent) => mark(item.itemId, sent)}
          />
        ))}
      </div>
      {more > 0 && (
        <Link href="/inbox" className="text-honey-text self-start text-sm font-medium underline">
          {more} more in the Inbox
        </Link>
      )}
    </section>
  );
}

function ReadyCard({
  item,
  decide,
  undo,
  undoMs,
  replyMax,
  canSend,
  onSent,
}: {
  item: ReadyItem;
  decide: Action<DecisionState>;
  undo: Action<DecisionState>;
  undoMs: number;
  replyMax: number;
  canSend: boolean;
  onSent: (sent: boolean) => void;
}) {
  const [editing, setEditing] = useState(false);
  // When it was sent (approved); null while waiting or after Undo.
  const [sentAt, setSentAt] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [state, send, sending] = useActionState(async (prev: DecisionState, fd: FormData) => {
    const r = await decide(prev, fd);
    if (r.approved) {
      setExpired(false);
      setSentAt(r.approved.at);
      onSent(true);
    }
    return r;
  }, {});
  const [undone, undoAction, undoing] = useActionState(
    async (prev: DecisionState, fd: FormData) => {
      const r = await undo(prev, fd);
      if (!r.error) {
        setSentAt(null);
        onSent(false);
      }
      return r;
    },
    {},
  );
  const isSent = sentAt !== null;

  useEffect(() => {
    if (!sentAt) return;
    const t = setTimeout(() => setExpired(true), undoMs);
    return () => clearTimeout(t);
  }, [sentAt, undoMs]);

  return (
    <div className="border-line bg-surface flex flex-col gap-3 rounded-2xl border p-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <PlatformMark platform={item.platform} size={28} />
        <b className="text-[15px] font-semibold">{item.name}</b>
        <span className="text-ink-3 text-[13px]">
          {item.where} · {item.ago}
        </span>
      </div>
      {item.text.trim() ? (
        <p className="text-[15px]">&ldquo;{item.text}&rdquo;</p>
      ) : (
        <p className="text-ink-3 text-[15px]">Sent a photo</p>
      )}
      <form action={send} className="flex flex-col gap-3">
        <input type="hidden" name="intent" value="approve" />
        <input type="hidden" name="itemId" value={item.itemId} />
        <input type="hidden" name="draftId" value={item.draftId} />
        <div className="border-honey-border bg-honey-tint rounded-xl border px-3.5 py-3">
          <p className="text-honey-text mb-1 text-xs font-semibold">
            Waggle&apos;s reply{item.source ? ` · from your answer "${item.source}"` : ""}
          </p>
          {editing && !isSent ? (
            <textarea
              name="body"
              defaultValue={item.reply}
              maxLength={replyMax}
              rows={3}
              aria-label={`Reply to ${item.name}`}
              className="field w-full text-[15px]"
            />
          ) : (
            <p className="text-[15px]">{item.reply}</p>
          )}
        </div>
        {isSent ? (
          <p className="text-success flex flex-wrap items-center gap-2 text-sm font-semibold">
            <Check className="size-[18px]" aria-hidden />
            Sent on {item.where.replace(/ (DM|comment|review)$/, "")}.
            {!expired && (
              <Button
                type="submit"
                formAction={undoAction}
                variant="quiet"
                className="h-auto px-1 font-medium underline"
                disabled={undoing}
              >
                {undoing ? "Undoing…" : "Undo"}
              </Button>
            )}
          </p>
        ) : !canSend ? (
          <Link href={`/inbox/items/${item.itemId}`} className="text-honey-text text-sm underline">
            Open in the Inbox
          </Link>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="primary" disabled={sending}>
              {sending ? "Sending…" : "Send"}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setEditing((v) => !v)}>
              {editing ? "Keep Waggle's" : "Edit"}
            </Button>
            <Link
              href={`/inbox/items/${item.itemId}`}
              className="text-ink-2 hover:text-ink inline-flex items-center px-3 text-sm font-medium no-underline"
            >
              I&apos;ll answer it
            </Link>
          </div>
        )}
        {(state.error || undone.error) && (
          <p role="alert" className="text-danger text-sm">
            {state.error ?? undone.error}
          </p>
        )}
      </form>
    </div>
  );
}
