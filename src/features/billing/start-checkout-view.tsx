"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { choosePlan, type PlanActionState } from "./plan-actions";

/**
 * HighLevel's upgrade button (25 Nov): the Owner on Free lands on /plan?start=solo and Stripe
 * Checkout opens straight away (the same choose-plan form as the plan card, sent once). The link's
 * `start` is dropped from the address first, so coming back from Checkout never starts it again.
 * Feedback in place, no toasts (design.md §4).
 */
export function AutoCheckout({
  orgId,
  planId,
  planName,
  back,
  reason,
  quietCancel = false,
}: {
  orgId: string;
  planId: string;
  planName: string;
  /** The page Checkout comes back to (with `reason`, the success pop-up opens there). */
  back?: string;
  /** The pop-up's reason for the success state ("nudge" for Solo, "team" for Team). */
  reason?: string;
  /** Backing out of Checkout returns to `back` with no pop-up (sign-up from the site, 25 Nov). */
  quietCancel?: boolean;
}) {
  const [state, run, pending] = useActionState<PlanActionState, FormData>(choosePlan, {});
  const form = useRef<HTMLFormElement>(null);
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    const url = new URL(window.location.href);
    url.searchParams.delete("start");
    window.history.replaceState(window.history.state, "", url.pathname + url.search);
    form.current?.requestSubmit();
  }, []);

  return (
    <section className="card flex max-w-[1100px] flex-col gap-3 p-6" aria-live="polite">
      <form ref={form} action={run} className="flex flex-col gap-3">
        <input type="hidden" name="orgId" value={orgId} />
        <input type="hidden" name="plan" value={planId} />
        <input type="hidden" name="interval" value="month" />
        {back && reason && (
          <>
            <input type="hidden" name="back" value={back} />
            <input type="hidden" name="reason" value={reason} />
          </>
        )}
        {quietCancel && <input type="hidden" name="cancel" value="quiet" />}
        {state.error ? (
          <>
            <p className="text-ink-2 m-0">{state.error}</p>
            <Button type="submit" disabled={pending} className="self-start">
              {pending ? "Starting…" : `Try ${planName} again`}
            </Button>
          </>
        ) : (
          <p className="text-ink-2 m-0">Opening checkout for {planName}…</p>
        )}
      </form>
    </section>
  );
}
