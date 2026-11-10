"use server";

import * as Sentry from "@sentry/nextjs";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getSocialProvider } from "@/lib/social";
import { getCurrentUser } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";
import { BRAND_NAME_MAX, sectionPath } from "./brand-pick";
import { can, listMyOrgs } from "@/features/orgs";
import { getOpenOrg, openBrand } from "./brands";
import { ensureZernioProfile } from "./setup";

/** Brand menu (T47): open another brand on the same section of the app. */
export async function switchBrand(formData: FormData): Promise<void> {
  const tenantId = z.uuid().safeParse(formData.get("tenantId"));
  const back = sectionPath(String(formData.get("returnTo") ?? ""));
  if (tenantId.success) await openBrand(tenantId.data);
  redirect(back);
}

export type AddBrandState = { error?: string; name?: string };

const nameSchema = z
  .string()
  .trim()
  .min(1, "Enter the brand's name.")
  .max(BRAND_NAME_MAX, `Keep the name under ${BRAND_NAME_MAX} characters.`);

/**
 * Add a brand (T47, T54): a new tenant in the open organization (owners and admins), with its
 * own Zernio profile, then open it. The same name as a brand there is refused in place.
 */
export async function addBrand(_prev: AddBrandState, formData: FormData): Promise<AddBrandState> {
  const raw = String(formData.get("name") ?? "");
  const parsed = nameSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0].message, name: raw };
  const name = parsed.data;

  // The organization named by the form (switcher, /welcome), if it is one of the user's; else
  // the open one.
  const formOrg = z.uuid().safeParse(formData.get("orgId"));
  const [user, org] = await Promise.all([
    getCurrentUser(),
    formOrg.success
      ? listMyOrgs().then((orgs) => orgs.find((o) => o.id === formOrg.data) ?? null)
      : getOpenOrg(),
  ]);
  if (!org || !can(org.role, "brands.add")) {
    return {
      error: `Only Owners and Admins of ${org?.name ?? "this organization"} can add brands.`,
      name: raw,
    };
  }
  const db = getServiceClient();
  const { data, error } = await db.rpc("create_brand_in_org", {
    p_org: org.id,
    p_actor: user.id,
    p_name: name,
  });
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
      error: `${org.name} already has a brand called ${existing?.name ?? name}. Pick it from the brand menu, or use a different name.`,
      name: raw,
    };
  }

  // A Zernio failure doesn't block the brand: connecting an account links the profile later.
  try {
    await ensureZernioProfile({ db, social: getSocialProvider }, tenantId);
  } catch (e) {
    Sentry.captureException(e, { extra: { tenantId } });
  }
  await openBrand(tenantId);
  redirect("/inbox");
}
