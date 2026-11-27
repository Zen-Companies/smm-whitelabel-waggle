import { z } from "zod";
import {
  canEditLive,
  canMove,
  editDiff,
  fixLiveText,
  googleEnded,
  liveCopies,
  movePost,
  parsePostOptions,
  POST_TEXT_MAX,
  updateScheduledPost,
  type PostOptions,
  type StoredMedia,
  type UpdatePostResult,
} from "@/features/publishing";
import { platformLabel, platformOf } from "@/lib/social/platforms";
import type { PostPlatformResult } from "@/lib/social/types";
import { resolveBrand, ToolError, viaOf, type ToolContext } from "../context";
import { brandId, defineTool, PUBLIC_ACTION } from "./define";
import {
  brandAccounts,
  checkMedia,
  dryRun,
  MAX_MEDIA,
  mediaItem,
  optionsList,
  pickAccounts,
  prepareOptions,
  PREVIEW_ACTION,
  previewOf,
  savePreview,
  uploadedFiles,
  type PreviewFile,
} from "./post-draft";
import { CREATE_NEXT_STEP, previewOutput } from "./posting";
import { parsePublishWhen, placesOf, type ToolPostOption } from "./post-preview";

// Changing a post that already exists (Posts Round 3 in the app: Edit, Move, Duplicate, Fix the
// text), the same two steps as posting: a preview tool checks the change and stores it, the owner
// says yes, then apply_post_change makes it once. Each goes through the same publishing functions
// as the app (updateScheduledPost, movePost, fixLiveText; createPost for a duplicate), which call
// Zernio through the SocialProvider and write the audit row (with the assistant as `via`).

const postId = z.uuid().describe("post_id from list_posts.");

type PostRow = {
  id: string;
  status: string;
  zernio_post_id: string | null;
  content: string;
  media: StoredMedia[];
  target_account_ids: string[];
  scheduled_for: string | null;
  platform_options: PostOptions;
  platform_results: PostPlatformResult[];
  tiktok_consent_at: string | null;
};

async function loadPost(ctx: ToolContext, tenantId: string, id: string): Promise<PostRow> {
  const { data } = await ctx.db
    .from("posts")
    .select(
      "id, status, zernio_post_id, content, media, target_account_ids, scheduled_for, platform_options, platform_results, tiktok_consent_at",
    )
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .neq("status", "draft")
    .maybeSingle();
  if (!data) throw new ToolError("not_found", "No such post for this brand. Check list_posts.");
  return {
    ...data,
    media: (data.media as StoredMedia[] | null) ?? [],
    platform_options: parsePostOptions(data.platform_options),
    platform_results: (data.platform_results as unknown as PostPlatformResult[] | null) ?? [],
  };
}

const NOT_PLANNED =
  "Only a planned post (status scheduled, with a set time) can be edited or moved. A post that went out can have its text fixed with preview_text_fix where the platform allows it; one waiting for the next free time can be cancelled and posted again.";

/** The post's own files, by link (reused as they are, never re-checked or re-uploaded). */
const knownFiles = (row: PostRow) =>
  new Map(row.media.flatMap((m) => (m.url ? [[m.url, m] as const] : [])));

/** Per-platform choices without each platform's own files (they follow the post's files). */
const withoutOwnFiles = (options: PostOptions): PostOptions =>
  Object.fromEntries(
    Object.entries(options).map(([p, o]) => [
      p,
      o && Object.fromEntries(Object.entries(o).filter(([k]) => k !== "media")),
    ]),
  );

const changeOutput = z.object({
  confirmation: z.uuid(),
  expires_at: z.string(),
  next_step: z.string(),
});

const APPLY_STEP =
  "Show this to the owner and ask them to approve it. Only after they say yes, call apply_post_change with this confirmation (valid 30 minutes, once). To change anything, make a new preview.";

// ---------------------------------------------------------------------------------------------
// Edit a planned post.

