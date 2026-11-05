import "server-only";
import { cookies } from "next/headers";
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
    .select("id, name, social_accounts(platform, username, status)")
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

/** True when the signed-in user belongs to the tenant (RLS hides any other). */
export async function isUsersBrand(tenantId: string): Promise<boolean> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("tenants").select("id").eq("id", tenantId).maybeSingle();
  return data !== null;
}

const ITEM_PATH = /^\/inbox\/items\/[0-9a-f-]{36}$/;

/**
 * `/brands/switch?to=<tenant>&next=<path>`: opens the brand if it is the user's, then returns
 * where to go. Only an inbox item path or a section path is followed.
 */
export async function openBrandFromLink(to: string | null, next: string | null): Promise<string> {
  const target = next && ITEM_PATH.test(next) ? next : sectionPath(next);
  if (to && /^[0-9a-f-]{36}$/.test(to) && (await isUsersBrand(to))) await setBrandCookie(to);
  return target;
}
