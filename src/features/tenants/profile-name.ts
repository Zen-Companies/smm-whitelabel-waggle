// Zernio profile names are unique across our whole team, so two businesses with the same name
// would collide. A short tenant id suffix keeps them apart (docs/tdd.md §4).
export const PROFILE_NAME_MAX = 100;

export function zernioProfileName(businessName: string, tenantId: string): string {
  const suffix = ` (${tenantId.replace(/-/g, "").slice(0, 8)})`;
  const name = businessName.trim().replace(/\s+/g, " ") || "Business";
  return name.slice(0, PROFILE_NAME_MAX - suffix.length).trimEnd() + suffix;
}
