import type { Permission, StaffRole } from "./permissions";

// The staff pages (design v3 "Staff pages"): one tab each, shown only to roles that may open it.

export const STAFF_PAGES = [
  { href: "/admin/costs", label: "Costs", permission: "admin.costs.view" },
  { href: "/admin/lab", label: "Lab", permission: "admin.lab.use" },
  { href: "/admin/mcp-tools", label: "MCP tools", permission: "mcp.docs.view" },
  { href: "/admin/mcp-activity", label: "MCP activity", permission: "mcp.audit.view" },
  { href: "/admin/staff", label: "Staff", permission: "staff.manage" },
  { href: "/admin/switches", label: "Switches", permission: "flags.manage" },
  { href: "/admin/brands", label: "Brands", permission: "brands.manage" },
] as const satisfies readonly { href: string; label: string; permission: Permission }[];

export type StaffPage = (typeof STAFF_PAGES)[number];

export const staffPagesFor = (permissions: ReadonlySet<Permission>): StaffPage[] =>
  STAFF_PAGES.filter((p) => permissions.has(p.permission));

/** Where the top bar's "Staff" link goes: the first page the role may open, or none. */
export const firstStaffPage = (permissions: ReadonlySet<Permission>): string | null =>
  staffPagesFor(permissions)[0]?.href ?? null;

/** The permission matrix in plain words (Staff page). */
export const PERMISSION_LABELS: Record<Permission, string> = {
  "admin.costs.view": "See costs",
  "admin.caps.manage": "Change AI spending caps",
  "admin.lab.use": "Use the lab",
  "mcp.docs.view": "Read MCP tool docs",
  "mcp.playground.run": "Run the Try it playground",
  "mcp.audit.view": "See MCP activity",
  "flags.manage": "Turn features on or off",
  "staff.manage": "Add or remove staff",
  "brands.manage": "Offboard or restore brands",
};

export const ROLE_LABELS: Record<StaffRole, string> = {
  admin: "Admin",
  developer: "Developer",
  support: "Support",
  viewer: "Viewer",
};
