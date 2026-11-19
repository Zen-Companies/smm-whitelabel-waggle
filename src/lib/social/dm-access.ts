import { z } from "zod";

// First connect (20 Nov): what `GET /v1/inbox/conversations?accountId=` says about one account
// whose messages couldn't be read. The call answers 200 and reports the account in
// `meta.failedAccounts` ({ accountId, error, code, retryAfter }) or, when the account "is not
// enabled" for messages, in `meta.accountsSkipped` ({ accountId, platform })
// (docs.zernio.com/messages/list-inbox-conversations, read 20 Nov). Instagram's "connected tools"
// message access turned off is documented only as "not replayed at all" (an empty list), so an
// empty list can't be told apart from an account with no DMs.

export const conversationsMetaSchema = z
  .object({
    failedAccounts: z
      .array(
        z.object({
          accountId: z.string().nullish(),
          code: z.string().nullish(),
          retryAfter: z.number().nullish(),
        }),
      )
      .nullish()
      .catch(null),
    accountsSkipped: z
      .array(z.object({ accountId: z.string().nullish() }))
      .nullish()
      .catch(null),
  })
  .nullish()
  .catch(null);
export type ConversationsMeta = z.infer<typeof conversationsMetaSchema>;

/**
 * Why the account's conversations weren't listed: "rate_limited" (try again later), "no_access"
 * (failed or skipped for any other reason: message access off, a missing permission, an expired
 * token), or null when it was listed.
 */
export function conversationsAccessIssue(
  meta: ConversationsMeta,
  accountId: string,
):
  | { issue: "rate_limited"; retryAfterSeconds: number }
  | { issue: "no_access"; code: string | null }
  | null {
  const failed = (meta?.failedAccounts ?? []).find((f) => f.accountId === accountId);
  if (failed) {
    if (failed.retryAfter != null && failed.retryAfter > 0) {
      return { issue: "rate_limited", retryAfterSeconds: failed.retryAfter };
    }
    return { issue: "no_access", code: failed.code ?? null };
  }
  if ((meta?.accountsSkipped ?? []).some((a) => a.accountId === accountId)) {
    return { issue: "no_access", code: "skipped" };
  }
  return null;
}
