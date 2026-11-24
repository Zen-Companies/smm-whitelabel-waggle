import * as Sentry from "@sentry/nextjs";
import { writeAudit } from "@/lib/audit";
import type { LlmClient } from "@/lib/llm/client";
import { BUSINESS_PROFILE_MAX } from "@/lib/classifier/business-context";
import { loadTenantAiSpend } from "@/lib/llm/spend";
import type { Json } from "@/lib/supabase/database.types";
import { hasLiveComments } from "@/lib/social/platforms";
import {
  EMPTY_ACCOUNT_CATEGORY,
  type AccountCategory,
  type SocialProvider,
} from "@/lib/social/types";
import type { ServiceClient } from "@/lib/supabase/service";
import { cleanBusinessName } from "./brand-name";
import { nameFromAiProfile } from "./brand-name-server";
import {
  aiProfileSchema,
  PROFILE_CAPS,
  PROFILE_PROMPT_VERSION,
  profileSystemPrompt,
  profileUserPrompt,
} from "./profile";
import { kindFromPlatformCategory, kindFromProfile, kindOf, profileText } from "./starter";

// Setup item G (approved 23 Nov): the profile is made right after the first connect
// (buildProfileAfterConnect), from what the account says it is (SocialProvider.getAccountCategory:
// page category, bio or description) and a few recent post captions, without waiting for the read.
// A category we can map sets the kind (saved as step 3's kind answer is, so step 3 doesn't ask it).
// The post-read run (buildBusinessProfiles) stays as the fallback: both claim
// tenants.ai_profile_at, so it only makes one when the connect-time one didn't happen.
//
// The business profile (board "Step 3 is a conversation with Waggle", approved 23 Nov): once a
// brand's 30-day read is sorted (catch_ups.sorted_at), one AI call per brand, ever (claimed by
// tenants.ai_profile_at), through src/lib/llm (ai_usage). A brand at the AI cap isn't claimed, so
// a later run tries it again. Brands whose setup is already done (incl. a skip) aren't made. Its output is zod-checked and stored in tenants.ai_profile; on any
// failure setup uses the kind's basic profile. Ids only in logs and audit rows. Runs from
// /api/jobs/process.

/** Only reads this recent: an old one isn't a first setup any more. */
const RECENT_MS = 2 * 24 * 60 * 60 * 1000;

interface Deps {
  db: ServiceClient;
  llm: LlmClient | null;
  social: () => SocialProvider;
  now?: Date;
  shouldContinue?: () => boolean;
}

export async function buildBusinessProfiles(
  deps: Deps,
  opts: { limit?: number } = {},
): Promise<{ made: number }> {
  const { db } = deps;
  const now = deps.now ?? new Date();
  const llm = deps.llm;
  if (!llm) return { made: 0 };
  const { data: rows, error } = await db
    .from("catch_ups")
    .select(
      "id, tenant_id, zernio_account_id, platform, handle, tenants!inner (ai_profile_at, setup_done_at)",
    )
    .not("sorted_at", "is", null)
    .is("tenants.ai_profile_at", null)
    // Only setup reads the profile: once setup is done (finished, or step 2's "Skip for now"),
    // the call would be spent for nothing.
    .is("tenants.setup_done_at", null)
    .gte("created_at", new Date(now.getTime() - RECENT_MS).toISOString())
    .order("created_at", { ascending: true })
    // More than the limit: brands at the AI cap are passed over, not claimed.
    .limit((opts.limit ?? 3) * 4);
  if (error) throw new Error(`catch_ups lookup failed: ${error.message}`);

  let made = 0;
  let tried = 0;
  for (const row of rows ?? []) {
    if (tried >= (opts.limit ?? 3)) break;
    if (deps.shouldContinue && !deps.shouldContinue()) break;
    // At the AI cap: not claimed, so a later run makes it once the cap allows (within RECENT_MS).
    const spend = await loadTenantAiSpend(db, row.tenant_id, now);
    if (spend.level === "reached") continue;
    // Claim it: one call per brand.
    const { data: claimed } = await db
      .from("tenants")
      .update({ ai_profile_at: now.toISOString() })
      .eq("id", row.tenant_id)
      .is("ai_profile_at", null)
      .select("id");
    if (!claimed?.length) continue;
    tried += 1;
    try {
      if (await buildOne(deps, llm, row)) made += 1;
    } catch (err) {
      // Once only (cost): setup falls back to the kind's basic profile.
      Sentry.captureException(err, { extra: { catchUpId: row.id, tenantId: row.tenant_id } });
    }
  }
  return { made };
}

