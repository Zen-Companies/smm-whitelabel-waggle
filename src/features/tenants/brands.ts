import "server-only";
import { cookies } from "next/headers";
import {
  chooseOpenOrg,
  listMyOrgs,
  ORG_COOKIE,
  setOrgCookie,
  type OrgSummary,
} from "@/features/orgs";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  BRAND_COOKIE,
  BRAND_COOKIE_MAX_AGE,
  brandInitials,
  brandTint,
  sectionPath,
  type BRAND_TINTS,
} from "./brand-pick";

export interface BrandSummary {
  id: string;
  name: string;
  organizationId: string | null;
  initials: string;
  tint: (typeof BRAND_TINTS)[number];
  accounts: { platform: string; username: string | null }[];
  /** Items waiting for the owner in this brand (the inbox's For you). */
  needsYou: number;
}

/**
 * The signed-in user's brands for the brand menu (T47), oldest first, read through RLS. The
 * caller passes which statuses count as "needs you" (the approvals feature owns that list).
 */
export async function listBrands(needsYouStatuses: readonly string[]): Promise<BrandSummary[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("tenants")
    .select("id, name, organization_id, social_accounts(platform, username, status)")
    .order("created_at")
    .order("id");
  const tenants = data ?? [];
  const counts = await Promise.all(
    tenants.map(async (t) => {
      const { count } = await supabase
        .from("inbound_items")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", t.id)
        .in("status", [...needsYouStatuses]);
      return count ?? 0;
    }),
  );
  return tenants.map((t, i) => ({
    id: t.id,
    name: t.name,
    organizationId: t.organization_id,
    initials: brandInitials(t.name),
    tint: brandTint(t.id),
    accounts: (t.social_accounts ?? [])
      .filter((a) => a.status !== "disconnected")
      .map((a) => ({ platform: a.platform, username: a.username })),
    needsYou: counts[i],
  }));
}

/** Opens a brand for this browser. Only call it with a tenant id checked against the user. */
export async function setBrandCookie(tenantId: string): Promise<void> {
  const store = await cookies();
  store.set(BRAND_COOKIE, tenantId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: BRAND_COOKIE_MAX_AGE,
  });
}

/**
 * Opens a brand and its organization for this browser, if the signed-in user can see the brand
 * (RLS hides any other). False when they can't; nothing changes then.
 */
export async function openBrand(tenantId: string): Promise<boolean> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("tenants")
    .select("id, organization_id")
    .eq("id", tenantId)
    .maybeSingle();
  if (!data) return false;
  await setBrandCookie(tenantId);
  if (data.organization_id) await setOrgCookie(data.organization_id);
  return true;
}

/**
 * The organization the user is working in (T54), also on pages without an open brand
 * (/welcome): the organization cookie's, else the open brand's, else their personal one.
 */
export async function getOpenOrg(): Promise<OrgSummary | null> {
  const [orgs, store] = await Promise.all([listMyOrgs(), cookies()]);
  const orgCookie = store.get(ORG_COOKIE)?.value;
  let brandOrg: string | null = null;
  const brandCookie = store.get(BRAND_COOKIE)?.value;
  if (!orgs.some((o) => o.id === orgCookie) && brandCookie) {
    const supabase = await createServerSupabase();
    const { data } = await supabase
      .from("tenants")
      .select("organization_id")
      .eq("id", brandCookie)
      .maybeSingle();
    brandOrg = data?.organization_id ?? null;
  }
  return chooseOpenOrg(orgs, orgCookie, brandOrg);
}

const ITEM_PATH = /^\/inbox\/items\/[0-9a-f-]{36}$/;

/**
 * `/brands/switch?to=<tenant>&next=<path>`: opens the brand if it is the user's, then returns
 * where to go. Only an inbox item path or a section path is followed.
 */
export async function openBrandFromLink(to: string | null, next: string | null): Promise<string> {
  const target = next && ITEM_PATH.test(next) ? next : sectionPath(next);
  if (to && /^[0-9a-f-]{36}$/.test(to)) await openBrand(to);
  return target;
}
