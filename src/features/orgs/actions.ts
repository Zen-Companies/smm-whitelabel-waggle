"use server";

import * as Sentry from "@sentry/nextjs";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireBeta } from "@/features/beta";
import { getCurrentUser } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";
import { ORG_NAME_MAX } from "./copy";
import { listMyOrgs, setOrgCookie } from "./server";

export type CreateOrgState = { error?: string; name?: string };

const nameSchema = z
  .string()
  .trim()
  .min(1, "Enter the organization's name.")
  .max(ORG_NAME_MAX, `Keep the name under ${ORG_NAME_MAX} characters.`);

/** "Create an organization" (design OrgSignup / OrgSwitcher): the user becomes its Owner. */
export async function createOrganization(
  _prev: CreateOrgState,
  formData: FormData,
): Promise<CreateOrgState> {
  const raw = String(formData.get("name") ?? "");
  const parsed = nameSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0].message, name: raw };
  const user = await getCurrentUser();
  await requireBeta();
  const { data, error } = await getServiceClient().rpc("create_organization", {
    p_user: user.id,
    p_name: parsed.data,
  });
  if (error || !data) {
    Sentry.captureException(error ?? new Error("create_organization returned nothing"));
    return { error: "Couldn't create the organization. Try again in a moment.", name: raw };
  }
  await setOrgCookie(data);
  redirect("/welcome");
}

/**
 * Switcher: open another organization. Its first brand opens (same section); an organization
 * with none of the user's brands opens on "Add your first brand".
 */
export async function switchOrg(formData: FormData): Promise<void> {
  const orgId = z.uuid().safeParse(formData.get("orgId"));
  const back = String(formData.get("returnTo") ?? "/inbox");
  if (!orgId.success) redirect("/welcome");
  const orgs = await listMyOrgs();
  if (!orgs.some((o) => o.id === orgId.data)) redirect("/welcome");
  await setOrgCookie(orgId.data);
  // The same section, never an item page: that item belongs to the other organization.
  const section = /^\/([a-z0-9-]+)/.exec(back)?.[1];
  redirect(section && section !== "welcome" && section !== "orgs" ? `/${section}` : "/inbox");
}
