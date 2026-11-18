import { notFound } from "next/navigation";
import { hasPermission } from "@/features/staff";
import { getServiceClient } from "@/lib/supabase/service";
import { allowedStatuses, SWITCHABLE } from "./catalog";
import { PlatformsForm, type PlatformFormRow } from "./platforms-form";
import { loadPlatformRows } from "./store";

// Connections stored as social accounts under another id (Gmail is Zernio's "google").
const STORED_AS: Record<string, string> = { gmail: "google", outlook: "microsoft", email: "imap" };

/**
 * Staff → Platforms (design "Every Zernio platform", approved 18 Nov): Hidden, Coming soon or
 * Available per platform, for every business at once. Platforms whose sign-in names Zernio start
 * as Coming soon, so nothing changes for owners until staff turn one on.
 */
export async function PlatformsView() {
  if (!(await hasPermission("admin.caps.manage"))) notFound();
  const db = getServiceClient();
  const [rows, { data: accounts }] = await Promise.all([
    loadPlatformRows(db),
    db.from("social_accounts").select("platform").eq("status", "active").limit(10000),
  ]);
  const counts = new Map<string, number>();
  for (const a of accounts ?? []) counts.set(a.platform, (counts.get(a.platform) ?? 0) + 1);
  const list: PlatformFormRow[] = SWITCHABLE.map((p) => {
    const r = rows.get(p.id)!;
    const stored = STORED_AS[p.id] ?? p.id;
    return {
      id: p.id,
      label: p.label,
      group: p.group,
      status: r.status,
      allowed: allowedStatuses(p),
      blocked: p.blocked ?? (p.built ? null : "Not built in Waggle yet."),
      signin: r.lastSignin,
      usageAtCost: !!p.usageAtCost,
      connected: counts.get(stored) ?? null,
    };
  });
  return <PlatformsForm rows={list} />;
}
