// Staff roles and permissions (docs/mcp/PLAN.md §7, Q6). The matrix itself lives in the database
// (staff_role_permissions, seeded by migration); these are the names code may ask for.

export const STAFF_ROLES = ["admin", "developer", "support", "viewer"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const PERMISSIONS = [
  "admin.costs.view",
  /** Set a brand's monthly AI cap on the Costs page (admins only). */
  "admin.caps.manage",
  "admin.lab.use",
  "mcp.docs.view",
  "mcp.playground.run",
  "mcp.audit.view",
  "flags.manage",
  "staff.manage",
  /** Offboard and restore brands (T21, admins only). */
  "brands.manage",
  /** Create and turn off beta codes, see who joined (admins only). */
  "beta.manage",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const isStaffRole = (v: unknown): v is StaffRole =>
  typeof v === "string" && (STAFF_ROLES as readonly string[]).includes(v);
