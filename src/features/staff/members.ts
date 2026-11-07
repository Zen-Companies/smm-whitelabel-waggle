import type { ServiceClient } from "@/lib/supabase/service";
import { emailsOf, userIdByEmail } from "@/lib/supabase/users";
import {
  isStaffRole,
  PERMISSIONS,
  STAFF_ROLES,
  type Permission,
  type StaffRole,
} from "./permissions";

// Staff and roles (design v3 "Staff"): who has a role, adding by email, changing and removing.
// Nobody changes or removes their own role here, so the last admin can't lock everyone out.

export interface StaffMember {
  userId: string;
  email: string;
  role: StaffRole;
  addedAt: string;
}

export async function listStaff(db: ServiceClient): Promise<StaffMember[]> {
  const { data, error } = await db
    .from("staff_members")
    .select("user_id, role, created_at")
    .order("created_at");
  if (error) throw new Error(`staff: reading staff failed: ${error.message}`);
  const emails = await emailsOf(
    db,
    (data ?? []).map((m) => m.user_id),
  );
  return (data ?? []).flatMap((m) =>
    isStaffRole(m.role)
      ? [
          {
            userId: m.user_id,
            email: emails.get(m.user_id) ?? "Removed login",
            role: m.role,
            addedAt: m.created_at,
          },
        ]
      : [],
  );
}

/** The matrix as the database has it: role → permissions. */
export async function loadRoleMatrix(
  db: ServiceClient,
): Promise<Record<StaffRole, Set<Permission>>> {
  const { data } = await db.from("staff_role_permissions").select("role, permission");
  const known = new Set<string>(PERMISSIONS);
  const matrix = Object.fromEntries(STAFF_ROLES.map((r) => [r, new Set<Permission>()])) as Record<
    StaffRole,
    Set<Permission>
  >;
  for (const row of data ?? []) {
    if (isStaffRole(row.role) && known.has(row.permission)) {
      matrix[row.role].add(row.permission as Permission);
    }
  }
  return matrix;
}

export type StaffChange = { ok: true } | { error: string };

export async function addStaffMember(
  db: ServiceClient,
  actorId: string,
  email: string,
  role: StaffRole,
): Promise<StaffChange> {
  const userId = await userIdByEmail(db, email);
  if (!userId) return { error: "No Waggle login uses that email. They need to sign up first." };
  if (userId === actorId) return { error: "That's you." };
  const { data: existing } = await db
    .from("staff_members")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();
  if (existing) return { error: "They're already staff. Change their role in the list." };
  const { error } = await db
    .from("staff_members")
    .insert({ user_id: userId, role, added_by: actorId });
  if (error) return { error: "Couldn't add them. Please try again." };
  return { ok: true };
}

export async function changeStaffRole(
  db: ServiceClient,
  actorId: string,
  userId: string,
  role: StaffRole,
): Promise<StaffChange> {
  if (userId === actorId) return { error: "You can't change your own role." };
  const { data, error } = await db
    .from("staff_members")
    .update({ role, added_by: actorId })
    .eq("user_id", userId)
    .select("user_id");
  if (error || !data?.length) return { error: "Couldn't change the role. Please try again." };
  return { ok: true };
}

export async function removeStaffMember(
  db: ServiceClient,
  actorId: string,
  userId: string,
): Promise<StaffChange> {
  if (userId === actorId) return { error: "You can't remove yourself." };
  const { error } = await db.from("staff_members").delete().eq("user_id", userId);
  if (error) return { error: "Couldn't remove them. Please try again." };
  return { ok: true };
}