export const previewPostEdit = defineTool({
  name: "preview_post_edit",
  title: "Preview changes to a planned post",
  description:
    "Step 1 of editing a planned post (status scheduled): its text, photos and videos (new order, added or removed), accounts, per-platform choices and time. Leave out what stays the same. Nothing changes yet: show the owner the preview and what changes, then call apply_post_change with the confirmation once they say yes. Only a planned post can be edited; for a post that already went out use preview_text_fix. Changing the files drops the crops made in Waggle for single platforms. Use only facts from search_knowledge.",
  access: "act",
  ability: "posts.write",
  annotations: PREVIEW_ACTION,
  wraps: "post_previews (then publishing.updateScheduledPost)",
  input: z.object({
    brand_id: brandId,
    post_id: postId,
    content: z.string().trim().min(1).max(POST_TEXT_MAX).optional().describe("The new caption."),
    account_ids: z
      .array(z.uuid())
      .min(1)
      .max(10)
      .optional()
      .describe("The accounts it goes to (all of them, not only new ones)."),
    media: z
      .array(mediaItem)
      .max(MAX_MEDIA)
      .optional()
      .describe(
        "All the files in their new order (the post's current links from list_posts, plus new links); leave out to keep them.",
      ),
    upload_id: z
      .uuid()
      .optional()
      .describe("upload_id from create_upload_link: its files are added after the others."),
    options: optionsList
      .optional()
      .describe(
        "The per-platform choices it should have (they replace the current ones; [] clears them). Leave out to keep them.",
      ),
    publish_at: z
      .string()
      .optional()
      .describe(
        "A new date and time with its timezone offset, like 2026-11-21T09:00:00-06:00 (at least 5 minutes ahead). Leave out to keep the time.",
      ),
  }),
  output: z.object({
    ...previewOutput.shape,
    changes: z
      .array(z.enum(["text", "media", "accounts", "options", "time"]))
      .describe("What the edit changes."),
  }),
  async run(ctx, input) {
    const tenantId = await resolveBrand(ctx, input.brand_id);
    const now = ctx.now?.() ?? new Date();
    const row = await loadPost(ctx, tenantId, input.post_id);
    if (!canMove(row) || !row.scheduled_for) throw new ToolError("already_decided", NOT_PLANNED);

    let at = new Date(row.scheduled_for);
    if (input.publish_at !== undefined) {
      const when = parsePublishWhen(input.publish_at, now);
      if ("error" in when) throw new ToolError("invalid_input", when.error);
      if (when.mode !== "at") {
        throw new ToolError(
          "invalid_input",
          "An edited post needs a date and time (not now or queue). To post it now, cancel it and make a new post.",
        );
      }
      at = when.at;
    }
    const when = { mode: "at" as const, at };

    const tiktokAlready = !!row.tiktok_consent_at;
    const accounts = await pickAccounts(
      ctx,
      tenantId,
      input.account_ids ?? row.target_account_ids,
      { tiktokAlready },
    );
    if (accounts.length > 10) {
      throw new ToolError(
        "invalid_input",
        "This post goes to more than 10 accounts; the owner edits it in Waggle.",
      );
    }
    const platforms = [...new Set(accounts.map((a) => a.platform))];
    const content = input.content ?? row.content;

    const uploaded = input.upload_id
      ? await uploadedFiles(ctx, tenantId, input.upload_id, now)
      : [];
    const asked =
      input.media || uploaded.length
        ? [
            ...(input.media ?? row.media.flatMap((m) => (m.url ? [{ url: m.url }] : []))),
            ...uploaded.map((f) => ({ url: f.url })),
          ]
        : null;
    const files: PreviewFile[] = asked
      ? await checkMedia(ctx, asked, platforms, knownFiles(row))
      : row.media.flatMap((m) =>
          m.url
            ? [
                {
                  url: m.url,
                  type: m.type ?? null,
                  format: null,
                  size_bytes: null,
                  alt_text: m.altText ?? null,
                  seconds: m.seconds ?? null,
                  width: m.width ?? null,
                  height: m.height ?? null,
                },
              ]
            : [],
        );
    const sameFiles =
      files.length === row.media.length && files.every((f, i) => f.url === row.media[i]?.url);

    // Choices: the new ones, else the post's; each platform's own files (crops, its part of a
    // carousel) stay only while the files are the same.
    let options: PostOptions = !input.options
      ? { ...row.platform_options }
      : input.options.length
        ? await prepareOptions(ctx, tenantId, accounts, input.options as ToolPostOption[])
        : {};
    if (sameFiles) {
      for (const [p, o] of Object.entries(row.platform_options)) {
        if (o?.media?.length) options[p] = { ...options[p], media: o.media };
      }
    } else {
      options = withoutOwnFiles(options);
    }
    // Only the platforms it goes to.
    options = Object.fromEntries(
      Object.entries(options).filter(([p, o]) => o && platforms.includes(p)),
    );

    const changes = editDiff(
      {
        content: row.content,
        media: row.media,
        accountIds: row.target_account_ids,
        options: row.platform_options,
        scheduledFor: row.scheduled_for,
      },
      {
        content,
        media: files,
        accountIds: accounts.map((a) => a.id),
        options,
        scheduledFor: at.toISOString(),
      },
    );
    if (!changes.length) {
      throw new ToolError(
        "invalid_input",
        "Nothing would change: the post already looks like this.",
      );
    }

    const { warnings, perPlatform } = await dryRun(ctx, { content, files, accounts, options });
    const saved = await savePreview(
      ctx,
      tenantId,
      {
        content,
        accountIds: accounts.map((a) => a.id),
        media: files,
        when,
        youtubeTitle: options.youtube?.title ?? null,
        options,
        change: { kind: "edit", postId: row.id },
      },
      { action: "post_change_previewed", details: { postId: row.id, change: "edit", changes } },
    );
    return {
      confirmation: saved.confirmation,
      expires_at: saved.expiresAt,
      preview: previewOf({ content, accounts, files, perPlatform, when, options }),
      warnings,
      changes,
      next_step: APPLY_STEP,
    };
  },
});

