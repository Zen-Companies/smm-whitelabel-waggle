"use client";

import { Phone, PhoneMissed, Voicemail } from "lucide-react";
import { useActionState, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { markHandledAction, type DecisionFormState } from "./actions";
import { voicemailUrlAction } from "./call-actions";
import type { InboxEntry } from "./inbox-data";

const length = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/**
 * T82b: a missed call or voicemail (design "Settings · Phone": "Voicemails and missed calls
 * show in the inbox"). No reply box: the owner listens, calls back, and marks it handled.
 */
export function CallCard({ entry }: { entry: InboxEntry & { status: string } }) {
  const [handled, handle, handling] = useActionState<DecisionFormState, FormData>(
    markHandledAction,
    {},
  );
  const [audio, setAudio] = useState<{ url?: string; error?: string; loading?: boolean }>({});
  const voicemail = entry.call?.voicemail === true;
  const caller = entry.authorName;
  const dial = caller && /^\+?\d{6,16}$/.test(caller) ? caller : null;

  return (
    <div
      id={`item-${entry.itemId}`}
      className="border-line-strong flex flex-col gap-3 rounded-xl border p-4"
    >
      <p className="flex items-center gap-2 font-medium">
        {voicemail ? (
          <Voicemail className="text-honey-text size-4" strokeWidth={2} aria-hidden />
        ) : (
          <PhoneMissed className="text-danger size-4" strokeWidth={2} aria-hidden />
        )}
        {voicemail
          ? `Voicemail${entry.call?.durationSeconds ? ` · ${length(entry.call.durationSeconds)}` : ""}`
          : "Missed call"}
      </p>
      {voicemail &&
        (audio.url ? (
          <audio controls autoPlay src={audio.url} className="w-full" />
        ) : (
          <Button
            type="button"
            variant="secondary"
            className="self-start"
            disabled={audio.loading}
            onClick={async () => {
              setAudio({ loading: true });
              const r = await voicemailUrlAction(entry.itemId);
              setAudio(r.url ? { url: r.url } : { error: r.error });
            }}
          >
            {audio.loading ? "Loading…" : "▶ Play voicemail"}
          </Button>
        ))}
      {audio.error && (
        <p role="alert" className="text-danger text-sm">
          {audio.error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {dial && (
          <a href={`tel:${dial}`} className={buttonVariants({ variant: "primary" })}>
            <Phone className="size-4" strokeWidth={2} aria-hidden />
            Call back
          </a>
        )}
        {entry.status === "escalated" && (
          <form action={handle}>
            <input type="hidden" name="itemId" value={entry.itemId} />
            <Button type="submit" variant="quiet" disabled={handling}>
              {handling ? "Saving…" : "Mark as handled"}
            </Button>
          </form>
        )}
      </div>
      {handled.error && (
        <p role="alert" className="text-danger text-sm">
          {handled.error}
        </p>
      )}
    </div>
  );
}
