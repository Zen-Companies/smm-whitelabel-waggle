import { z } from "zod";
import { createPost, POST_TEXT_MAX } from "@/features/publishing";
import { platformLabel } from "@/lib/social/platforms";
import type { Json } from "@/lib/supabase/database.types";
import { resolveBrand, ToolError, viaOf, type ToolContext } from "../context";
import { brandId, defineTool, PUBLIC_ACTION, type ToolAnnotations } from "./define";
import { mediaProblems, parsePublishWhen, PREVIEW_TTL_MS } from "./post-preview";

// Posting in two steps (17 Nov, after an assistant published wording the owner never saw):
// preview_post checks everything and stores exactly what would go out; create_post publishes that
// stored post once, after the owner said yes. Photos and videos are public links Zernio fetches
// (checked by Zernio first); photos dropped into a chat need Waggle's upload page (next).

const MAX_MEDIA = 10;
const CHECK_TIMEOUT_MS = 20_000;

/** Saves a preview in Waggle; nothing reaches Instagram or Facebook. */
const PREVIEW_ACTION: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
};

const mediaItem = z.object({
  url: z
    .url()
    .describe(
      "A public https link straight to the photo or video file, or a Google Drive link shared as 'Anyone with the link'. Not Dropbox, OneDrive or iCloud links (they open a web page).",
    ),
  alt_text: z.string().trim().max(1000).optional().describe("A short description of the photo."),
});

async function brandAccounts(ctx: ToolContext, tenantId: string) {
  const { data, error } = await ctx.db
    .from("social_accounts")
    .select("id, platform, username, status")
    .eq("tenant_id", tenantId);
  if (error) throw new Error(`mcp preview_post accounts failed: ${error.message}`);
  return data ?? [];
}

const describeAccounts = (rows: { id: string; platform: string; username: string | null }[]) =>
  rows
    .map((a) => `${a.id} (${platformLabel(a.platform)}${a.username ? ` @${a.username}` : ""})`)
    .join(", ");