// ---------------------------------------------------------------------------------------------
// Move a planned post.

export const previewPostMove = defineTool({
  name: "preview_post_move",
  title: "Preview moving a planned post",
  description:
    "Step 1 of moving a planned post (status scheduled) to a new date and time; nothing else changes. Show the owner the old and new time, then call apply_post_change with the confirmation once they say yes. Never into the past (at least 5 minutes ahead).",
  access: "act",
  ability: "posts.write",
  annotations: PREVIEW_ACTION,
  wraps: "post_previews (then publishing.movePost)",
  input: z.object({
    brand_id: brandId,
    post_id: postId,
    publish_at: z
      .string()
      .describe(
        "The new date and time with its timezone offset, like 2026-11-21T09:00:00-06:00. Ask the owner's timezone if you don't know it.",
      ),
  }),
  output: z.object({
    ...changeOutput.shape,
    move: z.object({ post_id: z.uuid(), content: z.string(), from: z.string(), to: z.string() }),
  }),
  async run(ctx, input) {
    const tenantId = await resolveBrand(ctx, input.brand_id);
    const now = ctx.now?.() ?? new Date();
    const row = await loadPost(ctx, tenantId, input.post_id);
    if (!canMove(row) || !row.scheduled_for) throw new ToolError("already_decided", NOT_PLANNED);
    const when = parsePublishWhen(input.publish_at, now);
    if ("error" in when) throw new ToolError("invalid_input", when.error);
    if (when.mode !== "at") {
      throw new ToolError(
        "invalid_input",
        "publish_at must be a date and time with its timezone offset (not now or queue).",
      );
    }
    if (when.at.getTime() === new Date(row.scheduled_for).getTime()) {
      throw new ToolError("invalid_input", "The post is already planned for that time.");
    }
    const saved = await savePreview(
      ctx,
      tenantId,
      {
        content: row.content,
        accountIds: row.target_account_ids,
        media: [],
        when,
        options: {},
        change: { kind: "move", postId: row.id },
      },
      { action: "post_change_previewed", details: { postId: row.id, change: "move" } },
    );
    return {
      confirmation: saved.confirmation,
      expires_at: saved.expiresAt,
      move: {
        post_id: row.id,
        content: row.content,
        from: row.scheduled_for,
        to: when.at.toISOString(),
      },
      next_step: APPLY_STEP,
    };
  },
});

