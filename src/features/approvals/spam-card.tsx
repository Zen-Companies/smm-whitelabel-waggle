"use client";

import { CircleAlert, CircleCheck } from "lucide-react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { hideSpamAction, notSpamAction, unhideAction, type SpamFormState } from "./actions";
import type { InboxEntry } from "./inbox-data";
import { platformLabel } from "@/lib/social/platforms";

const platformName = (entry: Pick<InboxEntry, "platform">) => platformLabel(entry.platform);

/** The "already gone" note, shown in place after a hide (design v3, T40). */
function GoneNote({ platform }: { platform: string }) {
  return (
    <p
      role="status"
      className="border-line flex items-center gap-2.5 rounded-xl border px-4 py-3.5"
    >
      <CircleAlert className="text-danger size-4 shrink-0" strokeWidth={2} aria-hidden />
      {platform} says this comment is already gone. Nothing to hide.
    </p>
  );
}

/**
 * A spam comment waiting for the owner (T40, "Hide spam" artboard): Waggle won't reply; hide it
 * so customers don't see it under the post, or say it isn't spam.
 */
export function SpamCard({ entry }: { entry: InboxEntry }) {
  const [hide, hideAction, hiding] = useActionState<SpamFormState, FormData>(hideSpamAction, {});
  const [notSpam, notSpamFormAction, saving] = useActionState<SpamFormState, FormData>(
    notSpamAction,
    {},
  );
  const platform = platformName(entry);
  const pending = hiding || saving;
  const error = hide.error ?? notSpam.error;

  if (hide.outcome === "gone") return <GoneNote platform={platform} />;

  return (
    <div
      id={`item-${entry.itemId}`}
      className="border-line-strong flex flex-col gap-2.5 rounded-xl border p-4"
    >
      <p className="font-semibold">This looks like spam</p>
      <p className="text-ink-2">
        Waggle won&apos;t reply. Hide it so your customers don&apos;t see it under your post. Only{" "}
        {entry.authorName ?? "the person who wrote it"} and you will still see it.
      </p>
      <div className="border-subtle flex flex-wrap items-center gap-1 border-t pt-2.5">
        <form action={notSpamFormAction}>
          <input type="hidden" name="itemId" value={entry.itemId} />
          <Button type="submit" variant="quiet" disabled={pending}>
            It&apos;s not spam
          </Button>
        </form>
        <form action={hideAction} className="ml-auto">
          <input type="hidden" name="itemId" value={entry.itemId} />
          <Button type="submit" variant="ink" disabled={pending} data-busy={hiding || undefined}>
            {hiding ? "Hiding…" : `Hide on ${platform}`}
          </Button>
        </form>
      </div>
      {error && (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * The footer of a spam comment in Ignored (T40): "Hidden on Instagram" with Unhide, or, when it
 * is still visible on the post (never hidden, or unhidden), the way to hide it.
 */
export function SpamCommentFooter({ entry }: { entry: InboxEntry }) {
  const [unhide, unhideFormAction, unhiding] = useActionState<SpamFormState, FormData>(
    unhideAction,
    {},
  );
  const [hide, hideFormAction, hiding] = useActionState<SpamFormState, FormData>(
    hideSpamAction,
    {},
  );
  const platform = platformName(entry);
  const error = unhide.error ?? hide.error;

  if (hide.outcome === "gone") return <GoneNote platform={platform} />;

  return (
    <div className="flex flex-col gap-2">
      {entry.hiddenOnPlatformAt ? (
        <form
          action={unhideFormAction}
          className="border-line flex flex-wrap items-center gap-2.5 rounded-xl border px-4 py-3.5"
        >
          <CircleCheck className="text-success size-4 shrink-0" strokeWidth={2} aria-hidden />
          <span role="status">Hidden on {platform}. It&apos;s moved to Ignored.</span>
          <input type="hidden" name="itemId" value={entry.itemId} />
          <Button type="submit" variant="secondary" className="ml-auto" disabled={unhiding}>
            {unhiding ? "Unhiding…" : "Unhide"}
          </Button>
        </form>
      ) : (
        <form
          action={hideFormAction}
          className="border-line flex flex-wrap items-center gap-2.5 rounded-xl border px-4 py-3.5"
        >
          <span className="text-ink-2">
            Ignored: it looked like spam. It still shows on your post.
          </span>
          <input type="hidden" name="itemId" value={entry.itemId} />
          <Button type="submit" variant="ink" className="ml-auto" disabled={hiding}>
            {hiding ? "Hiding…" : `Hide on ${platform}`}
          </Button>
        </form>
      )}
      {error && (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