export const previewPost = defineTool({
  name: "preview_post",
  title: "Preview a post",
  description:
    "Step 1 of posting. Checks a post (wording, photos/videos, accounts, time) and returns a preview plus a one-time confirmation code. Nothing is posted. Show the owner the preview exactly as returned (wording, media, accounts, when) and ask them to approve it; only then call create_post with the confirmation. If they want changes, call preview_post again. Use account_id values from list_brands (not names). Write from the business info (search_knowledge): never invent prices, offers or promises, and no engagement bait like 'comment below 👇'.",
  access: "act",
  ability: "posts.write",
  annotations: PREVIEW_ACTION,
  wraps: "post_previews (then publishing.createPost)",
  input: z.object({
    brand_id: brandId,
    content: z.string().trim().min(1).max(POST_TEXT_MAX).describe("The post's caption."),
    account_ids: z
      .array(z.uuid())
      .min(1)
      .max(10)
      .describe("account_id values from list_brands for this brand, one per account to post to."),
    media: z
      .array(mediaItem)
      .max(MAX_MEDIA)
      .default([])
      .describe("Photos or videos, in order (a carousel when several). Optional."),
    publish_at: z
      .string()
      .default("now")
      .describe(
        '"now", "queue" (the brand\'s next free posting time), or a date and time with its timezone offset, like 2026-11-21T09:00:00-06:00. At least 5 minutes ahead.',
      ),
    youtube_title: z.string().trim().max(100).optional().describe("YouTube only: the video title."),
  }),
  output: z.object({
    confirmation: z.uuid(),
    expires_at: z.string(),
    preview: z.object({
      content: z.string(),
      accounts: z.array(
        z.object({ account_id: z.uuid(), platform: z.string(), username: z.string().nullable() }),
      ),
      media: z.array(
        z.object({
          url: z.string(),
          type: z.string().nullable(),
          format: z.string().nullable(),
          size_bytes: z.number().nullable(),
        }),
      ),
      publish: z.object({ mode: z.enum(["now", "queue", "at"]), at: z.string().nullable() }),
    }),
    warnings: z.array(z.string()),
    next_step: z.string(),
  }),
  async run(ctx, input) {
    const tenantId = await resolveBrand(ctx, input.brand_id);
    const now = ctx.now?.() ?? new Date();

    const when = parsePublishWhen(input.publish_at, now);
    if ("error" in when) throw new ToolError("invalid_input", when.error);

    const all = await brandAccounts(ctx, tenantId);
    const ids = [...new Set(input.account_ids)];
    const picked = ids.map((id) => all.find((a) => a.id === id));
    if (picked.some((a) => !a)) {
      throw new ToolError(
        "invalid_input",
        `account_ids must be this brand's account_id values. This brand has: ${describeAccounts(all) || "no connected accounts"}.`,
      );
    }
    const accounts = picked as NonNullable<(typeof picked)[number]>[];
    const off = accounts.filter((a) => a.status !== "active");
    if (off.length) {
      throw new ToolError(
        "invalid_input",
        `${off.map((a) => platformLabel(a.platform)).join(", ")} is disconnected; the owner reconnects it in Waggle.`,
      );
    }
    if (accounts.some((a) => a.platform === "tiktok")) {
      throw new ToolError(
        "invalid_input",
        "TikTok needs the owner's own confirmation on every post: leave TikTok out here, and the owner posts it in Waggle.",
      );
    }
    const platforms = [...new Set(accounts.map((a) => a.platform))];
    const social = ctx.social();

    // Each link checked by Zernio: reachable, really a photo or video, within each platform's size.
    const checks = await Promise.all(
      input.media.map((m) =>
        social
          .validateMedia({ url: m.url, signal: AbortSignal.timeout(CHECK_TIMEOUT_MS) })
          .catch(() => null),
      ),
    );
    const problems: string[] = [];
    checks.forEach((c, i) => {
      if (!c) problems.push(`media[${i}]: couldn't be checked right now. Try again.`);
      else problems.push(...mediaProblems(i, c, platforms));
    });
    if (problems.length) throw new ToolError("invalid_input", problems.join(" "));

    // Each platform's own rules (text length, media required, video lengths), Zernio's dry run.
    const warnings: string[] = [];
    try {
      const v = await social.validatePost({
        content: input.content,
        mediaUrls: input.media.map((m) => m.url),
        targets: accounts.map((a) => ({
          platform: a.platform as "instagram",
          accountId: a.id,
        })),
        signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
      });
      if (v.errors.length) {
        throw new ToolError(
          "invalid_input",
          v.errors.map((e) => `${platformLabel(e.platform)}: ${e.message}`).join(" "),
        );
      }
      warnings.push(...v.warnings.map((w) => `${platformLabel(w.platform)}: ${w.message}`));
    } catch (e) {
      if (e instanceof ToolError) throw e;
      warnings.push(
        "The platforms' own checks didn't answer in time; they run again when it posts.",
      );
    }

    const media = input.media.map((m, i) => ({
      url: m.url,
      type: checks[i]?.type ?? null,
      format: checks[i]?.format ?? null,
      size_bytes: checks[i]?.size ?? null,
      alt_text: m.alt_text ?? null,
    }));
    const expires = new Date(now.getTime() + PREVIEW_TTL_MS);
    const { data: row, error } = await ctx.db
      .from("post_previews")
      .insert({
        tenant_id: tenantId,
        created_by: ctx.principal.userId,
        client_id: ctx.principal.clientId,
        content: input.content,
        account_ids: accounts.map((a) => a.id),
        media: media as unknown as Json,
        publish_mode: when.mode,
        publish_at: when.at?.toISOString() ?? null,
        youtube_title: input.youtube_title ?? null,
        expires_at: expires.toISOString(),
      })
      .select("id")
      .single();
    if (error || !row) throw new ToolError("unavailable", "Couldn't save the preview. Try again.");

    return {
      confirmation: row.id,
      expires_at: expires.toISOString(),
      preview: {
        content: input.content,
        accounts: accounts.map((a) => ({
          account_id: a.id,
          platform: a.platform,
          username: a.username,
        })),
        media: media.map(({ url, type, format, size_bytes }) => ({
          url,
          type,
          format,
          size_bytes,
        })),
        publish: { mode: when.mode, at: when.at?.toISOString() ?? null },
      },
      warnings,
      next_step:
        "Show this preview to the owner and ask them to approve it. Only after they say yes, call create_post with this confirmation (valid 30 minutes, once). To change anything, call preview_post again.",
    };
  },
});

