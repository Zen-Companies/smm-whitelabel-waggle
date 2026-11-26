"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import type { CheckNowView } from "./actions";

const POLL_MS = 2500;

/**
 * Check now (board "Your week", approved 26 Nov): the button and its line, in place (no toasts,
 * design.md §5). Checking shows progress; when done it says what it found and refreshes the card.
 */
export function CheckNow({
  initial,
  canCheck,
  check,
  progress,
}: {
  initial: CheckNowView;
  canCheck: boolean;
  check: () => Promise<CheckNowView>;
  progress: (runId: string) => Promise<CheckNowView>;
}) {
  const router = useRouter();
  const [view, setView] = useState<CheckNowView>(initial);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (view.kind !== "checking") return;
    const timer = setTimeout(async () => {
      if (!view.runId) {
        router.refresh();
        return;
      }
      const next = await progress(view.runId);
      setView(next);
      if (next.kind === "checked") router.refresh();
    }, POLL_MS);
    return () => clearTimeout(timer);
  }, [view, progress, router]);

  const checking = view.kind === "checking";
  const disabled =
    !canCheck || pending || checking || view.kind === "used" || view.kind === "checked";
  const label = checking ? view.label : pending ? "Starting…" : "Check now";

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2" aria-live="polite">
      <Button
        type="button"
        variant="secondary"
        disabled={disabled}
        onClick={() => startTransition(async () => setView(await check()))}
      >
        {label}
      </Button>
      {view.kind === "checking" && view.note && (
        <span className="text-ink-3 min-w-[200px] flex-1 text-sm">{view.note}</span>
      )}
      {view.kind === "used" && (
        <span className="text-ink-3 min-w-[200px] flex-1 text-sm">{view.line}</span>
      )}
      {view.kind === "error" && (
        <span role="alert" className="text-danger min-w-[200px] flex-1 text-sm">
          {view.line}
        </span>
      )}
      {view.kind === "checked" && (
        <span className="flex min-w-[200px] flex-1 flex-col gap-1 text-sm">
          <span>
            <span className="text-success" aria-hidden>
              ●{" "}
            </span>
            <b>Checked just now.</b> {view.line}
          </span>
          {view.couldntRead && (
            <span className="text-ink-2">
              {view.couldntRead}{" "}
              <Link href="/settings/accounts" className="link-inline">
                Reconnect
              </Link>{" "}
              · the rest is up to date.
            </span>
          )}
        </span>
      )}
    </div>
  );
}