async function buildOne(
  deps: Deps,
  llm: LlmClient,
  row: {
    id: string;
    tenant_id: string;
    zernio_account_id: string | null;
    platform: string | null;
    handle: string | null;
  },
): Promise<boolean> {
  const { db } = deps;
  const tenantId = row.tenant_id;

  let bio: string | null = null;
  if (row.zernio_account_id && row.platform) {
    try {
      const profile = await deps.social().getBusinessProfile({
        accountId: row.zernio_account_id,
        platform: row.platform,
        username: row.handle?.replace(/^@/, "") ?? null,
      });
      bio = profile?.about ?? null;
    } catch (err) {
      // The captions and messages are still worth reading.
      Sentry.captureException(err, { extra: { catchUpId: row.id, step: "profile" } });
    }
  }

  const [{ data: tenant }, { data: captions }, { data: messages }] = await Promise.all([
    db.from("tenants").select("business_profile").eq("id", tenantId).single(),
    db
      .from("inbound_items")
      .select("post_caption")
      .eq("catch_up_id", row.id)
      .not("post_caption", "is", null)
      .order("received_at", { ascending: false })
      .limit(60),
    db
      .from("inbound_items")
      .select("text")
      .eq("catch_up_id", row.id)
      .in("category", ["faq", "lead", "complaint", "unclear"])
      .order("received_at", { ascending: false })
      .limit(PROFILE_CAPS.messages),
  ]);
  const kind = kindFromProfile(tenant?.business_profile ?? "");
  const result = await llm.generateObject({
    tenantId,
    purpose: "setup",
    schema: aiProfileSchema,
    system: profileSystemPrompt(),
    prompt: profileUserPrompt({
      kindLabel: kind?.label ?? null,
      pageName: row.handle?.replace(/^@/, "") ?? null,
      bio,
      captions: [...new Set((captions ?? []).map((c) => c.post_caption ?? ""))],
      messages: (messages ?? []).map((m) => m.text),
    }),
  });
  const businessName = cleanBusinessName(result.object.businessName);
  const { error } = await db
    .from("tenants")
    .update({ ai_profile: { ...result.object, businessName } as unknown as Json })
    .eq("id", tenantId);
  if (error) throw new Error(`saving the business profile failed: ${error.message}`);
  await nameAfterProfile(db, { tenantId, ai: businessName, platform: row.platform });
  await writeAudit(db, {
    tenantId,
    action: "business_profile_made",
    actor: "system",
    details: {
      catchUpId: row.id,
      model: result.model,
      promptVersion: PROFILE_PROMPT_VERSION,
      groups: result.object.wanted.length,
    },
  });
  return true;
}

// ---- right after connect (setup item G) ---------------------------------------------------------

/** Posts whose captions the connect-time profile reads. */
const CONNECT_POSTS = 10;
const CAPTION_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Right after a first connect: one AI call per brand, ever (the same claim as the post-read run),
 * from the account's category, bio or description and recent captions. Brands at the AI cap are
 * passed over (a later run tries again); setups already done are skipped. Runs from
 * /api/jobs/catch-up (kicked on connect) for that brand, and from /api/jobs/process for everyone.
 */
export async function buildProfileAfterConnect(
  deps: Deps,
  opts: { tenantId?: string; limit?: number } = {},
): Promise<{ made: number; kinds: number }> {
  const { db } = deps;
  const now = deps.now ?? new Date();
  const llm = deps.llm;
  if (!llm) return { made: 0, kinds: 0 };
  const limit = opts.limit ?? 3;
  let query = db
    .from("social_accounts")
    .select(
      "id, tenant_id, zernio_account_id, platform, username, tenants!inner (ai_profile_at, setup_done_at)",
    )
    .eq("status", "active")
    .is("tenants.ai_profile_at", null)
    // Only setup reads the profile (as in the post-read run).
    .is("tenants.setup_done_at", null)
    .gte("created_at", new Date(now.getTime() - RECENT_MS).toISOString())
    .order("created_at", { ascending: true })
    .limit(limit * 4);
  if (opts.tenantId) query = query.eq("tenant_id", opts.tenantId);
  const { data: rows, error } = await query;
  if (error) throw new Error(`social_accounts lookup failed: ${error.message}`);

  const result = { made: 0, kinds: 0 };
  const seen = new Set<string>();
  for (const row of rows ?? []) {
    // The brand's first account only.
    if (seen.has(row.tenant_id)) continue;
    seen.add(row.tenant_id);
    if (seen.size > limit) break;
    if (deps.shouldContinue && !deps.shouldContinue()) break;
    // At the AI cap: not claimed, so a later run makes it once the cap allows.
    const spend = await loadTenantAiSpend(db, row.tenant_id, now);
    if (spend.level === "reached") continue;
    const { data: claimed } = await db
      .from("tenants")
      .update({ ai_profile_at: now.toISOString() })
      .eq("id", row.tenant_id)
      .is("ai_profile_at", null)
      .select("id");
    if (!claimed?.length) continue;
    try {
      const out = await buildAtConnect(deps, llm, row, now);
      if (out.kind) result.kinds += 1;
      if (out.made) result.made += 1;
    } catch (err) {
      // Once only (cost): setup falls back to the kind's basic profile.
      Sentry.captureException(err, { extra: { accountId: row.id, tenantId: row.tenant_id } });
    }
  }
  return result;
}

