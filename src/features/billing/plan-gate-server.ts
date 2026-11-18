import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { staffAccess } from "@/features/staff";
import { getCurrentUser } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";
import { loadBilling } from "./billing-store";
import {
  CHECKOUT_OK_COOKIE,
  PLAN_GATE_PATH,
  PLAN_SKIP_COOKIE,
  planGate,
  type PlanGate,
} from "./plan-gate";
import { planIsLive } from "./subscription";

export interface PlanGateState {
  gate: PlanGate;
  /** Waggle staff: the page shows the Admin only box with Skip for now. */
  staff: boolean;
  /** The organization already has a brand (an existing user, not a new sign-up). */
  hasBrand: boolean;
}

/** Whether this organization's people may go on, for the signed-in user with `role` in it. */
export async function planGateFor(orgId: string, role: string | null): Promise<PlanGateState> {
  const db = getServiceClient();
  const [user, bill, { data: brands }, store] = await Promise.all([
    getCurrentUser(),
    loadBilling(db, orgId),
    db.from("tenants").select("is_test").eq("organization_id", orgId),
    cookies(),
  ]);
  const staff = (await staffAccess(db, user.id)).role !== null;
  const gate = planGate({
    live: planIsLive(bill?.status),
    test: (brands ?? []).some((b) => b.is_test),
    role,
    staffSkipped: staff && store.get(PLAN_SKIP_COOKIE)?.value === orgId,
    justCheckedOut: store.get(CHECKOUT_OK_COOKIE)?.value === orgId,
  });
  return { gate, staff, hasBrand: (brands ?? []).length > 0 };
}

/** Sends anyone who must pick a plan (or ask the owner) to /start; does nothing otherwise. */
export async function requirePlan(orgId: string, role: string | null): Promise<void> {
  const { gate, staff } = await planGateFor(orgId, role);
  // Waggle staff looking at a customer's brand (not a member) are never sent away.
  if (staff && role === null) return;
  if (gate !== "open") redirect(PLAN_GATE_PATH);
}
