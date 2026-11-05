"use server";

import * as Sentry from "@sentry/nextjs";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getSocialProvider } from "@/lib/social";
import { getCurrentUser } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";
import { BRAND_NAME_MAX, sectionPath } from "./brand-pick";
import { isUsersBrand, setBrandCookie } from "./brands";
import { ensureZernioProfile } from "./setup";

/** Brand menu (T47): open another brand on the same section of the app. */
export async function switchBrand(formData: FormData): Promise<void> {
  const tenantId = z.uuid().safeParse(formData.get("tenantId"));
  const back = sectionPath(String(formData.get("returnTo") ?? ""));
  if (!tenantId.success || !(await isUsersBrand(tenantId.data))) redirect(back);
  await setBrandCookie(tenantId.data);
  redirect(back);
}

export type AddBrandState = { error?: string; name?: string };

const nameSchema = z
  .string()
  .trim()
  .min(1, "Enter the brand's name.")
  .max(BRAND_NAME_MAX, `Keep the name under ${BRAND_NAME_MAX} characters.`);

/**
 * Add a brand (T47): a new tenant owned by the user, with its own Zernio profile, then open it.
 * The same name as one of the user's brands is refused in place (design v3 "Brands").
 */
export async function addBrand(_prev: AddBrandState, formData: FormData): Promise<AddBrandState> {
  const raw = String(formData.get("name") ?? "");
  const parsed = nameSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0].message, name: raw };
  const name = parsed.data;

  const user = await getCurrentUser();
  const db = getServiceClient();
  const { data, error } = await db.rpc("create_brand", { p_user_id: user.id, p_name: name });
  if (error || !data?.[0]) {
    Sentry.captureException(error ?? new Error("create_brand returned nothing"));
    return { error: "Couldn't add the brand. Try again in a moment.", name: raw };
  }
  const { tenant_id: tenantId, created } = data[0];
  if (!created) {
    const { data: existing } = await db
      .from("tenants")
      .select("name")
      .eq("id", tenantId)
      .maybeSingle();
    return {
      error: `You already have a brand called ${existing?.name ?? name}. Pick it from the brand menu, or use a different name.`,
      name: raw,
    };
  }

  // A Zernio failure doesn't block the brand: connecting an account links the profile later.
  try {
    await ensureZernioProfile({ db, social: getSocialProvider }, tenantId);
  } catch (e) {
    Sentry.captureException(e, { extra: { tenantId } });
  }
  await setBrandCookie(tenantId);
  redirect("/inbox");
}
