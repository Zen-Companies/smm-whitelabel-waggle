"use server";

import * as Sentry from "@sentry/nextjs";
import { revalidatePath } from "next/cache";
import { getTenantFor, NOT_ALLOWED } from "@/features/tenants";
import { writeAudit } from "@/lib/audit";
import { getSocialProvider } from "@/lib/social";
import { getServiceClient } from "@/lib/supabase/service";
import { parseBooking } from "./busy";
import { calendarAccount } from "./data";

export type BookingState = { error?: string; field?: string; done?: string };

/**
 * "Add to calendar" (T81d): the owner adds a booking they confirmed. Waggle never books on its
 * own. Not idempotent upstream: one attempt, and the form shows it's done so it isn't sent twice.
 */
export async function addBookingAction(
  _prev: BookingState,
  formData: FormData,
): Promise<BookingState> {
  const tenant = await getTenantFor("replies.approve");
  if (!tenant) return { error: NOT_ALLOWED };
  const parsed = parseBooking(formData);
  if (!parsed.ok) return { error: parsed.error, field: parsed.field };
  const itemId = String(formData.get("itemId") ?? "");
  const db = getServiceClient();
  const { data: item } = await db
    .from("inbound_items")
    .select("id")
    .eq("id", itemId)
    .eq("tenant_id", tenant.id)
    .maybeSingle();
  if (!item) return { error: "Something went wrong. Reload the page." };
  const account = await calendarAccount(db, tenant.id);
  if (!account) return { error: "Connect Gmail or Outlook with its calendar first." };
  let eventId: string;
  try {
    ({ id: eventId } = await getSocialProvider().createCalendarEvent({
      accountId: account.zernioAccountId,
      title: parsed.value.title,
      start: parsed.value.start,
      end: parsed.value.end,
      description: "Added from Waggle.",
      signal: AbortSignal.timeout(20_000),
    }));
  } catch (error) {
    Sentry.captureException(error, { extra: { tenantId: tenant.id, step: "addBooking" } });
    return {
      error: "Couldn't add it to your calendar right now. Check your calendar before trying again.",
    };
  }
  await writeAudit(db, {
    tenantId: tenant.id,
    itemId,
    action: "booking_added",
    actor: tenant.userId,
    // Ids and times only; the title can hold the customer's name (rule 10 keeps logs id-only).
    details: { eventId, start: parsed.value.start, end: parsed.value.end },
  });
  revalidatePath("/inbox");
  return { done: "Added to your calendar." };
}
