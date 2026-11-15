// The composer's preview (T74a, design "5 · Posts: composer with preview"): roughly what the post
// looks like in each feed. Pure; tested. Cut-offs are approximate (each app changes them).

/** About how much text each feed shows before "more". */
const VISIBLE: Record<string, number> = {
  instagram: 125,
  facebook: 480,
  linkedin: 210,
  tiktok: 100,
  threads: 500,
  pinterest: 100,
  youtube: 100,
  googlebusiness: 250,
  bluesky: 300,
};

/** Image shape in the feed: square (Instagram), tall (Pinterest, TikTok), or as uploaded. */
export type PreviewShape = "square" | "tall" | "natural";

export function previewShape(platform: string): PreviewShape {
  if (platform === "instagram") return "square";
  if (platform === "pinterest" || platform === "tiktok") return "tall";
  return "natural";
}

/** Whether the text sits under the picture (Instagram, Pinterest, TikTok) or above it. */
export function textBelow(platform: string): boolean {
  return ["instagram", "pinterest", "tiktok"].includes(platform);
}

/** The text as the feed shows it before "more": cut at a word, with whether there's more. */
export function previewText(platform: string, text: string): { shown: string; more: boolean } {
  const max = VISIBLE[platform] ?? 280;
  const clean = text.trim();
  if (clean.length <= max) return { shown: clean, more: false };
  const cut = clean.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return { shown: `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`, more: true };
}

/** "CH" from "Coastal Home Team". */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return (
    words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? "?").slice(0, 2)
  ).toUpperCase();
}
