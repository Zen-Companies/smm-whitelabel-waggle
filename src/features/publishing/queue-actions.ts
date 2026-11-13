"use server";

import * as Sentry from "@sentry/nextjs";
import { revalidatePath } from "next/cache";
import { getTenantFor, NOT_ALLOWED } from "@/features/tenants";
import { writeAudit } from "@/lib/audit";
import { getSocialProvider } from "@/lib/social";
import { getServiceClient } from "@/lib/supabase/service";
import { parseSlotsForm } from "./queue";

export type QueueFormState = { error?: string; savedAt?: number; nextSlots?: string[] };

/** Posts → Queue (T75): saves the brand's posting times in its Zernio queue. */
export async function saveQueue(_prev: QueueFormState, formData: FormData): Promise<QueueFormState> {
  const tenant = await getTenantFor("posts.write");
  if (!tenant) return { error: NOT_ALLOWED };
  if (!tenant.zernioProfileId) {
    return { error: "Connect an account first, then set your posting times." };
  }
  const parsed = parseSlotsForm(formData);
  if (!parsed) return { error: "Pick your time zone." };
  try {
    const queue = await getSocialProvider().saveQueue({
      profileId: tenant.zernioProfileId,
      timezone: parsed.timezone,
      slots: parsed.slots,
      signal: AbortSignal.timeout(15_000),
    });
    await writeAudit(getServiceClient(), {
      tenantId: tenant.id,
      action: "queue_saved",
      actor: tenant.userId,
      details: { slots: parsed.slots.length, timezone: parsed.timezone },
    });
    revalidatePath("/posts");
    return { savedAt: Date.now(), nextSlots: queue.nextSlots.slice(0, 3) };
  } catch (error) {
    Sentry.captureException(error, { extra: { tenantId: tenant.id, step: "saveQueue" } });
    return { error: "Your posting times couldn't be saved. Try again in a moment." };
  }
}
