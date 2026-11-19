"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

type Phase = "writing" | "queued" | "failed" | "not_allowed";

/**
 * First connect (20 Nov): a pulled question or lead that waits for its draft (only the reveal's
 * first 20 are written ahead). Opening it asks for the draft right away; the reply shows here
 * when it's written. Said in place, never a toast (design.md §4).
 */
export function DraftOnOpenCard({ itemId }: { itemId: string }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("writing");
  const asked = useRef(false);

  const ask = async () => {
    setPhase("writing");
    try {
      const res = await fetch("/api/catch-up/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId }),
      });
      const data = (await res.json().catch(() => ({}))) as { outcome?: string };
      if (data.outcome === "drafted" || data.outcome === "not_waiting") {
        router.refresh();
      } else if (data.outcome === "queued") {
        setPhase("queued");
        setTimeout(() => router.refresh(), 15_000);
      } else if (data.outcome === "not_allowed") {
        setPhase("not_allowed");
      } else {
        setPhase("failed");
      }
    } catch {
      setPhase("failed");
    }
  };

  useEffect(() => {
    if (asked.current) return;
    asked.current = true;
    void ask();
    // Once per opened item.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId]);

  return (
    <section role="status" className="card flex flex-col gap-2 p-4">
      {phase === "writing" && (
        <>
          <b className="text-[15px]">Waggle is writing a reply…</b>
          <span className="text-ink-2 text-sm">
            It only uses your answers. This takes a few seconds.
          </span>
        </>
      )}
      {phase === "queued" && (
        <>
          <b className="text-[15px]">Waggle is writing a reply</b>
          <span className="text-ink-2 text-sm">It shows here within a minute.</span>
        </>
      )}
      {phase === "not_allowed" && (
        <span className="text-ink-2 text-sm">Only people who approve replies can ask for one.</span>
      )}
      {phase === "failed" && (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm">Couldn’t write a reply just now.</span>
          <Button type="button" variant="secondary" onClick={() => void ask()}>
            Try again
          </Button>
        </div>
      )}
    </section>
  );
}