// ---------------------------------------------------------------------------------------------
// Fix the text of a post that went out.

/** Pure: where a live post's text can be fixed, and where it can't (with Google's ended offer). */
export function textFixPlaces(
  live: readonly string[],
  googleOver: boolean,
): { editable: string[]; notAllowed: string[]; notes: string[] } {
  const unique = [...new Set(live)];
  const editable = unique.filter((p) => canEditLive(p) && !(p === "googlebusiness" && googleOver));
  const notAllowed = unique.filter((p) => !editable.includes(p));
  const notes: string[] = [];
  const refusing = notAllowed.filter((p) => p !== "googlebusiness" || !googleOver);
  if (refusing.length) {
    notes.push(
      `${placesOf(refusing)} ${refusing.length > 1 ? "don't" : "doesn't"} allow editing a live post: the text stays as it is there (the owner can take it down and post again).`,
    );
  }
  if (googleOver && unique.includes("googlebusiness")) {
    notes.push("Google Business: the offer or event has ended, and Google removes it then.");
  }
  return { editable, notAllowed, notes };
}

export const previewTextFix = defineTool({
  name: "preview_text_fix",
  title: "Preview fixing a live post's text",
  description:
    "Step 1 of fixing the text of a post that already went out (a typo, a wrong detail), on the platforms that allow it: Facebook, LinkedIn, Google Business, YouTube (the description), X, Telegram, Reddit, Discord and Slack. Instagram, TikTok, Threads, Bluesky, Pinterest and Snapchat don't: the answer says where it won't change. The photo or video never changes. Show the owner the new text and where it changes, then call apply_post_change with the confirmation once they say yes. Use only facts from search_knowledge.",
  access: "act",
  ability: "posts.write",
  annotations: PREVIEW_ACTION,
  wraps: "post_previews (then publishing.fixLiveText)",
  input: z.object({
    brand_id: brandId,
    post_id: postId,
    content: z.string().trim().min(1).max(POST_TEXT_MAX).describe("The corrected text, in full."),
  }),
  output: z.object({
    ...changeOutput.shape,
    fix: z.object({
      post_id: z.uuid(),
      current_text: z.string(),
      new_text: z.string(),
      changes_on: z.array(z.string()).describe("Platforms where the text will change."),
      stays_on: z.array(z.string()).describe("Platforms where it can't change."),
    }),
    warnings: z.array(z.string()),
  }),
  async run(ctx, input) {
    const tenantId = await resolveBrand(ctx, input.brand_id);
    const now = ctx.now?.() ?? new Date();
    const row = await loadPost(ctx, tenantId, input.post_id);
    if (!row.zernio_post_id || !["published", "partial"].includes(row.status)) {
      throw new ToolError(
        "invalid_input",
        "Only a post that went out can have its text fixed. A planned post is changed with preview_post_edit.",
      );
    }
    const accounts = (await brandAccounts(ctx, tenantId)).filter((a) =>
      row.target_account_ids.includes(a.id),
    );
    const live = liveCopies(row.platform_results, accounts).map((c) => c.platform);
    const over = googleEnded(
      row.platform_options.googlebusiness?.google,
      now.toISOString().slice(0, 10),
    );
    const places = textFixPlaces(live, over);
    if (!places.editable.length) {
      throw new ToolError(
        "invalid_input",
        `None of the platforms this post is live on allow fixing its text (${placesOf(live) || "none live"}). The owner can take it down and post again in Waggle.`,
      );
    }
    for (const p of places.editable) {
      const max = platformOf(p)?.post?.textMax;
      if (max && input.content.length > max) {
        throw new ToolError(
          "invalid_input",
          `${platformLabel(p)} takes ${max.toLocaleString("en-US")} characters at most.`,
        );
      }
    }
    if (input.content === row.content) {
      throw new ToolError("invalid_input", "That's already the post's text.");
    }
    const saved = await savePreview(
      ctx,
      tenantId,
      {
        content: input.content,
        accountIds: row.target_account_ids,
        media: [],
        when: { mode: "now", at: null },
        options: {},
        change: { kind: "fix_text", postId: row.id },
      },
      {
        action: "post_change_previewed",
        details: { postId: row.id, change: "fix_text", platforms: places.editable },
      },
    );
    return {
      confirmation: saved.confirmation,
      expires_at: saved.expiresAt,
      fix: {
        post_id: row.id,
        current_text: row.content,
        new_text: input.content,
        changes_on: places.editable,
        stays_on: places.notAllowed,
      },
      warnings: places.notes,
      next_step: APPLY_STEP,
    };
  },
});