async function buildAtConnect(
  deps: Deps,
  llm: LlmClient,
  row: {
    id: string;
    tenant_id: string;
    zernio_account_id: string;
    platform: string;
    username: string | null;
  },
  now: Date,
): Promise<{ kind: boolean; made: boolean }> {
  const { db } = deps;
  const tenantId = row.tenant_id;

  let info: AccountCategory = EMPTY_ACCOUNT_CATEGORY;
  try {
    info = await deps.social().getAccountCategory({
      accountId: row.zernio_account_id,
      platform: row.platform,
      username: row.username?.replace(/^@/, "") ?? null,
    });
  } catch (err) {
    // The provider gives the empty info on failure; a broken one still mustn't stop setup.
    Sentry.captureException(err, { extra: { accountId: row.id, step: "category" } });
  }
  let captions: string[] = [];
  if (hasLiveComments(row.platform)) {
    try {
      const page = await deps.social().listCommentedPostsPage({
        accountId: row.zernio_account_id,
        since: new Date(now.getTime() - CAPTION_WINDOW_MS),
        limit: CONNECT_POSTS,
      });
      captions = (page.posts ?? []).flatMap((p) => (p.caption ? [p.caption] : []));
    } catch (err) {
      // The category and bio are still worth reading.
      Sentry.captureException(err, { extra: { accountId: row.id, step: "captions" } });
    }
  }

  // The kind from the page's category, saved as step 3's kind answer is (the business description
  // starts with it), unless the owner already picked one.
  const { data: tenant } = await db
    .from("tenants")
    .select("business_profile")
    .eq("id", tenantId)
    .single();
  const before = tenant?.business_profile ?? "";
  let kind = kindFromProfile(before)?.key ?? null;
  const mapped = kind ? null : kindFromPlatformCategory(info.category);
  let kindSaved = false;
  if (mapped) {
    const { data: saved } = await db
      .from("tenants")
      .update({ business_profile: profileText(mapped, before, BUSINESS_PROFILE_MAX) })
      .eq("id", tenantId)
      // Not if the owner picked one meanwhile.
      .eq("business_profile", before)
      .select("id");
    if (saved?.length) {
      kind = mapped;
      kindSaved = true;
      await writeAudit(db, {
        tenantId,
        action: "business_kind_found",
        actor: "system",
        details: { accountId: row.id, platform: row.platform, kind: mapped },
      });
    }
  }

  const bio = [info.bio, info.description].filter(Boolean).join("\n\n") || null;
  const result = await llm.generateObject({
    tenantId,
    purpose: "setup",
    schema: aiProfileSchema,
    system: profileSystemPrompt(),
    prompt: profileUserPrompt({
      kindLabel: kindOf(kind)?.label ?? null,
      pageName: info.name ?? row.username?.replace(/^@/, "") ?? null,
      category: info.category,
      bio,
      captions: [...new Set(captions)],
      messages: [],
    }),
  });
  // A kind the owner or the category gave stays: the profile's own guess only fills a gap.
  // The suggested name is kept only when it's a usable one (it names a brand still unnamed or
  // only guessed: nameAfterProfile).
  const profile = {
    ...result.object,
    kind: kind ?? result.object.kind,
    businessName: cleanBusinessName(result.object.businessName),
  };
  const { error } = await db
    .from("tenants")
    .update({ ai_profile: profile as unknown as Json })
    .eq("id", tenantId);
  if (error) throw new Error(`saving the business profile failed: ${error.message}`);
  await nameAfterProfile(db, { tenantId, ai: profile.businessName, platform: row.platform });
  await writeAudit(db, {
    tenantId,
    action: "business_profile_made",
    actor: "system",
    details: {
      accountId: row.id,
      at: "connect",
      model: result.model,
      promptVersion: PROFILE_PROMPT_VERSION,
      groups: result.object.wanted.length,
      category: info.category !== null,
    },
  });
  return { kind: kindSaved, made: true };
}

/**
 * The suggestion names the brand when its name is still pending or an unchecked guess (24 Nov:
 * step 3's facts card confirms it). Never fails the profile: the name stays as it was.
 */
async function nameAfterProfile(
  db: ServiceClient,
  input: { tenantId: string; ai: string | null; platform: string | null },
): Promise<void> {
  if (!input.ai) return;
  try {
    await nameFromAiProfile(db, {
      tenantId: input.tenantId,
      ai: input.ai,
      platform: input.platform ?? "instagram",
    });
  } catch (err) {
    Sentry.captureException(err, { extra: { tenantId: input.tenantId, step: "name" } });
  }
}
