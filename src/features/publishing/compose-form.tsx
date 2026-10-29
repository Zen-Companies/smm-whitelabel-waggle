"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { composePost, type ComposeState } from "./actions";
import { POST_IMAGE_TYPES, POST_TEXT_MAX } from "./limits";

export interface ComposeAccount {
  id: string;
  platform: string;
  username: string | null;
}

const OUTCOME: Record<NonNullable<ComposeState["outcome"]>, string> = {
  published: "Posted. It shows as published as soon as Instagram/Facebook confirm.",
  scheduled: "Scheduled. It's in your upcoming posts below.",
  waiting: "Saved. It goes out as soon as posting is possible again.",
  failed: "Saved, but it couldn't be posted. See below.",
};

/** Compose a post: text, optional image, accounts, now or later (PRD F3). */
export function ComposeForm({ accounts }: { accounts: ComposeAccount[] }) {
  const [state, action, pending] = useActionState<ComposeState, FormData>(composePost, {});
  // A saved post changes savedAt, which remounts the fields: text, counter and time reset.
  return (
    <ComposeFields
      key={state.savedAt}
      accounts={accounts}
      state={state}
      action={action}
      pending={pending}
    />
  );
}

function ComposeFields({
  accounts,
  state,
  action,
  pending,
}: {
  accounts: ComposeAccount[];
  state: ComposeState;
  action: (formData: FormData) => void;
  pending: boolean;
}) {
  const [when, setWhen] = useState<"now" | "later">("now");
  const [local, setLocal] = useState("");
  const [length, setLength] = useState(0);
  // The datetime-local value is the owner's local time; send it as an absolute ISO time.
  const scheduledFor = local ? new Date(local).toISOString() : "";
  const fieldError = (field: ComposeState["field"]) =>
    state.field === field && state.error ? (
      <p role="alert" className="text-danger text-sm">
        {state.error}
      </p>
    ) : null;

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label htmlFor="post-content" className="text-sm font-medium">
          What do you want to share?
        </label>
        <textarea
          id="post-content"
          name="content"
          rows={4}
          maxLength={POST_TEXT_MAX}
          required
          onChange={(e) => setLength(e.target.value.length)}
          placeholder="New on the menu: ube cheese pandesal, every morning from 7."
          className="field min-h-28 py-3"
        />
        <p className="meta">
          {length} / {POST_TEXT_MAX}
        </p>
        {fieldError("content")}
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="post-image" className="text-sm font-medium">
          Image (optional)
        </label>
        <input
          id="post-image"
          name="image"
          type="file"
          accept={POST_IMAGE_TYPES.join(",")}
          className="file:bg-surface file:text-ink text-sm text-gray-700 file:mr-3 file:min-h-11 file:cursor-pointer file:rounded-md file:border file:border-gray-200 file:px-4 file:text-sm file:font-medium hover:file:bg-gray-50"
        />
        {fieldError("image")}
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">Post to</legend>
        {accounts.length === 0 && (
          <p className="text-muted-foreground text-sm">Connect an account in Settings first.</p>
        )}
        {accounts.map((a) => (
          <label key={a.id} className="flex min-h-11 items-center gap-3 text-sm">
            <input type="checkbox" name="accounts" value={a.id} defaultChecked className="size-4" />
            {a.platform === "facebook" ? "Facebook" : "Instagram"} @{a.username ?? "account"}
          </label>
        ))}
        {fieldError("accounts")}
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">When</legend>
        <div className="segmented self-start" role="radiogroup">
          {(["now", "later"] as const).map((v) => (
            <label key={v} data-active={when === v || undefined}>
              <input
                type="radio"
                name="when"
                value={v}
                checked={when === v}
                onChange={() => setWhen(v)}
                className="sr-only"
              />
              {v === "now" ? "Post now" : "Schedule"}
            </label>
          ))}
        </div>
        {when === "later" && (
          <div className="flex flex-col gap-2">
            <label htmlFor="post-when" className="text-sm font-medium">
              Date and time
            </label>
            <input
              id="post-when"
              type="datetime-local"
              value={local}
              onChange={(e) => setLocal(e.target.value)}
              className="field max-w-xs"
              required
            />
            <input type="hidden" name="scheduledFor" value={scheduledFor} />
          </div>
        )}
        {fieldError("when")}
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" disabled={pending || accounts.length === 0}>
          {pending ? "Saving…" : when === "now" ? "Post now" : "Schedule post"}
        </Button>
        {state.outcome && (
          <p role="status" className="text-sm">
            {OUTCOME[state.outcome]}
          </p>
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