// ---------------------------------------------------------------------------------------------
// Apply a previewed change.

/** An edit or move publishing didn't make, said so the assistant can pass it on. */
export function updateRefusal(r: Extract<UpdatePostResult, { ok: false }>): ToolError {
  switch (r.error) {
    case "not_editable":
      return new ToolError(
        "already_decided",
        "This post can't be changed any more: it's going out or already went out.",
      );
    case "too_soon":
      return new ToolError(
        "invalid_input",
        "The time is now less than 5 minutes away. Make a new preview with a later time.",
      );
    case "accounts_not_owned":
      return new ToolError("invalid_input", "These accounts aren't this brand's any more.");
    case "account_disconnected":
      return new ToolError(
        "invalid_input",
        "One of these accounts is disconnected; the owner reconnects it in Waggle.",
      );
    case "consent_required":
      return new ToolError(
        "invalid_input",
        "TikTok needs the owner's confirmation; the owner changes this post in Waggle.",
      );
    case "paused":
      return new ToolError(
        "unavailable",
        "Posting is paused on Waggle's side right now. Try later.",
      );
    case "unclear":
      return new ToolError(
        "provider_failed",
        "Waggle couldn't tell whether the change was saved. Check list_posts in a minute before trying again; don't repeat it blindly.",
      );
    case "gone":
      return new ToolError("not_found", "This post isn't planned any more. Check list_posts.");
    case "refused":
      return new ToolError(
        "invalid_input",
        r.problems?.length
          ? r.problems.map((p) => `${platformLabel(p.platform)}: ${p.message}`).join(" ")
          : (r.message ?? "The change wasn't accepted."),
      );
  }
}