export const createPostTool = defineTool({
  name: "create_post",
  title: "Publish or schedule a previewed post",
  description:
    "Step 2 of posting: publishes or schedules exactly the post preview_post showed, once. Call it only after the owner approved that preview in this conversation; never on your own. To change the wording, media, accounts or time, make a new preview_post instead.",
  access: "act",
  ability: "posts.write",
  annotations: PUBLIC_ACTION,
  wraps: "publishing.createPost",
  input: z.object({
    brand_id: brandId,
    confirmation: z.uuid().describe("confirmation from preview_post, after the owner approved it."),
  }),
  output: z.object({
    post_id: z.uuid(),
    outcome: z.enum(["published", "scheduled", "waiting", "failed"]),
    problem: z.string().nullable(),
  }),
  async run(ctx, input) {
    const tenantId = await resolveBrand(ctx, input.brand_id);
    const now = ctx.now?.() ?? new Date();

    // Claim the preview: this brand, this person, this assistant, not used, not expired. Atomic,
    // so a repeated call can't post twice.
    const { data: claimed } = await ctx.db
      .from("post_previews")
      .update({ used_at: now.toISOString() })
      .eq("id", input.confirmation)
      .eq("tenant_id", tenantId)
      .eq("created_by", ctx.principal.userId)
      .eq("client_id", ctx.principal.clientId)
      .is("used_at", null)
      .gt("expires_at", now.toISOString())
      .select("*")
      .maybeSingle();
    if (!claimed) {
      const { data: seen } = await ctx.db
        .from("post_previews")
        .select("used_at, expires_at, post_id")
        .eq("id", input.confirmation)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (seen?.used_at) {
        throw new ToolError(
          "already_decided",
          `This preview was already posted${seen.post_id ? ` (post_id ${seen.post_id})` : ""}. Check list_posts.`,
        );
      }
      throw new ToolError(
        "invalid_input",
        seen
          ? "This preview expired (30 minutes). Make a new one with preview_post and show it to the owner again."
          : "No preview with this confirmation for this brand. Call preview_post first.",
      );
    }
    if (
      claimed.publish_mode === "at" &&
      new Date(claimed.publish_at!).getTime() < now.getTime() + 5 * 60_000
    ) {
      throw new ToolError(
        "invalid_input",
        "The previewed time is now less than 5 minutes away. Make a new preview with a later time.",
      );
    }

    const media = (claimed.media as { url: string }[]).map((m) => ({ url: m.url, seconds: null }));
    const r = await createPost(
      { db: ctx.db, social: ctx.social },
      {
        tenantId,
        userId: ctx.principal.userId,
        content: claimed.content,
        accountIds: claimed.account_ids,
        scheduledFor: claimed.publish_mode === "at" ? new Date(claimed.publish_at!) : null,
        queued: claimed.publish_mode === "queue",
        media,
        youtubeTitle: claimed.youtube_title ?? undefined,
        via: { ...viaOf(ctx.principal), previewId: claimed.id },
        now,
      },
    );
    if (!r.ok) {
      if (r.error === "not_accepted") {
        throw new ToolError(
          "invalid_input",
          r.problems.map((p) => `${platformLabel(p.platform)}: ${p.message}`).join(" "),
        );
      }
      const messages = {
        accounts_not_owned: "These accounts aren't this brand's any more. Make a new preview.",
        account_disconnected:
          "One of these accounts is disconnected; the owner reconnects it in Waggle.",
        too_soon: "The time is too close now. Make a new preview with a later time.",
        save_failed: "The post couldn't be saved. Make a new preview and try again.",
        consent_required:
          "TikTok needs the owner's confirmation on every post; the owner posts to TikTok in Waggle.",
      } as const;
      throw new ToolError(
        r.error === "save_failed" ? "unavailable" : "invalid_input",
        messages[r.error],
      );
    }
    await ctx.db.from("post_previews").update({ post_id: r.postId }).eq("id", claimed.id);
    return { post_id: r.postId, outcome: r.outcome, problem: r.error ?? null };
  },
});

export const POSTING_TOOLS = [previewPost, createPostTool];
