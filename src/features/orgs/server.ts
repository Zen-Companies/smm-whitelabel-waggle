import "server-only";
import { parseUtmCookie, queueCrmEvent, queueQuietly, UTM_COOKIE, type Utm } from "@/lib/crm";
import { cookies } from "next/headers";
import { cache } from "react";
import { pictureUrl } from "@/lib/pictures";
import { createServerSupabase, getCurrentUser } from "@/lib/supabase/server";
import type { ServiceClient } from "@/lib/supabase/service";
import { isOrgRole } from "./abilities";
import { ORG_COOKIE, type OrgSummary } from "./org-pick";

const ORG_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * The signed-in user's open organizations with their role in each, read through RLS. Shared
 * organizations first (oldest first), the personal one last, as in the switcher design.
 */
export const listMyOrgs = cache(async (): Promise<OrgSummary[]> => {
  const user = await getCurrentUser();
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("organization_members")
    .select("role, all_brands, organizations (id, name, personal_of, created_at, picture_path)")
    .eq("user_id", user.id);
  return (data ?? [])
    .flatMap((m) => {
      const o = m.organizations;
      if (!o || !isOrgRole(m.role)) return [];
      return [
        {
          id: o.id,
          name: o.name,
          personal: o.personal_of === user.id,
          role: m.role,
          allBrands: m.all_brands,
          pictureUrl: pictureUrl(o.picture_path),
          createdAt: o.created_at,
        },
      ];
    })
    .sort((a, b) =>
      a.personal !== b.personal ? (a.personal ? 1 : -1) : a.createdAt.localeCompare(b.createdAt),
    )
    .map((org) => ({
      id: org.id,
      name: org.name,
      personal: org.personal,
      role: org.role,
      allBrands: org.allBrands,
      pictureUrl: org.pictureUrl,
    }));
});

export async function readOrgCookie(): Promise<string | undefined> {
  return (await cookies()).get(ORG_COOKIE)?.value;
}

/** Opens an organization for this browser. Only call it with an id checked against the user. */
export async function setOrgCookie(orgId: string): Promise<void> {
  (await cookies()).set(ORG_COOKIE, orgId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ORG_COOKIE_MAX_AGE,
  });
}

/** Every login has a personal organization (T54); made on sign-up, login or confirmation. */
export async function ensurePersonalOrg(db: ServiceClient, userId: string): Promise<string> {
  const { data, error } = await db.rpc("create_personal_org", { p_user: userId });
  if (error || !data) throw new Error(`create_personal_org failed: ${error?.message}`);
  await queueQuietly(() => queueSignUp(db, userId, data));
  return data;
}

/**
 * CRM: a new login (signed_up), once. Only logins made in the last 2 days, so people who signed
 * up before this existed don't get a welcome on their next sign-in.
 */
async function queueSignUp(db: ServiceClient, userId: string, orgId: string): Promise<void> {
  const { count } = await db
    .from("crm_events")
    .select("id", { count: "exact", head: true })
    .eq("dedupe_key", `signed_up:${userId}`);
  if (count) return;
  const { data } = await db.auth.admin.getUserById(userId);
  const created = data.user?.created_at ? new Date(data.user.created_at) : null;
  if (!created || Date.now() - created.getTime() > 2 * 24 * 60 * 60_000) return;
  // The first campaign they came from (proxy cookie), when this runs in their request.
  let utm: Utm | null = null;
  try {
    utm = parseUtmCookie((await cookies()).get(UTM_COOKIE)?.value);
  } catch {
    utm = null;
  }
  await queueCrmEvent(db, {
    event: "signed_up",
    userId,
    orgId,
    dedupeKey: "signed_up",
    details: utm ? { utm: JSON.stringify(utm) } : {},
  });
}
