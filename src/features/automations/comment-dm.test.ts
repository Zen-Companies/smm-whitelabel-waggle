import { describe, expect, it } from "vitest";
import { canDm, parseCommentDmForm, REPLY_ONLY, supportsCommentAutomation } from "./comment-dm";

const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

describe("comment to DM: which platforms", () => {
  it("Instagram and Facebook send a DM; four others only reply in public; X never", () => {
    expect(canDm("instagram")).toBe(true);
    expect(canDm("facebook")).toBe(true);
    for (const p of ["tiktok", "threads", "linkedin", "youtube"]) {
      expect(REPLY_ONLY.has(p)).toBe(true);
      expect(supportsCommentAutomation(p)).toBe(true);
      expect(canDm(p)).toBe(false);
    }
    expect(supportsCommentAutomation("twitter")).toBe(false);
    expect(supportsCommentAutomation("bluesky")).toBe(false);
  });
});

describe("parseCommentDmForm", () => {
  const base = {
    name: "Comment MENU → DM the menu",
    platform: "instagram",
    accountId: "acc_ig",
    keywords: "MENU, menu please , ,price",
    matchMode: "contains",
    dmMessage: "Hi {first name}! Here's our menu",
    commentReply: "Sent you a DM!",
    once: "yes",
  };

  it("reads a full Instagram automation", () => {
    expect(
      parseCommentDmForm(form({ ...base, buttonTitle: "See the menu", buttonUrl: "https://harbourbean.ph/menu" })),
    ).toEqual({
      ok: true,
      value: {
        name: "Comment MENU → DM the menu",
        accountId: "acc_ig",
        keywords: ["MENU", "menu please", "price"],
        matchMode: "contains",
        dmMessage: "Hi {{first_name}}! Here's our menu",
        commentReply: "Sent you a DM!",
        button: { title: "See the menu", url: "https://harbourbean.ph/menu" },
        once: true,
      },
    });
  });

  it("Instagram and Facebook need the DM text", () => {
    expect(parseCommentDmForm(form({ ...base, dmMessage: " " }))).toEqual({
      ok: false,
      field: "dmMessage",
      error: "Write the message they get.",
    });
  });

  it("reply-only platforms need the public reply and drop any DM fields", () => {
    expect(
      parseCommentDmForm(form({ ...base, platform: "tiktok", commentReply: "" })),
    ).toMatchObject({ ok: false, field: "commentReply" });
    const ok = parseCommentDmForm(form({ ...base, platform: "tiktok", buttonTitle: "x", buttonUrl: "https://a.b" }));
    expect(ok).toMatchObject({ ok: true });
    if (ok.ok) {
      expect(ok.value.dmMessage).toBeUndefined();
      expect(ok.value.button).toBeUndefined();
    }
  });

  it("a button needs a short title and an https link", () => {
    expect(
      parseCommentDmForm(form({ ...base, buttonTitle: "This title is far too long", buttonUrl: "https://a.b" })),
    ).toMatchObject({ ok: false, field: "button" });
    expect(
      parseCommentDmForm(form({ ...base, buttonTitle: "Menu", buttonUrl: "harbourbean.ph" })),
    ).toMatchObject({ ok: false, field: "button" });
  });

  it("X and unknown platforms are refused", () => {
    expect(parseCommentDmForm(form({ ...base, platform: "twitter" }))).toMatchObject({ ok: false });
  });

  it("no keywords means any comment", () => {
    const r = parseCommentDmForm(form({ ...base, keywords: "" }));
    expect(r.ok && r.value.keywords).toEqual([]);
  });
});
