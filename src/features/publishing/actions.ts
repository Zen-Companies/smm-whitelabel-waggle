"use server";

import { randomUUID } from "node:crypto";
import * as Sentry from "@sentry/nextjs";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getTenantFor, NOT_ALLOWED } from "@/features/tenants";
import { writeAudit } from "@/lib/audit";
import { getSocialProvider } from "@/lib/social";
import { recordPlatformPause } from "@/lib/social/platform-pause";
import { isPlatformPaused } from "@/lib/social/zernio";
import { getServiceClient } from "@/lib/supabase/service";
import { POST_IMAGE_MAX_BYTES, POST_IMAGE_TYPES, POST_TEXT_MAX } from "./limits";
import { publishPost } from "./publish";
import { cancelScheduledPost, createPost } from "./posts";

export interface ComposeState {
  error?: string;
  /** Field the error belongs to (design.md §4: errors stay where they happened). */
  field?: "content" | "accounts" | "when" | "image";
  /** Set when the post was saved: the form resets and the new post shows in the list. */
  savedAt?: number;
  outcome?: "published" | "scheduled" | "waiting" | "failed";
}

const composeSchema = z.object({
  content: z.string().trim().min(1, "Write something to post.").max(POST_TEXT_MAX),
  accounts: z.array(z.uuid()).min(1, "Pick at least one account."),
  when: z.enum(["now", "later"]),
  // The browser sends the chosen local time as ISO (with its offset).
  scheduledFor: z.string().optional(),
});

export async function composePost(_prev: ComposeState, formData: FormData): Promise<ComposeState> {
  const parsed = composeSchema.safeParse({
    content: formData.get("content"),
    accounts: formData.getAll("accounts"),
    when: formData.get("when"),
    scheduledFor: formData.get("scheduledFor") || undefined,
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { error: issue.message, field: issue.path[0] === "accounts" ? "accounts" : "content" };
  }
  const { content, accounts, when } = parsed.data;
  let scheduledFor: Date | null = null;
  if (when === "later") {
    const at = parsed.data.scheduledFor ? new Date(parsed.data.scheduledFor) : null;
    if (!at || Number.isNaN(at.getTime())) {
      return { error: "Pick a date and time.", field: "when" };
    }
    if (at.getTime() < Date.now() + 5 * 60_000) {
      return { error: "Pick a time at least 5 minutes from now.", field: "when" };
    }
    scheduledFor = at;
  }

  const tenant = await getTenantFor("posts.write");
  if (!tenant) return { error: NOT_ALLOWED };
  const db = getServiceClient();
  // Optional image: uploaded through Zernio's presign flow before the post is created.
  const media: { url: string }[] = [];
  const image = formData.get("image");
  if (image instanceof File && image.size > 0) {
    if (!(POST_IMAGE_TYPES as readonly string[]).includes(image.type)) {
      return { error: "Use a JPG, PNG or WebP image.", field: "image" };
    }
    if (image.size > POST_IMAGE_MAX_BYTES) {
      return { error: "Use an image under 5 MB.", field: "image" };
    }
    try {
      const { publicUrl } = await getSocialProvider().uploadMedia({
        filename: image.name || "image",
        contentType: image.type,
        bytes: new Uint8Array(await image.arrayBuffer()),
        signal: AbortSignal.timeout(30_000),
      });
      media.push({ url: publicUrl });
    } catch (error) {
      if (isPlatformPaused(error)) {
        await recordPlatformPause(db);
        return {
          error: "Posting is paused on our side right now. Try again later.",
          field: "image",
        };
      }
      Sentry.captureException(error, { extra: { tenantId: tenant.id } });
      return { error: "The image couldn't be uploaded. Try again.", field: "image" };
    }
  }

  const result = await createPost(
    { db, social: getSocialProvider },
    {
      tenantId: tenant.id,
      userId: tenant.userId,
      content,
      accountIds: accounts,
      scheduledFor,
      media,
    },
  );
  if (!result.ok) {
    if (result.error === "accounts_not_owned") {
      return { error: "Pick your connected accounts only.", field: "accounts" };
    }
    if (result.error === "account_disconnected") {
      return {
        error: "One of these accounts is disconnected. Reconnect it in Settings first.",
        field: "accounts",
      };
    }
    if (result.error === "too_soon") {
      return { error: "Pick a time at least 5 minutes from now.", field: "when" };
    }
    return { error: "Couldn't save the post. Try again." };
  }
  revalidatePath("/posts");
  if (result.outcome === "failed") {
    return { error: result.error, savedAt: Date.now(), outcome: "failed" };
  }
  return { savedAt: Date.now(), outcome: result.outcome };
}

export interface PostActionState {
  error?: string;
}

const idSchema = z.object({ postId: z.uuid() });

/** Cancels a scheduled post: Zernio first, then here. */
export async function cancelPost(
  _prev: PostActionState,
  formData: FormData,
): Promise<PostActionState> {
  const parsed = idSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Something went wrong. Reload the page." };
  const tenant = await getTenantFor("posts.write");
  if (!tenant) return { error: NOT_ALLOWED };
  const result = await cancelScheduledPost(
    { db: getServiceClient(), social: getSocialProvider },
    { tenantId: tenant.id, userId: tenant.userId, postId: parsed.data.postId },
  );
  if (!result.ok) {
    return {
      error:
        result.error === "not_cancellable"
          ? "This post can't be cancelled any more."
          : "Couldn't cancel it right now. Try again.",
    };
  }
  revalidatePath("/posts");
  return {};
}

const retrySchema = z.object({
  postId: z.uuid(),
  scheduledFor: z.string().optional(),
});

/**
 * Retry a failed post, or reschedule one that failed during a Zernio pause or was cancelled
 * because its account was removed. A new idempotency key: the old one would replay the failure.
 */
export async function retryPost(
  _prev: PostActionState,
  formData: FormData,
): Promise<PostActionState> {
  const parsed = retrySchema.safeParse({
    postId: formData.get("postId"),
    scheduledFor: formData.get("scheduledFor") || undefined,
  });
  if (!parsed.success) return { error: "Something went wrong. Reload the page." };
  const at = parsed.data.scheduledFor ? new Date(parsed.data.scheduledFor) : null;
  if (at && (Number.isNaN(at.getTime()) || at.getTime() < Date.now() + 5 * 60_000)) {
    return { error: "Pick a time at least 5 minutes from now." };
  }
  const tenant = await getTenantFor("posts.write");
  if (!tenant) return { error: NOT_ALLOWED };
  const db = getServiceClient();
  const { data: updated } = await db
    .from("posts")
    .update({
      status: "queued",
      idempotency_key: randomUUID(),
      zernio_post_id: null,
      scheduled_for: at?.toISOString() ?? null,
      failure_reason: null,
      last_error: null,
      attempts: 0,
      next_attempt_at: null,
      platform_results: [],
    })
    .eq("id", parsed.data.postId)
    .eq("tenant_id", tenant.id)
    .in("status", ["failed", "partial", "cancelled"])
    .select("id");
  if (!updated?.length) return { error: "This post can't be retried." };
  await writeAudit(db, {
    tenantId: tenant.id,
    action: "post_retried",
    actor: tenant.userId,
    details: { postId: parsed.data.postId, rescheduled: !!at },
  });
  const result = await publishPost({ db, social: getSocialProvider }, parsed.data.postId);
  revalidatePath("/posts");
  return result.outcome === "failed" ? { error: result.error } : {};
}
