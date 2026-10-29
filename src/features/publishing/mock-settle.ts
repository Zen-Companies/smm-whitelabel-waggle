import { writeAudit } from "@/lib/audit";
import type { Json } from "@/lib/supabase/database.types";
import type { ServiceClient } from "@/lib/supabase/service";

// SOCIAL_PROVIDER_MODE=mock only: no post.* webhooks arrive, so the job route marks mock posts
// published once they're due, the way Zernio's post.published webhook would.
export async function settleMockPosts(db: ServiceClient, now = new Date()): Promise<number> {
  const { data, error } = await db
    .from("posts")
    .select("id, tenant_id, target_account_ids, scheduled_for, zernio_post_id")
    .in("status", ["scheduled", "publishing"])
    .like("zernio_post_id", "mock_post_%")
    .or(`scheduled_for.is.null,scheduled_for.lte.${now.toISOString()}`)
    .limit(50);
  if (error) throw new Error(`mock posts lookup failed: ${error.message}`);
  for (const post of data ?? []) {
    const { data: accounts } = await db
      .from("social_accounts")
      .select("platform")
      .in("id", post.target_account_ids);
    const results = (accounts ?? []).map((a) => ({
      platform: a.platform,
      status: "published",
      url: null,
      error: null,
    }));
    await db
      .from("posts")
      .update({
        status: "published",
        published_at: now.toISOString(),
        platform_results: results as unknown as Json,
      })
      .eq("id", post.id);
    await writeAudit(db, {
      tenantId: post.tenant_id,
      action: "post_status_changed",
      actor: "system",
      details: {
        postId: post.id,
        zernioPostId: post.zernio_post_id,
        status: "published",
        mock: true,
      },
    });
  }
  return data?.length ?? 0;
}
