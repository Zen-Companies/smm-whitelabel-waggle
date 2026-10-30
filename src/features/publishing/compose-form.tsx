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
  scheduled: "Scheduled. It's on the calendar.",
  waiting: "Saved. It goes out as soon as posting is possible again.",
  failed: "Saved, but it couldn't be posted. It's marked on the calendar.",
};

/** "Sun 7:00 AM" for the Schedule button, so the owner sees exactly what will happen. */
function whenLabel(date: string, time: string): string {
  const at = new Date(`${date}T${time}`);
  if (Number.isNaN(at.getTime())) return "";
  return `${at.toLocaleDateString(undefined, { weekday: "short" })} ${at.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
}

const localDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * Compose a post: text, optional photo, accounts, now or on a day and time (PRD F3, design v2).
 * `day` (YYYY-MM-DD) comes from clicking a day on the calendar and preselects Schedule.
 */
export function ComposeForm({
  accounts,
  day = null,
}: {
  accounts: ComposeAccount[];
  day?: string | null;
}) {
  const [state, action, pending] = useActionState<ComposeState, FormData>(composePost, {});
  // A saved post changes savedAt, which remounts the fields: text, counter and time reset.
  return (
    <ComposeFields
      key={state.savedAt}
      accounts={accounts}
      day={day}
      state={state}
      action={action}
      pending={pending}
    />
  );
}

function ComposeFields({
  accounts,
  day,
  state,
  action,
  pending,
}: {
  accounts: ComposeAccount[];
  day: string | null;
  state: ComposeState;
  action: (formData: FormData) => void;
  pending: boolean;
}) {
  const [when, setWhen] = useState<"now" | "later">(day ? "later" : "now");
  const [date, setDate] = useState(() => day ?? localDay(new Date(Date.now() + 24 * 3_600_000)));
  const [time, setTime] = useState("09:00");
  const [length, setLength] = useState(0);
  const [photo, setPhoto] = useState<string | null>(null);
  // Day and time are the owner's local time; send them as an absolute ISO time.
  const at = date && time ? new Date(`${date}T${time}`) : null;
  const scheduledFor = at && !Number.isNaN(at.getTime()) ? at.toISOString() : "";
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
        <div className="flex items-center gap-3">
          <label
            htmlFor="post-image"
            className="border-line-strong text-pollen hover:bg-hive-high flex size-16 shrink-0 cursor-pointer items-center justify-center rounded-md border border-dashed text-center text-xs has-[:focus-visible]:outline-2"
          >
            {photo ? "Change photo" : "Add photo"}
            <input
              id="post-image"
              name="image"
              type="file"
              accept={POST_IMAGE_TYPES.join(",")}
              onChange={(e) => setPhoto(e.target.files?.[0]?.name ?? null)}
              className="sr-only"
            />
          </label>
          <span className="meta min-w-0 truncate">{photo ?? "JPG or PNG, up to 5 MB"}</span>
        </div>
        {fieldError("image")}
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">Post to</legend>
        {accounts.length === 0 && (
          <p className="text-pollen text-sm">Connect an account in Settings first.</p>
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
              {v === "now" ? "Now" : "Schedule"}
            </label>
          ))}
        </div>
        {when === "later" && (
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="post-day" className="text-sm font-medium">
                Day
              </label>
              <input
                id="post-day"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="field"
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="post-time" className="text-sm font-medium">
                Time
              </label>
              <input
                id="post-time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="field"
                required
              />
            </div>
            <input type="hidden" name="scheduledFor" value={scheduledFor} />
          </div>
        )}
        {fieldError("when")}
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" disabled={pending || accounts.length === 0}>
          {pending
            ? "Saving…"
            : when === "now"
              ? "Post now"
              : `Schedule${whenLabel(date, time) ? ` for ${whenLabel(date, time)}` : ""}`}
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
