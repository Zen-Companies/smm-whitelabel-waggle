import "server-only";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/server";
import { getServiceClient, type ServiceClient } from "@/lib/supabase/service";
import { isStaffRole, PERMISSIONS, type Permission, type StaffRole } from "./permissions";

// Who at Zen Companies may open the staff pages (replaces the `operator` app_metadata role, T34).
// Server-only tables: owners can't read or grant themselves anything.

export interface StaffAccess {
  role: StaffRole | null;
  permissions: ReadonlySet<Permission>;
}

const NONE: StaffAccess = { role: null, permissions: new Set() };

export async function staffAccess(db: ServiceClient, userId: string): Promise<StaffAccess> {
  const { data: member } = await db
    .from("staff_members")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();
  if (!member || !isStaffRole(member.role)) return NONE;
  const { data: rows } = await db
    .from("staff_role_permissions")
    .select("permission")
    .eq("role", member.role);
  const known = new Set<string>(PERMISSIONS);
  return {
    role: member.role,
    permissions: new Set(
      (rows ?? []).map((r) => r.permission).filter((p): p is Permission => known.has(p)),
    ),
  };
}

/** The signed-in user's staff access (none for owners). */
export async function currentStaffAccess(): Promise<StaffAccess & { userId: string }> {
  const user = await getCurrentUser();
  return { ...(await staffAccess(getServiceClient(), user.id)), userId: user.id };
}

/** 404 unless the signed-in user's role has `permission` (the page isn't advertised). */
export async function requirePermission(permission: Permission) {
  const access = await currentStaffAccess();
  if (!access.permissions.has(permission)) notFound();
  return access;
}

/** For Server Actions: true when the signed-in user may do it (a refusal is up to the caller). */
export async function hasPermission(permission: Permission): Promise<boolean> {
  return (await currentStaffAccess()).permissions.has(permission);
}
