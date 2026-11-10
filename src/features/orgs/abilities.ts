/**
 * Who can do what inside an organization (docs/orgs/PLAN.md, role matrix). The database
 * functions check team and organization actions again; this is what the app checks before a
 * Server Action runs and what the UI uses to hide what a role can't do.
 */
export const ORG_ROLES = ["owner", "admin", "member", "viewer"] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

export const ABILITIES = [
  "inbox.read",
  "replies.approve",
  "posts.write",
  "brand.settings",
  "accounts.manage",
  "brands.add",
  "team.manage",
  "org.settings",
  "billing.view",
  "org.close",
  "brand.close",
  "ai.connect",
] as const;
export type Ability = (typeof ABILITIES)[number];

const MATRIX: Record<OrgRole, readonly Ability[]> = {
  owner: ABILITIES,
  admin: [
    "inbox.read",
    "replies.approve",
    "posts.write",
    "brand.settings",
    "accounts.manage",
    "brands.add",
    "team.manage",
    "org.settings",
    "ai.connect",
  ],
  member: ["inbox.read", "replies.approve", "posts.write", "ai.connect"],
  viewer: ["inbox.read", "ai.connect"],
};

export function isOrgRole(value: unknown): value is OrgRole {
  return typeof value === "string" && (ORG_ROLES as readonly string[]).includes(value);
}

export function can(role: OrgRole | null | undefined, ability: Ability): boolean {
  return role ? MATRIX[role].includes(ability) : false;
}

/** Roles `actor` may hand out (invite or change to). Admins never make owners. */
export function assignableRoles(actor: OrgRole): OrgRole[] {
  if (actor === "owner") return ["owner", "admin", "member", "viewer"];
  if (actor === "admin") return ["admin", "member", "viewer"];
  return [];
}

/** Whether `actor` may change or remove a member with `target`'s role (never themselves). */
export function canManageMember(actor: OrgRole, target: OrgRole, isSelf: boolean): boolean {
  if (isSelf || !can(actor, "team.manage")) return false;
  return actor === "owner" || target !== "owner";
}

export const ROLE_LABEL: Record<OrgRole, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
  viewer: "Viewer",
};

export const ROLE_HINT: Record<Exclude<OrgRole, "owner">, string> = {
  admin: "Everything except billing and closing the organization.",
  member: "Approves replies and posts. Can't change settings or connections.",
  viewer: "Sees the inbox, leads and analytics. Can't reply.",
};
