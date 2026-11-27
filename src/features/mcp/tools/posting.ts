import { z } from "zod";
import { createPost, listBoardsFor, parsePostOptions, POST_TEXT_MAX } from "@/features/publishing";
import { writeAudit } from "@/lib/audit";
import { platformLabel } from "@/lib/social/platforms";
import { resolveBrand, ToolError, viaOf } from "../context";
import { brandId, defineTool, LOCAL_ACTION, PUBLIC_ACTION, READ } from "./define";
import {
  checkMedia,
  dryRun,
  MAX_MEDIA,
  mediaItem,
  optionsInput,
  pickAccounts,
  prepareOptions,
  PREVIEW_ACTION,
  previewOf,
  previewShape,
  savePreview,
  uploadedFiles,
} from "./post-draft";
import { parsePublishWhen, UPLOAD_TTL_MS, type ToolPostOption } from "./post-preview";

// Posting in two steps (17 Nov, after an assistant published wording the owner never saw):
// preview_post checks everything and stores exactly what would go out; create_post publishes that
// stored post once, after the owner said yes. Photos and videos are public links Zernio fetches
// (checked by Zernio first); photos dropped into a chat go through Waggle's upload page
// (create_upload_link, then upload_id). The checks are shared with duplicate_post and the edit
// tools (post-draft.ts).

/** What every new-post preview returns: the confirmation, what the owner sees, notes, next step. */
export const previewOutput = z.object({
  confirmation: z.uuid(),
  expires_at: z.string(),
  preview: previewShape,
  warnings: z.array(z.string()),
  next_step: z.string(),
});

export const CREATE_NEXT_STEP =
  "Show this preview to the owner and ask them to approve it. Only after they say yes, call create_post with this confirmation (valid 30 minutes, once). To change anything, make a new preview.";

export const previewPost = defineTool({
  name: "preview_post",
  title: "Preview a post",
  description:
    "Step 1 of posting. Checks a post (wording, photos/videos, accounts, time, per-platform choices) and returns a preview plus a one-time confirmation code. Nothing is posted. Show the owner the preview exactly as returned (wording, media and what each platform gets of a carousel, accounts, when, warnings) and ask them to approve it; only then call create_post with the confirmation. If they want changes, call preview_post again. Up to 20 photos and videos make a carousel; each platform gets the part it takes (media_per_platform and warnings say what stays off). Google Business posts can be an Update, an Offer or an Event, with a button (options.google). Use account_id values from list_brands (not names). Write from the business info (search_knowledge): never invent prices, offers or promises, and no engagement bait like 'comment below'.",
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
      .describe(
        `Photos or videos, in order; several make a carousel (up to ${MAX_MEDIA}, the first is the cover). Optional.`,
      ),
    publish_at: z
      .string()
      .default("now")
      .describe(
        '"now", "queue" (the brand\'s next free posting time), or a date and time with its timezone offset, like 2026-11-21T09:00:00-06:00. At least 5 minutes ahead.',
      ),
    upload_id: z
      .uuid()
      .optional()
      .describe(
        "upload_id from create_upload_link, after the owner added photos on Waggle's page. Its files come first, then any media links.",
      ),
    youtube_title: z.string().trim().max(100).optional().describe("YouTube only: the video title."),
    options: optionsInput,
  }),
  output: previewOutput,
  async run(ctx, input) {
    const tenantId = await resolveBrand(ctx, input.brand_id);
    const now = ctx.now?.() ?? new Date();

    const when = parsePublishWhen(input.publish_at, now);
    if ("error" in when) throw new ToolError("invalid_input", when.error);

    const accounts = await pickAccounts(ctx, tenantId, input.account_ids);
    const platforms = [...new Set(accounts.map((a) => a.platform))];
    const options = await prepareOptions(
      ctx,
      tenantId,
      accounts,
      input.options as ToolPostOption[],
      input.youtube_title,
    );

    // Photos the owner added on Waggle's page (create_upload_link) come first.
    const uploaded = input.upload_id
      ? await uploadedFiles(ctx, tenantId, input.upload_id, now)
      : [];
    const files = await checkMedia(
      ctx,
      [...uploaded.map((f) => ({ url: f.url })), ...input.media],
      platforms,
    );
    const { warnings, perPlatform } = await dryRun(ctx, {
      content: input.content,
      files,
      accounts,
      options,
    });

    const saved = await savePreview(
      ctx,
      tenantId,
      {
        content: input.content,
        accountIds: accounts.map((a) => a.id),
        media: files,
        when,
        youtubeTitle: input.youtube_title ?? null,
        options,
      },
      { action: "post_previewed", details: { accounts: accounts.length, media: files.length } },
    );
    return {
      confirmation: saved.confirmation,
      expires_at: saved.expiresAt,
      preview: previewOf({ content: input.content, accounts, files, perPlatform, when, options }),
      warnings,
      next_step: CREATE_NEXT_STEP,
    };
  },
});

