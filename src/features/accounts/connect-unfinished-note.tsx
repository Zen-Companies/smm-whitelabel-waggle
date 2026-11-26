"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { StateMark } from "@/components/app/state-mark";
import {
  connectTroubleTips,
  unfinishedNoteText,
  type UnfinishedConnect,
} from "./connect-unfinished";

// "Didn't finish?" and "Having trouble?" (approved 26 Nov): in place by the Connect button, never
// a toast (design.md §5).

const dismissKey = (id: string) => `waggle:connect-unfinished-dismissed:${id}`;

function wasDismissed(id: string): boolean {
  try {
    return localStorage.getItem(dismissKey(id)) === "1";
  } catch {
    return false;
  }
}

function rememberDismissed(id: string) {
  try {
    localStorage.setItem(dismissKey(id), "1");
  } catch {
    // private window or blocked storage: hidden for this visit only
  }
}

/**
 * The note for a connect that never came back: shows once the try is a minute old, goes at 2
 * hours, and × hides it for that try on this device. `tryAgain` starts a new connect the normal
 * way (the Connect button's own start, or the setup tile's form).
 */
export function UnfinishedNote({
  unfinished,
  label,
  tryAgain,
}: {
  unfinished: UnfinishedConnect;
  label: string;
  tryAgain: ReactNode;
}) {
  const [due, setDue] = useState(unfinished.showInMs === 0);
  const [over, setOver] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads browser storage once
    setDismissed(wasDismissed(unfinished.id));
    const show = window.setTimeout(() => setDue(true), unfinished.showInMs);
    const hide = window.setTimeout(() => setOver(true), unfinished.hideInMs);
    return () => {
      window.clearTimeout(show);
      window.clearTimeout(hide);
    };
  }, [unfinished.id, unfinished.showInMs, unfinished.hideInMs]);

  if (!due || over || dismissed) return null;
  const dismiss = () => {
    rememberDismissed(unfinished.id);
    setDismissed(true);
  };
  return (
    <div
      role="status"
      className="border-honey-border bg-honey-tint flex basis-full flex-col gap-3 rounded-xl border p-3.5 text-sm"
    >
      <div className="flex items-start gap-2.5">
        <span className="mt-1">
          <StateMark state="waiting" />
        </span>
        <p className="text-ink min-w-0 flex-1">{unfinishedNoteText(label)}</p>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Hide this note"
          className="text-ink-2 hover:text-ink hover:bg-subtle -m-1 grid size-8 shrink-0 place-items-center rounded-md"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-3">{tryAgain}</div>
    </div>
  );
}

/** "Having trouble?": the tips, opened in place under the Connect button. */
export function ConnectTrouble({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className={className ?? "basis-full"}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="text-ink-2 hover:text-ink py-1 text-xs font-semibold"
      >
        {open ? "Hide tips" : "Having trouble?"}
      </button>
      {open && (
        <ul
          id={id}
          className="bg-subtle text-ink-2 mt-2 flex list-disc flex-col gap-1 rounded-xl py-2.5 pr-3 pl-7 text-[13px]"
        >
          {connectTroubleTips().map((tip) => (
            <li key={tip}>{tip}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
