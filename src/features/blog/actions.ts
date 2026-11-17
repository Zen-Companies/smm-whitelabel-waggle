"use server";

import { randomUUID } from "node:crypto";
import * as Sentry from "@sentry/nextjs";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getTenantFor, NOT_ALLOWED } from "@/features/tenants";
import { writeAudit } from "@/lib/audit";
import { getSocialProvider } from "@/lib/social";
import { SocialProviderError } from "@/lib/social/types";
import { getServiceClient } from "@/lib/supabase/service";
import { BLOG_PLATFORMS, isBlogPlatform, parseArticle } from "./blog";

export type ArticleState = {
  error?: string;
  field?: string;
  done?: string;
  /** The live link when it went out now. */
  url?: string | null;
  values?: Record<string, string>;
  /** A new idempotency key after a refused create (the old one is tied to that body). */
  key?: string;
};

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const MAX_IMAGE = 5_000_000;

const typed = (f: FormData): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const [k, v] of f.entries()) {
    if (typeof v === "string" && k !== "articleKey") out[k] = v.slice(0, 20_000);
  }
  return out;
};

/** The site must be one of this brand's own connected blogs (account ids aren't brand-scoped). */
async function ownSite(profileId: string, accountId: string) {
  const sites = await getSocialProvider().listIntegrations({
    profileId,
    platforms: BLOG_PLATFORMS,
    signal: AbortSignal.timeout(15_000),
  });
  const site = sites.find((s) => s.id === accountId && s.active);
  return site && isBlogPlatform(site.platform) ? { ...site, platform: site.platform } : null;
}

/** New blog post (T84a): published now, scheduled on the site itself, or a draft. */
export async function createArticleAction(_prev: ArticleState, f: FormData): Promise<ArticleState> {
  const tenant = await getTenantFor("posts.write");
  if (!tenant?.zernioProfileId) return { error: NOT_ALLOWED };
  const key = z.uuid().safeParse(f.get("articleKey"));
  if (!key.success) return { error: "Something went wrong. Reload the page." };
  const accountId = String(f.get("accountId") ?? "");
  const blogId = String(f.get("blogId") ?? "").slice(0, 200);
  const cover = f.get("cover");
  const file = cover instanceof File && cover.size > 0 ? cover : null;
  if (file && (!IMAGE_TYPES.includes(file.type) || file.size > MAX_IMAGE)) {
    return { error: "Use a JPEG, PNG, WebP or GIF under 5 MB.", field: "cover", values: typed(f) };
  }
  const social = getSocialProvider();
  try {
    const site = await ownSite(tenant.zernioProfileId, accountId);
    if (!site || !blogId) return { error: "That site isn't connected any more. Reload the page." };
    const parsed = parseArticle(f, { platform: site.platform, now: new Date() });
    if (!parsed.ok) return { error: parsed.error, field: parsed.field, values: typed(f) };
    if (file) {
      const { publicUrl } = await social.uploadMedia({
        filename: `blog-cover.${file.type.split("/")[1]}`,
        contentType: file.type,
        bytes: new Uint8Array(await file.arrayBuffer()),
        signal: AbortSignal.timeout(30_000),
      });
      parsed.body.image = { url: publicUrl, altText: String(parsed.body.title) };
    }
    const article = await social.createBlogArticle({
      accountId,
      blogId,
      body: parsed.body,
      idempotencyKey: key.data,
      signal: AbortSignal.timeout(45_000),
    });
    await writeAudit(getServiceClient(), {
      tenantId: tenant.id,
      action: "blog_article_created",
      actor: tenant.userId,
      details: { accountId, blogId, articleId: article.id, mode: parsed.mode },
    });
    revalidatePath("/posts/blog");
    return {
      done:
        parsed.mode === "draft"
          ? "Saved as a draft on your site."
          : parsed.mode === "schedule"
            ? "Scheduled. Your site publishes it at that time."
            : "Published.",
      url: article.url,
    };
  } catch (error) {
    const s = error instanceof SocialProviderError ? error.details.status : undefined;
    if (s === 400) {
      return {
        error:
          "Your site didn't accept the post. On Webflow, the collection may need fields Waggle can't fill.",
        values: typed(f),
        key: randomUUID(),
      };
    }
    if (s === 401 || s === 403) {
      return {
        error: "Your site's keys stopped working. Reconnect it in Settings → Accounts.",
        values: typed(f),
        key: randomUUID(),
      };
    }
    Sentry.captureException(error, { extra: { tenantId: tenant.id, step: "createArticle" } });
    // Same articleKey on retry replays the first create rather than posting twice.
    return {
      error: "We couldn't confirm it went out. Check your site's blog before trying again.",
      values: typed(f),
    };
  }
}
