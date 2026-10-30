"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { BeeResting } from "@/components/app/bee";
import { Button } from "@/components/ui/button";

/**
 * Something went wrong (docs/design.md §6): the bee rests on a closed honeycomb. Calm and plain,
 * no jokes. The error goes to Sentry by its digest only (rule 10).
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <main className="mx-auto flex w-full max-w-[1240px] flex-col items-center gap-4 px-4 py-16 text-center md:px-8">
      <BeeResting />
      <h1 className="page-title">We couldn&apos;t load this.</h1>
      <p className="text-ink-2 max-w-sm">
        Your messages are safe. Try again in a moment; if it keeps happening, we&apos;re already
        looking into it.
      </p>
      <Button variant="primary" onClick={reset}>
        Try again
      </Button>
    </main>
  );
}
