"use server";

import * as Sentry from "@sentry/nextjs";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { checkPicture, PICTURE_ERRORS, removePicture, storePicture } from "@/lib/pictures";
import { getCurrentUser } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";
import { can, type Ability } from "./abilities";
import { ORG_NAME_MAX } from "./copy";
import { listMyOrgs, setOrgCookie } from "./server";

const ERRORS: Record<string, string> = {
  not_allowed: "Your role here can't do that.",
  last_owner: "You're the only Owner. Make another member Owner on the Team page first.",
  personal: "Your personal organization can't be closed. Its brands can be closed one by one.",
  name_required: "Enter the organization's name.",
  not_found: "This organization isn't here any more.",
};
const errorOf = (e: { message: string } | null) =>
  (e && ERRORS[e.message]) ?? "Couldn't save. Try again in a moment.";

async function orgFor(formData: FormData, ability: Ability) {
  const orgId = z.uuid().safeParse(formData.get("orgId"));
  if (!orgId.success) return null;
  const [user, orgs] = await Promise.all([getCurrentUser(), listMyOrgs()]);
  const org = orgs.find((o) => o.id === orgId.data);
  return org && can(org.role, ability) ? { org, user } : null;
}

export type OrgFormState = { error?: string; saved?: number; name?: string };

/** General → Name (owners and admins). */
export async function renameOrganization(
  _prev: OrgFormState,
  formData: FormData,
): Promise<OrgFormState> {
  const raw = String(formData.get("name") ?? "");
  const ctx = await orgFor(formData, "org.settings");
  if (!ctx) return { error: ERRORS.not_allowed, name: raw };
  const name = z.string().trim().min(1).max(ORG_NAME_MAX).safeParse(raw);
  if (!name.success) return { error: ERRORS.name_required, name: raw };
  const { error } = await getServiceClient().rpc("rename_organization", {
    p_org: ctx.org.id,
    p_actor: ctx.user.id,
    p_name: name.data,
  });
  if (error) return { error: errorOf(error), name: raw };
  revalidatePath("/", "layout");
  return { saved: Date.now() };
}

/** General → Organization picture: a cropped square from the browser, or "remove". */
export async function saveOrgPicture(
  formData: FormData,
): Promise<{ error?: string; saved?: number }> {
  const ctx = await orgFor(formData, "org.settings");
  if (!ctx) return { error: ERRORS.not_allowed };
  const db = getServiceClient();
  const { data: before } = await db
    .from("organizations")
    .select("picture_path")
    .eq("id", ctx.org.id)
    .single();

  let path: string | null = null;
  if (formData.get("remove") !== "1") {
    const file = formData.get("picture");
    if (!(file instanceof File)) return { error: PICTURE_ERRORS.empty };
    const problem = checkPicture(file);
    if (problem) return { error: PICTURE_ERRORS[problem] };
    try {
      path = await storePicture(db, `orgs/${ctx.org.id}`, {
        type: file.type,
        bytes: await file.arrayBuffer(),
      });
    } catch (e) {
      Sentry.captureException(e);
      return { error: PICTURE_ERRORS.failed };
    }
  }
  const { error } = await db
    .from("organizations")
    .update({ picture_path: path })
    .eq("id", ctx.org.id);
  if (error) return { error: PICTURE_ERRORS.failed };
  await removePicture(db, before?.picture_path);
  await db.from("organization_audit").insert({
    organization_id: ctx.org.id,
    action: path ? "organization_picture_changed" : "organization_picture_removed",
    actor: ctx.user.id,
  });
  revalidatePath("/", "layout");
  return { saved: Date.now() };
}

export type LeaveState = { error?: string };

/** General → Leave (anyone but the last owner). Lands on another brand, or /welcome. */
export async function leaveOrganization(
  _prev: LeaveState,
  formData: FormData,
): Promise<LeaveState> {
  const orgId = z.uuid().safeParse(formData.get("orgId"));
  if (!orgId.success) return { error: ERRORS.not_found };
  const user = await getCurrentUser();
  const { error } = await getServiceClient().rpc("leave_organization", {
    p_org: orgId.data,
    p_user: user.id,
  });
  if (error) return { error: errorOf(error) };
  redirect("/inbox");
}

/** General → Close (owners). Every brand is offboarded: 3 months to restore, then deleted. */
export async function closeOrganization(
  _prev: LeaveState,
  formData: FormData,
): Promise<LeaveState> {
  const ctx = await orgFor(formData, "org.close");
  if (!ctx) return { error: ERRORS.not_allowed };
  if (String(formData.get("confirm") ?? "").trim() !== ctx.org.name) {
    return { error: `Type ${ctx.org.name} to confirm.` };
  }
  const { error } = await getServiceClient().rpc("close_organization", {
    p_org: ctx.org.id,
    p_actor: ctx.user.id,
  });
  if (error) return { error: errorOf(error) };
  // Its brands are closed now: open the personal organization instead of a closed brand. The
  // brand cookie's name is the tenants feature's (waggle_brand); this feature can't import it.
  const personal = (await listMyOrgs()).find((o) => o.personal);
  if (personal) await setOrgCookie(personal.id);
  (await cookies()).delete("waggle_brand");
  redirect("/inbox");
}
