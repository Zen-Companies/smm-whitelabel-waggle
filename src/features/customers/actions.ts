"use server";

import { z } from "zod";
import { currentStaffAccess } from "@/features/staff";
import { sendEmailConfirmation } from "@/features/tenants";
import { writeAudit } from "@/lib/audit";
import { getServiceClient } from "@/lib/supabase/service";
import { customerGates, STAFF_AUDIT } from "./derive";
import { tenantOwner } from "./load";

// Staff → Customers actions. The permission is checked here too (a Server Action is reachable
// without the page), and every one writes audit_log (staff.customer.*).

const tenantIdSchema = z.uuid();
const linkSchema = z.enum(["copied_email", "opened_stripe", "opened_ghl"]);

const LINK_ACTION = {
  copied_email: STAFF_AUDIT.copiedEmail,
  opened_stripe: STAFF_AUDIT.openedStripe,
  opened_ghl: STAFF_AUDIT.openedGhl,
} as const;

/** Copy owner email, Open in Stripe, Open GoHighLevel contact: logged, nothing else changes. */
export async function logCustomerAction(input: {
  tenantId: unknown;
  action: unknown;
}): Promise<{ ok: boolean }> {
  const tenantId = tenantIdSchema.safeParse(input.tenantId);
  const action = linkSchema.safeParse(input.action);
  if (!tenantId.success || !action.success) return { ok: false };
  const access = await currentStaffAccess();
  if (!customerGates(access.permissions, false).view) return { ok: false };
  const db = getServiceClient();
  const t = await tenantOwner(db, tenantId.data);
  if (!t) return { ok: false };
  await writeAudit(db, {
    tenantId: tenantId.data,
    action: LINK_ACTION[action.data],
    actor: access.userId,
    details: { role: access.role },
  });
  return { ok: true };
}

export type ResendState = { sentAt?: string; error?: string };

/** Send the owner's confirm email again (customers.act; not on an offboarded business). */
export async function resendConfirmEmail(
  _prev: ResendState,
  formData: FormData,
): Promise<ResendState> {
  const tenantId = tenantIdSchema.safeParse(formData.get("tenantId"));
  if (!tenantId.success) return { error: "Not available." };
  const access = await currentStaffAccess();
  const db = getServiceClient();
  const t = await tenantOwner(db, tenantId.data);
  if (!t) return { error: "That business doesn't exist any more." };
  if (!customerGates(access.permissions, t.offboarded).act) return { error: "Not available." };
  if (!t.ownerId) return { error: "This business has no owner login." };
  const [{ data: pending }, { data: user }] = await Promise.all([
    db
      .from("email_confirmations")
      .select("email, confirmed_at")
      .eq("user_id", t.ownerId)
      .maybeSingle(),
    db.auth.admin.getUserById(t.ownerId),
  ]);
  if (!pending)
    return { error: "They signed up without a confirm email (Google, or before 21 Nov)." };
  if (pending.confirmed_at) return { error: "Their email is already confirmed." };
  const meta = (user.user?.user_metadata ?? {}) as Record<string, unknown>;
  const name =
    typeof meta.full_name === "string"
      ? meta.full_name
      : typeof meta.name === "string"
        ? meta.name
        : null;
  try {
    await sendEmailConfirmation(db, { id: t.ownerId, email: pending.email, name });
  } catch {
    return { error: "The email didn't go out. Try again in a minute." };
  }
  await writeAudit(db, {
    tenantId: tenantId.data,
    action: STAFF_AUDIT.resentConfirm,
    actor: access.userId,
    details: { role: access.role },
  });
  return { sentAt: new Date().toISOString() };
}
