import type { CommentAutomationInput } from "@/lib/social/types";

// Comment to DM (T77a, design "Automations · comment to DM"): when someone comments a word,
// Waggle sends them a message (`/v1/comment-automations`). Instagram and Facebook get the DM;
// TikTok, Threads, LinkedIn and YouTube only allow a public reply; X is refused by Zernio.

const DM = new Set(["instagram", "facebook"]);
export const REPLY_ONLY = new Set(["tiktok", "threads", "linkedin", "youtube"]);

export const canDm = (platform: string) => DM.has(platform);
export const supportsCommentAutomation = (platform: string) =>
  DM.has(platform) || REPLY_ONLY.has(platform);

type Field = "name" | "accountId" | "dmMessage" | "commentReply" | "button";
export type ParseResult =
  | { ok: true; value: CommentAutomationInput }
  | { ok: false; field: Field; error: string };

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

/** "{first name}" as owners write it → Zernio's placeholder. */
const placeholders = (s: string) => s.replace(/\{\s*first\s*name\s*\}/gi, "{{first_name}}");

export function parseCommentDmForm(f: FormData): ParseResult {
  const platform = text(f, "platform");
  const name = text(f, "name");
  const accountId = text(f, "accountId");
  if (!name) return { ok: false, field: "name", error: "Give it a name." };
  if (!accountId || !supportsCommentAutomation(platform)) {
    return { ok: false, field: "accountId", error: "Pick an Instagram, Facebook, TikTok, Threads, LinkedIn or YouTube account." };
  }
  const keywords = text(f, "keywords")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean)
    .slice(0, 50);
  const matchMode = (["exact", "contains", "word"] as const).find((m) => m === text(f, "matchMode")) ?? "contains";
  const commentReply = placeholders(text(f, "commentReply"));
  const value: CommentAutomationInput = {
    name: name.slice(0, 100),
    accountId,
    keywords,
    matchMode,
    ...(commentReply ? { commentReply } : {}),
    once: f.get("once") === "yes",
  };
  if (canDm(platform)) {
    const dm = placeholders(text(f, "dmMessage"));
    if (!dm) return { ok: false, field: "dmMessage", error: "Write the message they get." };
    value.dmMessage = dm;
    const title = text(f, "buttonTitle");
    const url = text(f, "buttonUrl");
    if (title || url) {
      if (!title || title.length > 20) {
        return { ok: false, field: "button", error: "A button needs a label of up to 20 characters." };
      }
      if (!/^https:\/\/\S+\.\S+/.test(url)) {
        return { ok: false, field: "button", error: "A button needs a link that starts with https://." };
      }
      value.button = { title, url };
    }
  } else if (!commentReply) {
    return { ok: false, field: "commentReply", error: "Write the public reply: it's all this platform allows." };
  }
  return { ok: true, value };
}
