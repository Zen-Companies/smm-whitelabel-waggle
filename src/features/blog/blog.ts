// Blog posts (T84a, design "Posts · Blog"): write an article for a connected site's blog through
// Zernio's Blogs API (docs.zernio.com/blogs/create-blog-article). Sites are the brand's own
// key-connected ones (T80a): Shopify, WordPress, Webflow. Wix is held (its connect is named after
// the partner).

export const BLOG_PLATFORMS = ["shopify", "wordpress", "webflow"] as const;
export type BlogPlatform = (typeof BLOG_PLATFORMS)[number];

export const isBlogPlatform = (p: string): p is BlogPlatform =>
  (BLOG_PLATFORMS as readonly string[]).includes(p);

/** Search-engine fields: Shopify only here (WordPress and Webflow reject them). */
export const hasSeo = (p: BlogPlatform) => p === "shopify";
/** Webflow has no scheduling API. */
export const canSchedule = (p: BlogPlatform) => p !== "webflow";

const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Plain text from the form to HTML: blank lines make paragraphs, single newlines line breaks. */
export function textToHtml(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escape(p).replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}

/**
 * A `datetime-local` value in the owner's own time to ISO with their offset.
 * `offsetMinutes` is the browser's `getTimezoneOffset()` (minutes behind UTC, so -480 for UTC+8).
 */
export function localToIso(local: string, offsetMinutes: number): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m || !Number.isInteger(offsetMinutes) || Math.abs(offsetMinutes) > 14 * 60) return null;
  const ahead = -offsetMinutes;
  const sign = ahead >= 0 ? "+" : "-";
  const h = String(Math.floor(Math.abs(ahead) / 60)).padStart(2, "0");
  const min = String(Math.abs(ahead) % 60).padStart(2, "0");
  const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00${sign}${h}:${min}`;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

type Bad = { ok: false; field: string; error: string };
const val = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export type ArticleMode = "now" | "schedule" | "draft";

/** The new-article form (the cover image is uploaded by the action and added after). */
export function parseArticle(
  f: FormData,
  o: { platform: BlogPlatform; now: Date },
): { ok: true; body: Record<string, unknown>; mode: ArticleMode } | Bad {
  const title = val(f, "title");
  if (!title || title.length > 255)
    return { ok: false, field: "title", error: "Add a title, up to 255 characters." };
  const text = String(f.get("text") ?? "");
  if (text.trim().length < 20)
    return { ok: false, field: "text", error: "Write the post (at least a couple of sentences)." };
  const body: Record<string, unknown> = { title, bodyHtml: textToHtml(text) };

  const tags = [
    ...new Set(
      val(f, "tags")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    ),
  ];
  if (tags.length > 20 || tags.some((t) => t.length > 40))
    return { ok: false, field: "tags", error: "Up to 20 tags, each under 40 characters." };
  if (tags.length) body.tags = tags;

  const excerpt = val(f, "excerpt");
  if (excerpt.length > 300)
    return { ok: false, field: "excerpt", error: "Keep the summary under 300 characters." };
  if (excerpt) body.excerpt = excerpt;

  if (hasSeo(o.platform)) {
    const seoTitle = val(f, "seoTitle");
    const seoDescription = val(f, "seoDescription");
    if (seoTitle.length > 70)
      return {
        ok: false,
        field: "seoTitle",
        error: "Search titles show up to about 70 characters.",
      };
    if (seoDescription.length > 160) {
      return {
        ok: false,
        field: "seoDescription",
        error: "Search descriptions show up to about 160 characters.",
      };
    }
    if (seoTitle || seoDescription) {
      body.seo = {
        ...(seoTitle ? { title: seoTitle } : {}),
        ...(seoDescription ? { description: seoDescription } : {}),
      };
    }
  }

  const raw = val(f, "mode");
  const mode: ArticleMode = raw === "schedule" || raw === "draft" ? raw : "now";
  if (mode === "draft") body.isPublished = false;
  if (mode === "now") body.isPublished = true;
  if (mode === "schedule") {
    if (!canSchedule(o.platform))
      return {
        ok: false,
        field: "when",
        error: "Webflow can't schedule posts. Publish now or save a draft.",
      };
    const iso = localToIso(val(f, "when"), Number(val(f, "tzOffset")));
    if (!iso) return { ok: false, field: "when", error: "Pick a day and time." };
    if (Date.parse(iso) < o.now.getTime() + 5 * 60_000)
      return { ok: false, field: "when", error: "Pick a time at least 5 minutes from now." };
    body.publishDate = iso;
  }
  return { ok: true, body, mode };
}
