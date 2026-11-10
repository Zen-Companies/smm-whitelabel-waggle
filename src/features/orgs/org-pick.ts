// Which organization is open (T54). Pure, so it is unit tested.
import type { OrgRole } from "./abilities";

/** The cookie holding the open organization, for when it has no brand of the user's yet. */
export const ORG_COOKIE = "waggle_org";

export interface OrgSummary {
  id: string;
  name: string;
  personal: boolean;
  role: OrgRole;
  /** false: the user sees only some of its brands ("only these brands"). */
  allBrands: boolean;
  /** T57: the organization's picture, else null for initials. */
  pictureUrl: string | null;
}

/**
 * The organization the user is working in: the cookie's, else the open brand's, else their
 * personal one, else the first. Null only for a login in no organization at all.
 */
export function chooseOpenOrg(
  orgs: readonly OrgSummary[],
  cookie: string | undefined,
  brandOrgId?: string | null,
): OrgSummary | null {
  return (
    orgs.find((o) => o.id === cookie) ??
    orgs.find((o) => o.id === brandOrgId) ??
    orgs.find((o) => o.personal) ??
    orgs[0] ??
    null
  );
}
