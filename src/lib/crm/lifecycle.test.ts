import { describe, expect, it } from "vitest";
import { lifecycleEvents, type BillState } from "./lifecycle";

const bill = (status: string, plan = "business", cancel = false): BillState => ({
  status,
  plan,
  cancel_at_period_end: cancel,
});
const names = (b: BillState | null, a: BillState, paid = false) =>
  lifecycleEvents(b, a, paid).map((e) => e.event);

describe("lifecycleEvents", () => {
  it("a new subscription with a trial starts the trial", () => {
    expect(names(null, bill("trialing"))).toEqual(["trial_started"]);
    expect(names(bill("canceled"), bill("trialing"))).toEqual(["trial_started"]);
    expect(names(bill("trialing"), bill("trialing"))).toEqual([]);
  });

  it("the first payment converts, with or without a trial", () => {
    expect(names(bill("trialing"), bill("active"))).toEqual(["trial_converted"]);
    expect(names(null, bill("active"))).toEqual(["trial_converted"]);
    expect(names(bill("active"), bill("active"))).toEqual([]);
  });

  it("a failed payment, then its recovery", () => {
    expect(names(bill("active"), bill("past_due"))).toEqual(["payment_failed"]);
    expect(names(bill("trialing"), bill("past_due"))).toEqual(["payment_failed"]);
    expect(names(bill("past_due"), bill("active"), true)).toEqual(["payment_recovered"]);
    // The first payment failed at the trial's end, then went through: that's the conversion too.
    expect(names(bill("past_due"), bill("active"), false)).toEqual([
      "trial_converted",
      "payment_recovered",
    ]);
  });

  it("a plan change says the plan before", () => {
    expect(lifecycleEvents(bill("active", "solo"), bill("active", "team"), true)).toEqual([
      { event: "plan_changed", details: { from_plan: "solo" } },
    ]);
  });

  it("canceling during the trial vs after paying (sent when the owner asks)", () => {
    expect(lifecycleEvents(bill("trialing"), bill("trialing", "business", true), false)).toEqual([
      { event: "canceled", details: { after_paying: false } },
    ]);
    expect(lifecycleEvents(bill("active"), bill("active", "business", true), true)).toEqual([
      { event: "canceled", details: { after_paying: true } },
    ]);
    // It then ends at the period's end: nothing more.
    expect(names(bill("trialing", "business", true), bill("canceled", "business", true))).toEqual(
      [],
    );
  });

  it("ending without a cancel request: never paid = trial expired, paid = canceled", () => {
    expect(names(bill("trialing"), bill("canceled"), false)).toEqual(["trial_expired"]);
    expect(names(bill("past_due"), bill("canceled"), false)).toEqual(["trial_expired"]);
    expect(lifecycleEvents(bill("past_due"), bill("canceled"), true)).toEqual([
      { event: "canceled", details: { after_paying: true } },
    ]);
  });
});
