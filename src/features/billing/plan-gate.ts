// Plan before setup (approved 18 Nov, canvas "Pick a plan before setup"): an organization with no
// live plan sends its owner to /start to pick one (7-day trial, card at checkout). Seats on a
// team ask the owner; test brands pass; Waggle staff see the page with an Admin only Skip. Pure.

export type PlanGate = "open" | "pick" | "ask_owner";

export interface PlanGateInput {
  /** The organization has a trial, a paid plan or a past-due one (planIsLive). */
  live: boolean;
  /** The organization holds a test brand (Staff → Brands). */
  test: boolean;
  /** The user's role in the organization. */
  role: string | null;
  /** Waggle staff who pressed Skip for now (Admin only) for this organization. */
  staffSkipped: boolean;
  /** Back from a finished checkout a moment ago, before Stripe's webhook landed. */
  justCheckedOut: boolean;
}

export function planGate(i: PlanGateInput): PlanGate {
  if (i.live || i.test || i.staffSkipped || i.justCheckedOut) return "open";
  return i.role === "owner" ? "pick" : "ask_owner";
}

/** Where the gate lives, and its two short-lived cookies (value: the organization id). */
export const PLAN_GATE_PATH = "/start";
export const CHECKOUT_OK_COOKIE = "waggle_checkout_ok";
export const PLAN_SKIP_COOKIE = "waggle_plan_skip";
