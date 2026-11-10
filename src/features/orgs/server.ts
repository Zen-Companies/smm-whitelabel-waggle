import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
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
    .select("role, all_brands, organizations (id, name, personal_of, created_at)")
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
  return data;
}