export const applyPostChange = defineTool({
  name: "apply_post_change",
  title: "Apply a previewed change to a post",
  description:
    "Step 2 of changing an existing post: makes exactly the edit, move or text fix that preview_post_edit, preview_post_move or preview_text_fix showed, once. Call it only after the owner approved that preview in this conversation; never on your own. If it says Waggle couldn't tell whether the change was saved, check list_posts before trying anything again.",
  access: "act",
  ability: "posts.write",
  annotations: PUBLIC_ACTION,
  wraps: "publishing.updateScheduledPost, publishing.movePost, publishing.fixLiveText",
  input: z.object({
    brand_id: brandId,
    confirmation: z
      .uuid()
      .describe("confirmation from a change preview, after the owner approved it."),
  }),
  output: z.object({
    post_id: z.uuid(),
    change: z.enum(["edit", "move", "fix_text"]),
    outcome: z.enum(["updated", "unchanged", "moved", "fixed", "partly_fixed", "not_fixed"]),
    changed: z.array(z.string()).describe("Edit: what changed."),
    scheduled_for: z.string().nullable(),
    fixed_on: z.array(z.string()),
    failed: z.array(z.object({ platform: z.string(), reason: z.string() })),
    stays_on: z.array(z.string()).describe("Text fix: platforms that don't allow it."),
  }),
  async run(ctx, input) {
    const tenantId = await resolveBrand(ctx, input.brand_id);
    const now = ctx.now?.() ?? new Date();
    // Claim it: this brand, person and assistant, a change, unused and not expired. Atomic, so a
    // repeated call can't apply it twice.
    const { data: claimed } = await ctx.db
      .from("post_previews")
      .update({ used_at: now.toISOString() })
      .eq("id", input.confirmation)
      .eq("tenant_id", tenantId)
      .eq("created_by", ctx.principal.userId)
      .eq("client_id", ctx.principal.clientId)
      .not("change", "is", null)
      .is("used_at", null)
      .gt("expires_at", now.toISOString())
      .select("*")
      .maybeSingle();
    if (!claimed?.change || !claimed.post_id) {
      const { data: seen } = await ctx.db
        .from("post_previews")
        .select("used_at, change")
        .eq("id", input.confirmation)
        .eq("tenant_id", tenantId)
        .eq("created_by", ctx.principal.userId)
        .eq("client_id", ctx.principal.clientId)
        .maybeSingle();
      if (seen && !seen.change) {
        throw new ToolError(
          "invalid_input",
          "This confirmation is for a new post: use create_post with it.",
        );
      }
      if (seen?.used_at) {
        throw new ToolError(
          "already_decided",
          "This change was already applied. Check list_posts.",
        );
      }
      throw new ToolError(
        "invalid_input",
        seen
          ? "This preview expired (30 minutes). Make a new one and show it to the owner again."
          : "No change preview with this confirmation for this brand.",
      );
    }
    const base = {
      tenantId,
      userId: ctx.principal.userId,
      postId: claimed.post_id,
      via: { ...viaOf(ctx.principal), previewId: claimed.id },
    };
    const deps = { db: ctx.db, social: ctx.social };
    const empty = { changed: [], fixed_on: [], failed: [], stays_on: [] };

    if (claimed.change === "move") {
      const r = await movePost(deps, { ...base, scheduledFor: new Date(claimed.publish_at!), now });
      if (!r.ok) throw updateRefusal(r);
      return {
        ...empty,
        post_id: claimed.post_id,
        change: "move" as const,
        outcome: r.changed.length ? ("moved" as const) : ("unchanged" as const),
        scheduled_for: r.scheduledFor,
      };
    }

    if (claimed.change === "edit") {
      const media = (claimed.media as unknown as PreviewFile[]).map((m): StoredMedia => ({
        url: m.url,
        type: m.type,
        ...(m.alt_text ? { altText: m.alt_text } : {}),
        ...(m.seconds ? { seconds: m.seconds } : {}),
        ...(m.width && m.height ? { width: m.width, height: m.height } : {}),
      }));
      const r = await updateScheduledPost(deps, {
        ...base,
        content: claimed.content,
        accountIds: claimed.account_ids,
        scheduledFor: new Date(claimed.publish_at!),
        media,
        options: parsePostOptions(claimed.options),
        youtubeTitle: claimed.youtube_title ?? undefined,
        tiktokConsent: false,
        now,
      });
      if (!r.ok) throw updateRefusal(r);
      return {
        ...empty,
        post_id: claimed.post_id,
        change: "edit" as const,
        outcome: r.changed.length ? ("updated" as const) : ("unchanged" as const),
        changed: r.changed,
        scheduled_for: r.scheduledFor,
      };
    }

    const r = await fixLiveText(deps, { ...base, content: claimed.content });
    if (!r.ok) {
      throw new ToolError(
        "invalid_input",
        r.error === "too_long"
          ? (r.message ?? "The text is too long.")
          : r.error === "nothing_editable"
            ? "None of the platforms this post is on allow fixing its text now."
            : "Only a post that went out can have its text fixed.",
      );
    }
    return {
      ...empty,
      post_id: claimed.post_id,
      change: "fix_text" as const,
      outcome: !r.edited.length
        ? ("not_fixed" as const)
        : r.failed.length
          ? ("partly_fixed" as const)
          : ("fixed" as const),
      scheduled_for: null,
      fixed_on: r.edited,
      failed: r.failed,
      stays_on: r.notAllowed,
    };
  },
});

