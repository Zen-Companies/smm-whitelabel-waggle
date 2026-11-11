import "server-only";
import { getServiceClient } from "@/lib/supabase/service";
import { ensurePersonalOrg, setOrgCookie } from "./server";
import { hashInviteToken } from "./team";

/** An invite link's path: `/invite/<token>`. */
export const INVITE_PATH = /^\/invite\/([A-Za-z0-9_-]{20,100})$/;

/**
 * Accepts an invite as `userId` (the database checks the email matches) and opens the
 * organization. Returns whether they're in it now. Used by the invite page's Join and by the
 * Google callback, which joins straight away when the Google email is the invited one.
 */
export async function acceptInviteAndOpen(token: string, userId: string): Promise<boolean> {
  const db = getServiceClient();
  await ensurePersonalOrg(db, userId);
  const { data } = await db.rpc("accept_invite", {
    p_token_hash: hashInviteToken(token),
    p_user: userId,
  });
  const result = data?.[0];
  if (
    result?.organization_id &&
    (result.status === "joined" || result.status === "already_member")
  ) {
    await setOrgCookie(result.organization_id);
    return true;
  }
  return false;
}