export const createPostTool = defineTool({
  name: "create_post",
  title: "Publish or schedule a previewed post",
  description:
    "Step 2 of posting: publishes or schedules exactly the post preview_post (or duplicate_post) showed, once. Call it only after the owner approved that preview in this conversation; never on your own. To change the wording, media, accounts or time, make a new preview_post instead. Changes to a post that already exists (preview_post_edit, preview_post_move, preview_text_fix) are confirmed with apply_post_change, not here.",
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
      .is("change", null)
      .is("used_at", null)
      .gt("expires_at", now.toISOString())
      .select("*")
      .maybeSingle();
    if (!claimed) {
      const { data: seen } = await ctx.db
        .from("post_previews")
        .select("used_at, expires_at, post_id, change")
        .eq("id", input.confirmation)
        .eq("tenant_id", tenantId)
        .eq("created_by", ctx.principal.userId)
        .eq("client_id", ctx.principal.clientId)
        .maybeSingle();
      if (seen?.change) {
        throw new ToolError(
          "invalid_input",
          "This confirmation is for a change to an existing post: use apply_post_change with it.",
        );
      }
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

    // Each file's kind (from Zernio's media check) and the owner's alt text go out with it; a
    // duplicate's files keep the sizes and lengths the source post had.
    const media = (
      claimed.media as {
        url: string;
        type?: string | null;
        alt_text?: string | null;
        seconds?: number | null;
        width?: number | null;
        height?: number | null;
      }[]
    ).map((m) => ({
      url: m.url,
      seconds: m.seconds ?? null,
      type: m.type === "image" || m.type === "video" ? (m.type as "image" | "video") : null,
      altText: m.alt_text ?? null,
      width: m.width ?? null,
      height: m.height ?? null,
    }));
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
        options: parsePostOptions(claimed.options),
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

export const listPinterestBoards = defineTool({
  name: "list_pinterest_boards",
  title: "List Pinterest boards",
  description:
    "The boards of one of the brand's Pinterest accounts (account_id from list_brands), for options.pinterest_board_id in preview_post. Without a choice, pins go to default_board_id (the board the owner picked in Waggle) or else the account's first board.",
  access: "read",
  annotations: READ,
  wraps: "publishing.listBoardsFor",
  input: z.object({ brand_id: brandId, account_id: z.uuid() }),
  output: z.object({
    boards: z.array(z.object({ board_id: z.string(), name: z.string() })),
    default_board_id: z.string().nullable(),
  }),
  async run(ctx, input) {
    const tenantId = await resolveBrand(ctx, input.brand_id);
    let r: Awaited<ReturnType<typeof listBoardsFor>>;
    try {
      r = await listBoardsFor(
        { db: ctx.db, social: ctx.social() },
        { tenantId, accountId: input.account_id },
      );
    } catch {
      throw new ToolError("provider_failed", "Couldn't load the boards from Pinterest. Try again.");
    }
    if (!r) throw new ToolError("not_found", "That isn't one of this brand's Pinterest accounts.");
    return {
      boards: r.boards.map((b) => ({ board_id: b.id, name: b.name })),
      default_board_id: r.current,
    };
  },
});

export const createUploadLink = defineTool({
  name: "create_upload_link",
  title: "Get a link to add photos",
  description:
    "When the owner drops a photo or video into this chat, you can't pass it to Waggle: give them this link instead. They open it (signed in to Waggle), add the files, and tell you when they're done; then call preview_post with upload_id. The link works for 30 minutes, for this owner only.",
  access: "act",
  ability: "posts.write",
  annotations: { ...LOCAL_ACTION, idempotentHint: false },
  wraps: "media_uploads (Waggle's Add photos page)",
  input: z.object({ brand_id: brandId }),
  output: z.object({
    upload_id: z.uuid(),
    upload_url: z.string(),
    expires_at: z.string(),
    next_step: z.string(),
  }),
  async run(ctx, input) {
    const tenantId = await resolveBrand(ctx, input.brand_id);
    const now = ctx.now?.() ?? new Date();
    const expires = new Date(now.getTime() + UPLOAD_TTL_MS);
    const { data, error } = await ctx.db
      .from("media_uploads")
      .insert({
        tenant_id: tenantId,
        created_by: ctx.principal.userId,
        client_id: ctx.principal.clientId,
        expires_at: expires.toISOString(),
      })
      .select("id")
      .single();
    if (error || !data) throw new ToolError("unavailable", "Couldn't make the link. Try again.");
    await writeAudit(ctx.db, {
      tenantId,
      action: "mcp_upload_link_created",
      actor: ctx.principal.userId,
      details: { uploadId: data.id, via: viaOf(ctx.principal) },
    });
    const base = (process.env.APP_URL ?? "").replace(/\/$/, "");
    return {
      upload_id: data.id,
      upload_url: `${base}/add-photos/${data.id}`,
      expires_at: expires.toISOString(),
      next_step:
        "Give the owner upload_url to open. When they say they're done, call preview_post with this upload_id (and the caption, accounts and time).",
    };
  },
});

export const POSTING_TOOLS = [previewPost, createPostTool, listPinterestBoards, createUploadLink];
