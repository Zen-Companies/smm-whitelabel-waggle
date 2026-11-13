"use client";

import { useActionState, useState } from "react";
import { PlatformMark } from "@/components/app/platform-mark";
import { Button } from "@/components/ui/button";
import { platformLabel } from "@/lib/social/platforms";
import type { CommentAutomation } from "@/lib/social/types";
import { saveCommentDm, type AutomationFormState } from "./actions";
import { canDm } from "./comment-dm";

export type AutomationAccount = { zernioId: string; platform: string; username: string | null };

/** "{{first_name}}" back to how owners write it. */
const shown = (s: string | null) => (s ?? "").replace(/\{\{\s*first_name\s*\}\}/g, "{first name}");

/**
 * New or edit a comment-to-DM automation (T77a, design "Automations · comment to DM").
 * Instagram and Facebook get a DM (with an optional button) and an optional public reply; the
 * reply-only platforms show just the public reply.
 */
export function CommentDmForm({
  accounts,
  editing,
  onDone,
}: {
  accounts: AutomationAccount[];
  editing: CommentAutomation | null;
  onDone?: () => void;
}) {
  const [state, action, pending] = useActionState<AutomationFormState, FormData>(
    async (prev, data) => {
      const next = await saveCommentDm(prev, data);
      if (next.savedAt && !next.error) onDone?.();
      return next;
    },
    {},
  );
  const [accountId, setAccountId] = useState(editing?.accountId ?? accounts[0]?.zernioId ?? "");
  const account = accounts.find((a) => a.zernioId === accountId);
  const dm = account ? canDm(account.platform) : true;
  const err = (field: string) =>
    state.field === field && state.error ? (
      <p role="alert" className="text-danger text-sm">
        {state.error}
      </p>
    ) : null;

  return (
    <form action={action} className="flex flex-col gap-4">
      {editing && <input type="hidden" name="id" value={editing.id} />}
      <input type="hidden" name="platform" value={account?.platform ?? ""} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="ca-name" className="text-sm font-medium">
          Name
        </label>
        <input id="ca-name" name="name" defaultValue={editing?.name ?? ""} placeholder="Comment “MENU” → DM the menu" className="field" required />
        {err("name")}
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="ca-account" className="text-sm font-medium">
          Account
        </label>
        <select
          id="ca-account"
          name="accountId"
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          disabled={!!editing}
          className="field"
        >
          {accounts.map((a) => (
            <option key={a.zernioId} value={a.zernioId}>
              {platformLabel(a.platform)} @{a.username ?? "account"}
            </option>
          ))}
        </select>
        {editing && <input type="hidden" name="accountId" value={accountId} />}
        {account && (
          <span className="meta flex items-center gap-2">
            <PlatformMark platform={account.platform} size={18} />
            Any post. It answers comments made after you turn it on.
          </span>
        )}
        {err("accountId")}
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="ca-words" className="text-sm font-medium">
          Words that start it
        </label>
        <input id="ca-words" name="keywords" defaultValue={editing?.keywords.join(", ") ?? ""} placeholder="MENU, price" className="field" />
        <select name="matchMode" defaultValue={editing?.matchMode ?? "contains"} className="field" aria-label="How words match">
          <option value="contains">Anywhere in the comment</option>
          <option value="word">As a whole word</option>
          <option value="exact">The whole comment, exactly</option>
        </select>
        <span className="meta">Separate words with commas. Leave empty to answer every comment. Any case.</span>
      </div>
      {dm && (
        <>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="ca-dm" className="text-sm font-medium">
              Message they get
            </label>
            <textarea id="ca-dm" name="dmMessage" rows={3} defaultValue={shown(editing?.dmMessage ?? null)} placeholder="Hi {first name}! Here's our menu 👉 harbourbean.ph/menu" className="field min-h-20 py-2.5" />
            <span className="meta">{"{first name}"} is filled in for each person.</span>
            {err("dmMessage")}
          </div>
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1.5 text-sm font-medium">
              Button <span className="text-ink-3 font-normal">(optional)</span>
            </legend>
            <div className="grid gap-2 sm:grid-cols-[1fr_2fr]">
              <input name="buttonTitle" defaultValue={editing?.button?.title ?? ""} maxLength={20} placeholder="See the menu" aria-label="Button label" className="field" />
              <input name="buttonUrl" defaultValue={editing?.button?.url ?? ""} placeholder="https://harbourbean.ph/menu" aria-label="Button link" className="field" />
            </div>
            {err("button")}
          </fieldset>
        </>
      )}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="ca-reply" className="text-sm font-medium">
          Public reply under the comment {dm && <span className="text-ink-3 font-normal">(optional)</span>}
        </label>
        <input id="ca-reply" name="commentReply" defaultValue={shown(editing?.commentReply ?? null)} placeholder={dm ? "Sent you a DM! 💬" : "Thanks! Our menu is at harbourbean.ph/menu"} className="field" />
        <span className="meta">
          {dm
            ? "Shown under their comment after the DM goes out."
            : `${account ? platformLabel(account.platform) : "This platform"} doesn't let apps send DMs, so this public reply is all it sends.`}
        </span>
        {err("commentReply")}
      </div>
      <label className="flex min-h-9 items-center gap-3 text-sm">
        <input type="checkbox" name="once" value="yes" defaultChecked={editing?.once ?? true} className="size-4" />
        Only once per person
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" name="intent" value="on" variant="primary" disabled={pending || !accounts.length}>
          {pending ? "Saving…" : editing ? "Save and keep on" : "Turn on"}
        </Button>
        <Button type="submit" name="intent" value="draft" variant="secondary" disabled={pending || !accounts.length}>
          Save as draft
        </Button>
        {onDone && (
          <Button type="button" variant="quiet" onClick={onDone}>
            Cancel
          </Button>
        )}
        {state.error && !state.field && (
          <p role="alert" className="text-danger text-sm">
            {state.error}
          </p>
        )}
      </div>
    </form>
  );
}
