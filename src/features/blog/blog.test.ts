import { describe, expect, it } from "vitest";
import { localToIso, parseArticle, textToHtml } from "./blog";

const form = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};
const now = new Date("2026-11-15T00:00:00Z");
const base = {
  title: "Five ways we serve ube",
  text: "Ube isn't just for halo-halo.\n\nHere are <five> ways\nwe serve it.",
};

describe("textToHtml (T84a)", () => {
  it("makes paragraphs and line breaks, escaping HTML", () => {
    expect(textToHtml(base.text)).toBe(
      "<p>Ube isn't just for halo-halo.</p>\n<p>Here are &lt;five&gt; ways<br>we serve it.</p>",
    );
  });
});

describe("localToIso", () => {
  it("keeps the owner's own time with their offset", () => {
    expect(localToIso("2026-11-16T08:00", -480)).toBe("2026-11-16T08:00:00+08:00");
    expect(localToIso("2026-11-16T08:00", 300)).toBe("2026-11-16T08:00:00-05:00");
    expect(localToIso("2026-11-16T08:00", 0)).toBe("2026-11-16T08:00:00+00:00");
    expect(localToIso("tomorrow", 0)).toBeNull();
  });
});

describe("parseArticle", () => {
  it("publishes now by default", () => {
    expect(
      parseArticle(form({ ...base, tags: "ube, desserts, ube" }), { platform: "wordpress", now }),
    ).toMatchObject({
      ok: true,
      mode: "now",
      body: { title: base.title, isPublished: true, tags: ["ube", "desserts"] },
    });
  });

  it("schedules at the owner's time, never in the past, never on Webflow", () => {
    const when = { ...base, mode: "schedule", when: "2026-11-16T08:00", tzOffset: "-480" };
    expect(parseArticle(form(when), { platform: "shopify", now })).toMatchObject({
      ok: true,
      body: { publishDate: "2026-11-16T08:00:00+08:00" },
    });
    expect(
      parseArticle(form({ ...when, when: "2026-11-14T08:00" }), { platform: "shopify", now }),
    ).toMatchObject({
      field: "when",
    });
    expect(parseArticle(form(when), { platform: "webflow", now })).toMatchObject({ field: "when" });
  });

  it("drafts, and search fields only on Shopify", () => {
    const seo = {
      ...base,
      mode: "draft",
      seoTitle: "Ube at Harbour Bean",
      seoDescription: "Five ways.",
    };
    expect(parseArticle(form(seo), { platform: "shopify", now })).toMatchObject({
      body: {
        isPublished: false,
        seo: { title: "Ube at Harbour Bean", description: "Five ways." },
      },
    });
    const wp = parseArticle(form(seo), { platform: "wordpress", now });
    expect(wp.ok && wp.body).not.toHaveProperty("seo");
  });

  it("needs a title and some text", () => {
    expect(
      parseArticle(form({ ...base, title: "" }), { platform: "wordpress", now }),
    ).toMatchObject({ field: "title" });
    expect(
      parseArticle(form({ ...base, text: "Hi" }), { platform: "wordpress", now }),
    ).toMatchObject({ field: "text" });
  });
});
