import type { ProviderComment, SocialProvider } from "@/lib/social/types";

// Reading an account's comments page by page, shared by the first-connect catch-up (job.ts) and
// the weekly check-up (features/weekly, 26 Nov). Bounded: a viral post can't eat a whole run.

/** Comments asked for per page. */
export const COMMENTS_PAGE = 50;
/** Comment pages read per post. */
export const MAX_COMMENT_PAGES = 10;

/**
 * One post's top-level comments, at most `limit` of them (`listPostCommentsPage`, page by page).
 * `capped` is true when the post had more than the limit allowed.
 */
export async function readPostComments(
  social: SocialProvider,
  input: { accountId: string; postId: string; limit: number; maxPages?: number },
): Promise<{ comments: ProviderComment[]; capped: boolean }> {
  const all: ProviderComment[] = [];
  let cursor: string | null = null;
  let capped = false;
  const pages = input.maxPages ?? MAX_COMMENT_PAGES;
  for (let p = 0; p < pages; p += 1) {
    const left = input.limit - all.length;
    if (left <= 0) {
      capped = true;
      break;
    }
    const page: { comments: ProviderComment[]; nextCursor: string | null } =
      await social.listPostCommentsPage({
        accountId: input.accountId,
        postId: input.postId,
        cursor,
        limit: Math.min(COMMENTS_PAGE, left),
      });
    all.push(...page.comments);
    cursor = page.nextCursor;
    if (!cursor) break;
  }
  return { comments: all, capped };
}