// ---------------------------------------------------------------------------------------------
// Duplicate a post.

export const duplicatePost = defineTool({
  name: "duplicate_post",
  title: "Duplicate a post",
  description:
    "Makes a preview of a new post copied from an existing one (its text, photos and videos, accounts and per-platform choices), with a new time and, if the owner wants, other accounts or wording. Nothing is posted: show the owner the preview, then call create_post with the confirmation once they say yes.",
  access: "act",
  ability: "posts.write",
  annotations: PREVIEW_ACTION,
  wraps: "post_previews (then publishing.createPost)",
  input: z.object({
    brand_id: brandId,
    post_id: postId,
    publish_at: z
      .string()
      .describe(
        '"now", "queue" (the brand\'s next free posting time), or a date and time with its timezone offset, like 2026-11-21T09:00:00-06:00.',
      ),
    content: z
      .string()
      .trim()
      .min(1)
      .max(POST_TEXT_MAX)
      .optional()
      .describe("New wording; leave out to copy the post's."),
    account_ids: z
      .array(z.uuid())
      .min(1)
      .max(10)
      .optional()
      .describe("Other accounts; leave out to use the post's."),
  }),
  output: previewOutput,
  async run(ctx, input) {
    const tenantId = await resolveBrand(ctx, input.brand_id);
    const now = ctx.now?.() ?? new Date();
    const row = await loadPost(ctx, tenantId, input.post_id);
    const when = parsePublishWhen(input.publish_at, now);
    if ("error" in when) throw new ToolError("invalid_input", when.error);
    const accounts = await pickAccounts(ctx, tenantId, input.account_ids ?? row.target_account_ids);
    const platforms = [...new Set(accounts.map((a) => a.platform))];
    const content = input.content ?? row.content;
    // The source's files are reused as they are (already on Zernio's storage), with its choices
    // and crops, only for the platforms it now goes to.
    const files = await checkMedia(
      ctx,
      row.media.flatMap((m) => (m.url ? [{ url: m.url }] : [])),
      platforms,
      knownFiles(row),
    );
    const options: PostOptions = Object.fromEntries(
      Object.entries(row.platform_options).filter(([p, o]) => o && platforms.includes(p)),
    );
    const { warnings, perPlatform } = await dryRun(ctx, { content, files, accounts, options });
    const saved = await savePreview(
      ctx,
      tenantId,
      {
        content,
        accountIds: accounts.map((a) => a.id),
        media: files,
        when,
        youtubeTitle: options.youtube?.title ?? null,
        options,
      },
      {
        action: "post_previewed",
        details: { duplicateOf: row.id, accounts: accounts.length, media: files.length },
      },
    );
    return {
      confirmation: saved.confirmation,
      expires_at: saved.expiresAt,
      preview: previewOf({ content, accounts, files, perPlatform, when, options }),
      warnings,
      next_step: CREATE_NEXT_STEP,
    };
  },
});

export const POST_CHANGE_TOOLS = [
  previewPostEdit,
  previewPostMove,
  previewTextFix,
  applyPostChange,
  duplicatePost,
];
