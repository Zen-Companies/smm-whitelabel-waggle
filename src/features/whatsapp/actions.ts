"use server";

import * as Sentry from "@sentry/nextjs";
import { revalidatePath } from "next/cache";
import { getTenantFor, NOT_ALLOWED } from "@/features/tenants";
import { getSocialProvider } from "@/lib/social";
import { getServiceClient } from "@/lib/supabase/service";
import { createTemplateFor, newTemplateSchema } from "./templates";

export interface TemplateFormState {
  error?: string;
  /** Sent to Meta: the form resets and the list shows it "In review". */
  savedAt?: number;
}

const ERRORS = {
  no_account: "Connect WhatsApp first.",
  name_taken: "There's already a template with that name. Pick another name.",
  rejected: "WhatsApp didn't accept it as written. Check the text and try again.",
} as const;

/** Settings → WhatsApp templates → New template: sent to Meta for review. */
export async function createTemplate(
  _prev: TemplateFormState,
  formData: FormData,
): Promise<TemplateFormState> {
  const parsed = newTemplateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  const tenant = await getTenantFor("accounts.manage");
  if (!tenant) return { error: NOT_ALLOWED };
  try {
    const result = await createTemplateFor(
      { db: getServiceClient(), social: getSocialProvider() },
      { tenantId: tenant.id, actor: tenant.userId, ...parsed.data },
    );
    if (!result.ok) return { error: ERRORS[result.error] };
  } catch (error) {
    Sentry.captureException(error, { extra: { tenantId: tenant.id, step: "waTemplate" } });
    return { error: "Couldn't reach WhatsApp just now. Try again in a minute." };
  }
  revalidatePath("/settings");
  return { savedAt: Date.now() };
}
