import { z } from "zod";
import {
  createPost,
  listBoardsFor,
  parsePostOptions,
  POST_TEXT_MAX,
  targetExtras,
  type PostOptions,
} from "@/features/publishing";
import { writeAudit } from "@/lib/audit";
import { platformLabel } from "@/lib/social/platforms";
import type { Json } from "@/lib/supabase/database.types";
import { resolveBrand, ToolError, viaOf, type ToolContext } from "../context";
import {
  brandId,
  defineTool,
  LOCAL_ACTION,
  PUBLIC_ACTION,
  READ,
  type ToolAnnotations,
} from "./define";
import {
  mediaProblems,
  optionProblems,
  parsePublishWhen,
  PREVIEW_TTL_MS,
  toPostOptions,
  UPLOAD_TTL_MS,
  UPLOAD_USABLE_MS,
  type ToolPostOption,
} from "./post-preview";

// Posting in two steps (17 Nov, after an assistant published wording the owner never saw):
// preview_post checks everything and stores exactly what would go out; create_post publishes that
// stored post once, after the owner said yes. Photos and videos are public links Zernio fetches
// (checked by Zernio first); photos dropped into a chat go through Waggle's upload page
// (create_upload_link, then upload_id).

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
    .select("id, platform, username, status, zernio_account_id")
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
    upload_id: z
      .uuid()
      .optional()
      .describe(
        "upload_id from create_upload_link, after the owner added photos on Waggle's page. Its files come first, then any media links.",
      ),
    youtube_title: z.string().trim().max(100).optional().describe("YouTube only: the video title."),
    options: z
      .array(
        z.object({
          platform: z.string().describe("The platform these choices are for, e.g. instagram."),
          post_type: z
            .enum(["post", "story", "reel"])
            .optional()
            .describe("Instagram and Facebook: a feed post, a story or a reel. Default: post."),
          first_comment: z
            .string()
            .trim()
            .max(2200)
            .optional()
            .describe(
              "Instagram, Facebook, YouTube, Threads, LinkedIn: posted as the first comment.",
            ),
          title: z
            .string()
            .trim()
            .max(100)
            .optional()
            .describe("YouTube and Facebook reels: a title."),
          pinterest_board_id: z
            .string()
            .optional()
            .describe("Pinterest: board_id from list_pinterest_boards."),
          caption: z
            .string()
            .trim()
            .max(POST_TEXT_MAX)
            .optional()
            .describe("A different caption for this platform only."),
          ai_label: z
            .boolean()
            .optional()
            .describe(
              "Instagram and YouTube: label it as made with AI (or changed to look real). Only when the owner says so.",
            ),
        }),
      )
      .max(10)
      .default([])
      .describe("Optional per-platform choices. Leave out for a normal post everywhere."),
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
      options: z.record(z.string(), z.record(z.string(), z.unknown())),
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
    const optionIssues = optionProblems(input.options as ToolPostOption[], platforms);
    // A chosen Pinterest board must be one of the account's boards.
    const board = (input.options as ToolPostOption[]).find(
      (o) => o.platform.trim().toLowerCase() === "pinterest" && o.pinterest_board_id,
    )?.pinterest_board_id;
    if (board) {
      const pin = accounts.find((a) => a.platform === "pinterest");
      let ok = false;
      try {
        const r = pin
          ? await listBoardsFor(
              { db: ctx.db, social: ctx.social() },
              { tenantId, accountId: pin.id },
            )
          : null;
        ok = !!r?.boards.some((b) => b.id === board);
      } catch {
        throw new ToolError("provider_failed", "Couldn't check the Pinterest board. Try again.");
      }
      if (!ok)
        optionIssues.push(
          "options: pinterest_board_id isn't one of this account's boards (see list_pinterest_boards).",
        );
    }
    if (optionIssues.length) throw new ToolError("invalid_input", optionIssues.join(" "));
    const postOptions: PostOptions = toPostOptions(input.options as ToolPostOption[], {
      youtubeTitle: input.youtube_title,
    });

    // Photos the owner added on Waggle's page (create_upload_link) come first.
    let uploaded: { url: string }[] = [];
    if (input.upload_id) {
      const { data: up } = await ctx.db
        .from("media_uploads")
        .select("files, created_at")
        .eq("id", input.upload_id)
        .eq("tenant_id", tenantId)
        .eq("created_by", ctx.principal.userId)
        .eq("client_id", ctx.principal.clientId)
        .maybeSingle();
      if (!up) {
        throw new ToolError(
          "invalid_input",
          "No upload with this upload_id for this brand. Call create_upload_link.",
        );
      }
      if (new Date(up.created_at).getTime() + UPLOAD_USABLE_MS < now.getTime()) {
        throw new ToolError(
          "invalid_input",
          "This upload is too old. Make a new one with create_upload_link.",
        );
      }
      uploaded = (up.files as { url: string }[]) ?? [];
      if (!uploaded.length) {
        throw new ToolError(
          "invalid_input",
          "No photos were added yet. Ask the owner to add them with the link, then tell you when they're done.",
        );
      }
    }
    const allMedia = [
      ...uploaded.map((f) => ({ url: f.url, alt_text: undefined as string | undefined })),
      ...input.media,
    ];
    if (allMedia.length > MAX_MEDIA) {
      throw new ToolError("invalid_input", `At most ${MAX_MEDIA} photos or videos in one post.`);
    }
    const social = ctx.social();

    // Each link checked by Zernio: reachable, really a photo or video, within each platform's size.
    const checks = await Promise.all(
      allMedia.map((m) =>
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
        media: allMedia.map((m, i) => ({
          url: m.url,
          type: checks[i]?.type ?? null,
          altText: m.alt_text ?? null,
        })),
        // Zernio's account ids (as the composer sends), not Waggle's.
        targets: accounts.map((a) => ({
          platform: a.platform as "instagram",
          accountId: a.zernio_account_id,
        })),
        // Each platform's own caption and choices, as they'll be sent.
        extras: Object.fromEntries(
          platforms.map((p) => [p, targetExtras(p, postOptions[p], input.content)]),
        ),
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

    const media = allMedia.map((m, i) => ({
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
        options: postOptions as unknown as Json,
        expires_at: expires.toISOString(),
      })
      .select("id")
      .single();
    if (error || !row) throw new ToolError("unavailable", "Couldn't save the preview. Try again.");
    await writeAudit(ctx.db, {
      tenantId,
      action: "post_previewed",
      actor: ctx.principal.userId,
      details: {
        previewId: row.id,
        accounts: accounts.length,
        media: media.length,
        via: viaOf(ctx.principal),
      },
    });

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
        options: postOptions as Record<string, Record<string, unknown>>,
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
        .eq("created_by", ctx.principal.userId)
        .eq("client_id", ctx.principal.clientId)
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

    // Each file's kind (from Zernio's media check) and the owner's alt text go out with it.
    const media = (
      claimed.media as { url: string; type?: string | null; alt_text?: string | null }[]
    ).map((m) => ({
      url: m.url,
      seconds: null,
      type: m.type === "image" || m.type === "video" ? (m.type as "image" | "video") : null,
      altText: m.alt_text ?? null,
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
