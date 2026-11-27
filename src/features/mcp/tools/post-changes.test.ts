import { describe, expect, it } from "vitest";
import { ToolError, type ToolContext } from "../context";
import {
  applyPostChange,
  duplicatePost,
  previewPostEdit,
  previewPostMove,
  previewTextFix,
  textFixPlaces,
  updateRefusal,
} from "./post-changes";

const id = "7a1f0e7e-4b9b-4c3e-9d2a-0f6f1c2b3a4d";
// Input is checked before anything is read: a context that is never touched.
const ctx = {} as ToolContext;

describe("textFixPlaces: where a live post's text can be fixed (the app's Fix the text list)", () => {
  it("Facebook and LinkedIn change; Instagram and TikTok say so", () => {
    const r = textFixPlaces(["facebook", "instagram", "linkedin", "tiktok", "facebook"], false);
    expect(r.editable).toEqual(["facebook", "linkedin"]);
    expect(r.notAllowed).toEqual(["instagram", "tiktok"]);
    expect(r.notes[0]).toMatch(/Instagram, TikTok don't allow editing a live post/);
  });

  it("Google Business only while its offer or event hasn't ended", () => {
    expect(textFixPlaces(["googlebusiness"], false).editable).toEqual(["googlebusiness"]);
    const over = textFixPlaces(["googlebusiness", "facebook"], true);
    expect(over.editable).toEqual(["facebook"]);
    expect(over.notAllowed).toEqual(["googlebusiness"]);
    expect(over.notes).toEqual([
      "Google Business: the offer or event has ended, and Google removes it then.",
    ]);
  });

  it("Pinterest is left out (its pin update is in closed beta)", () => {
    expect(textFixPlaces(["pinterest"], false)).toMatchObject({
      editable: [],
      notAllowed: ["pinterest"],
    });
  });
});

describe("updateRefusal: an edit or move publishing didn't make", () => {
  it("maps each reason to a code the assistant can act on", () => {
    expect(updateRefusal({ ok: false, error: "not_editable" }).code).toBe("already_decided");
    expect(updateRefusal({ ok: false, error: "too_soon" }).code).toBe("invalid_input");
    expect(updateRefusal({ ok: false, error: "gone" }).code).toBe("not_found");
    expect(updateRefusal({ ok: false, error: "paused" }).code).toBe("unavailable");
    expect(updateRefusal({ ok: false, error: "consent_required" }).code).toBe("invalid_input");
  });

  it("an unclear answer says to check before trying again (never a blind retry)", () => {
    const e = updateRefusal({ ok: false, error: "unclear" });
    expect(e.code).toBe("provider_failed");
    expect(e.message).toMatch(/Check list_posts/);
  });

  it("platform refusals are named per platform", () => {
    const e = updateRefusal({
      ok: false,
      error: "refused",
      problems: [{ platform: "instagram", message: "needs a photo." }],
    });
    expect(e.message).toBe("Instagram: needs a photo.");
    expect(updateRefusal({ ok: false, error: "refused", message: "No." }).message).toBe("No.");
  });
});

describe("input checks before anything is read", () => {
  const refused = async (p: Promise<unknown>) => {
    const e = await p.catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ToolError);
    expect((e as ToolError).code).toBe("invalid_input");
  };

  it("a move needs the new time; a text fix needs the text", async () => {
    await refused(previewPostMove.run(ctx, { post_id: id }));
    await refused(previewTextFix.run(ctx, { post_id: id, content: "   " }));
    await refused(previewTextFix.run(ctx, { post_id: "not-a-uuid", content: "Fixed" }));
  });

  it("a duplicate needs its time; an edit takes at most 20 files and 10 accounts", async () => {
    await refused(duplicatePost.run(ctx, { post_id: id }));
    await refused(
      previewPostEdit.run(ctx, {
        post_id: id,
        media: Array.from({ length: 21 }, (_, i) => ({ url: `https://cdn.example.com/${i}.jpg` })),
      }),
    );
    await refused(
      previewPostEdit.run(ctx, { post_id: id, account_ids: Array.from({ length: 11 }, () => id) }),
    );
  });

  it("an edit's Google button must be one Waggle offers", async () => {
    await refused(
      previewPostEdit.run(ctx, {
        post_id: id,
        options: [{ platform: "googlebusiness", google: { kind: "offer", button: "WHATSAPP" } }],
      }),
    );
  });

  it("apply_post_change takes a confirmation only", async () => {
    await refused(applyPostChange.run(ctx, {}));
    await refused(applyPostChange.run(ctx, { confirmation: "yes" }));
  });
});
