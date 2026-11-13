"use client";

import { useActionState, useState } from "react";
import { PlatformMark } from "@/components/app/platform-mark";
import { Button } from "@/components/ui/button";
import type { CommentAutomation } from "@/lib/social/types";
import { deleteCommentDm, toggleCommentDm, type AutomationFormState } from "./actions";
import { CommentDmForm, type AutomationAccount } from "./comment-dm-form";

/** The brand's comment-to-DM automations with on/off, edit and delete, and "New". */
export function AutomationsList({
  automations,
  accounts,
  canEdit,
}: {
  automations: CommentAutomation[];
  accounts: AutomationAccount[];
  canEdit: boolean;
}) {
  const [open, setOpen] = useState<"new" | string | null>(automations.length ? null : "new");
  const editing = open && open !== "new" ? (automations.find((a) => a.id === open) ?? null) : null;
  return (
    <div className="flex flex-col gap-5">
      {automations.length > 0 && (
        <ul className="card divide-line flex flex-col divide-y">
          {automations.map((a) => (
            <Row key={a.id} a={a} canEdit={canEdit} onEdit={() => setOpen(a.id)} />
          ))}
        </ul>
      )}
      {canEdit && open === null && (
        <Button type="button" variant="primary" className="self-start" onClick={() => setOpen("new")} disabled={!accounts.length}>
          New comment to DM
        </Button>
      )}
      {canEdit && open !== null && (
        <section className="card flex flex-col gap-4 p-5" aria-labelledby="ca-form-title">
          <h2 id="ca-form-title" className="section-title">
            {editing ? `Edit “${editing.name}”` : "New comment to DM"}
          </h2>
          <p className="text-ink-2 text-sm">When someone comments a word, Waggle sends them a message.</p>
          <CommentDmForm key={open} accounts={accounts} editing={editing} onDone={() => setOpen(null)} />
        </section>
      )}
      {!accounts.length && (
        <p className="meta">Connect Instagram, Facebook, TikTok, Threads, LinkedIn or YouTube first.</p>
      )}
    </div>
  );
}

function Row({ a, canEdit, onEdit }: { a: CommentAutomation; canEdit: boolean; onEdit: () => void }) {
  const [state, toggle, toggling] = useActionState<AutomationFormState, FormData>(toggleCommentDm, {});
  const [delState, remove, removing] = useActionState<AutomationFormState, FormData>(deleteCommentDm, {});
  const [confirm, setConfirm] = useState(false);
  const words = a.keywords.length ? a.keywords.map((k) => `“${k}”`).join(", ") : "any comment";
  return (
    <li className="flex flex-wrap items-start gap-3 px-4 py-3.5">
      <PlatformMark platform={a.platform} size={30} />
      <span className="flex min-w-0 flex-1 flex-col">
        <b className="font-semibold">{a.name}</b>
        <span className="meta">
          {words} · {a.postTitle ? `Post: ${a.postTitle}` : "Any post"} · {a.stats.dmsSent || a.stats.triggered} sent
          {a.stats.dmsFailed ? ` · ${a.stats.dmsFailed} couldn't be sent` : ""}
          {a.stats.linkClicks ? ` · ${a.stats.linkClicks} link clicks` : ""}
        </span>
        {(state.error || delState.error) && (
          <span role="alert" className="text-danger text-sm">
            {state.error ?? delState.error}
          </span>
        )}
      </span>
      <span
        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${a.isActive ? "bg-success-soft text-success" : "bg-subtle text-ink-2"}`}
      >
        {a.isActive ? "On" : "Off"}
      </span>
      {canEdit && (
        <span className="flex flex-wrap items-center gap-1">
          <form action={toggle}>
            <input type="hidden" name="id" value={a.id} />
            <input type="hidden" name="on" value={a.isActive ? "no" : "yes"} />
            <Button type="submit" variant="quiet" disabled={toggling}>
              {a.isActive ? "Turn off" : "Turn on"}
            </Button>
          </form>
          <Button type="button" variant="quiet" onClick={onEdit}>
            Edit
          </Button>
          {confirm ? (
            <form action={remove} className="flex items-center gap-1">
              <input type="hidden" name="id" value={a.id} />
              <Button type="submit" variant="quiet" className="text-danger" disabled={removing}>
                Delete for good
              </Button>
              <Button type="button" variant="quiet" onClick={() => setConfirm(false)}>
                Keep
              </Button>
            </form>
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
