import { randomUUID } from "node:crypto";
import { PostsHeader } from "@/features/publishing";
import Link from "next/link";
import * as Sentry from "@sentry/nextjs";
import { can } from "@/features/orgs";
import { getCurrentTenant, ReadOnlyNote } from "@/features/tenants";
import { getSocialProvider } from "@/lib/social";
import { platformLabel } from "@/lib/social/platforms";
import type { BlogArticleView, BlogView as Blog, Integration } from "@/lib/social/types";
import { cn } from "cn";
import { BLOG_PLATFORMS, isBlogPlatform } from "./blog";
import { BlogForm } from "./blog-form";

const LABELS: Record<string, string> = {
  shopify: "Shopify",
  wordpress: "WordPress",
  webflow: "Webflow",
};

function statusOf(a: BlogArticleView): { label: string; tone: "live" | "later" | "draft" } {
  if (a.isPublished) return { label: "Published", tone: "live" };
  if (a.status === "future") return { label: "Scheduled", tone: "later" };
  return { label: "Draft", tone: "draft" };
}

function when(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
}

/** Posts → Blog (T84a). `site` and `blog` in the address pick what's shown. */
export async function BlogPage({
  site: siteParam,
  blog: blogParam,
}: {
  site?: string;
  blog?: string;
}) {
  const tenant = await getCurrentTenant();
  const mayWrite = can(tenant.role, "posts.write");
  const social = getSocialProvider();
  let sites: Integration[] = [];
  let blogs: Blog[] = [];
  let articles: BlogArticleView[] = [];
  let failed = false;
  if (tenant.zernioProfileId) {
    try {
      sites = (
        await social.listIntegrations({
          profileId: tenant.zernioProfileId,
          platforms: BLOG_PLATFORMS,
          signal: AbortSignal.timeout(15_000),
        })
      ).filter((s) => s.active && isBlogPlatform(s.platform));
    } catch (error) {
      Sentry.captureException(error, { extra: { tenantId: tenant.id, step: "blogSites" } });
      failed = true;
    }
  }
  const site = sites.find((s) => s.id === siteParam) ?? sites[0];
  let blog: Blog | undefined;
  if (site && !failed) {
    try {
      blogs = await social.listBlogs({ accountId: site.id, signal: AbortSignal.timeout(15_000) });
      blog = blogs.find((b) => b.id === blogParam) ?? blogs[0];
      if (blog) {
        articles = (
          await social.listBlogArticles({
            accountId: site.id,
            blogId: blog.id,
            signal: AbortSignal.timeout(15_000),
          })
        ).articles;
      }
    } catch (error) {
      Sentry.captureException(error, { extra: { tenantId: tenant.id, step: "blogArticles" } });
      failed = true;
    }
  }
  const href = (s: string, b?: string) =>
    `/posts/blog?site=${encodeURIComponent(s)}${b ? `&blog=${encodeURIComponent(b)}` : ""}`;

  return (
    <>
      <PostsHeader />
      {failed ? (
        <p className="danger-box">
          Your blog couldn&apos;t be loaded right now. Try again in a moment.
        </p>
      ) : !site ? (
        <div className="card flex flex-col gap-2 p-5">
          <h2 className="font-semibold">Connect your website</h2>
          <p className="text-ink-2 text-sm">
            Write blog posts here for a WordPress, Shopify or Webflow site. Connect it in Settings →
            Accounts → More connections. Wix is coming soon.
          </p>
          <Link href="/settings/accounts" className="action-link with-arrow self-start">
            Open Accounts
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            {(sites.length > 1 || blogs.length > 1) && (
              <nav aria-label="Sites and blogs" className="flex flex-wrap gap-2">
                {sites.map((s) =>
                  s.id === site.id && blogs.length > 1 ? (
                    blogs.map((b) => (
                      <Link
                        key={`${s.id}:${b.id}`}
                        href={href(s.id, b.id)}
                        aria-current={b.id === blog?.id ? "page" : undefined}
                        className={cn(
                          "rounded-full border px-3.5 py-2 text-sm",
                          b.id === blog?.id
                            ? "border-ink bg-ink text-surface"
                            : "border-line-strong",
                        )}
                      >
                        {s.name} · {b.title || b.handle}
                      </Link>
                    ))
                  ) : (
                    <Link
                      key={s.id}
                      href={href(s.id)}
                      aria-current={s.id === site.id ? "page" : undefined}
                      className={cn(
                        "rounded-full border px-3.5 py-2 text-sm",
                        s.id === site.id ? "border-ink bg-ink text-surface" : "border-line-strong",
                      )}
                    >
                      {s.name}
                    </Link>
                  ),
                )}
              </nav>
            )}
            {!blog ? (
              <p className="meta">
                {site.platform === "webflow"
                  ? "No blog collection with a rich text field was found on this Webflow site."
                  : "No blog was found on this site."}
              </p>
            ) : mayWrite ? (
              <BlogForm
                articleKey={randomUUID()}
                accountId={site.id}
                blogId={blog.id}
                platform={site.platform as (typeof BLOG_PLATFORMS)[number]}
                siteName={`${site.name} · ${LABELS[site.platform] ?? platformLabel(site.platform)}`}
              />
            ) : (
              <ReadOnlyNote role={tenant.role} what="blog posts" />
            )}
          </div>
          {blog && (
            <section
              aria-labelledby="recent-posts"
              className="card flex flex-col gap-2 p-5 lg:w-96"
            >
              <h2 id="recent-posts" className="font-semibold">
                Recent posts
              </h2>
              {articles.length ? (
                <ul className="divide-line flex flex-col divide-y">
                  {articles.map((a) => {
                    const s = statusOf(a);
                    return (
                      <li key={a.id} className="flex flex-col gap-0.5 py-2 text-sm">
                        {a.url ? (
                          <a
                            href={a.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-ink hover:text-honey-text font-medium no-underline"
                          >
                            {a.title || "Untitled"}
                          </a>
                        ) : (
                          <span className="font-medium">{a.title || "Untitled"}</span>
                        )}
                        <span className="meta">
                          {s.label}
                          {when(a.date) ? ` · ${when(a.date)}` : ""}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="meta">No posts yet.</p>
              )}
              <p className="meta">Edits and deletes stay on your site for now.</p>
            </section>
          )}
        </div>
      )}
    </>
  );
}
