import { describe, expect, it } from "vitest";
import { parsePostOptions, postOptionsRow, targetExtras } from "./post-options";

describe("parsePostOptions", () => {
  it("keeps known options per platform and drops junk", () => {
    expect(
      parsePostOptions({
        instagram: { as: "reel", firstComment: " #ube ", junk: 1 },
        youtube: { title: "Ube", visibility: "unlisted" },
        pinterest: { boardId: "b1" },
        nope: "x",
      }),
    ).toEqual({
      instagram: { as: "reel", firstComment: "#ube" },
      youtube: { title: "Ube", visibility: "unlisted" },
      pinterest: { boardId: "b1" },
    });
  });

  it("anything unreadable is no options", () => {
    expect(parsePostOptions(null)).toEqual({});
    expect(parsePostOptions("x")).toEqual({});
    expect(parsePostOptions({ instagram: { as: "carousel" } })).toEqual({ instagram: {} });
  });

  it("caps collaborators at 3 and countries at 25", () => {
    const o = parsePostOptions({
      instagram: { collaborators: ["@a", "b", "c", "d"] },
      facebook: { countries: Array.from({ length: 30 }, (_, i) => `C${i}`) },
    });
    expect(o.instagram?.collaborators).toEqual(["a", "b", "c"]);
    expect(o.facebook?.countries).toHaveLength(25);
  });
});

describe("targetExtras", () => {
  it("nothing chosen sends nothing extra", () => {
    expect(targetExtras("instagram", undefined, "Shared text")).toEqual({});
  });

  it("text written for one platform goes as customContent, unless it's the shared text", () => {
    expect(targetExtras("linkedin", { text: "Longer LinkedIn text" }, "Shared")).toEqual({
      customContent: "Longer LinkedIn text",
    });
    expect(targetExtras("linkedin", { text: "Shared" }, "Shared")).toEqual({});
    expect(targetExtras("linkedin", { text: "  " }, "Shared")).toEqual({});
  });

  it("Instagram Story: contentType story, no first comment, collaborators or labels", () => {
    expect(
      targetExtras(
        "instagram",
        { as: "story", firstComment: "hi", collaborators: ["kape"], paidPartnership: true },
        "",
      ),
    ).toEqual({ platformSpecificData: { contentType: "story" } });
  });

  it("Instagram Reel: share to feed, collaborators, trial, labels, first comment", () => {
    expect(
      targetExtras(
        "instagram",
        {
          as: "reel",
          shareToFeed: true,
          collaborators: ["kape.lover"],
          trialReel: true,
          aiLabel: true,
          paidPartnership: true,
          firstComment: "#ube",
        },
        "",
      ),
    ).toEqual({
      platformSpecificData: {
        shareToFeed: true,
        collaborators: ["kape.lover"],
        trialParams: { graduationStrategy: "MANUAL" },
        isAiGenerated: true,
        isPaidPartnership: true,
        firstComment: "#ube",
      },
    });
  });

  it("Instagram post: share to feed and trial only apply to Reels", () => {
    expect(
      targetExtras("instagram", { as: "post", shareToFeed: true, trialReel: true, aiLabel: true }, ""),
    ).toEqual({ platformSpecificData: { isAiGenerated: true } });
  });

  it("Facebook Reel with a title; Story drops comment and countries", () => {
    expect(
      targetExtras("facebook", { as: "reel", title: "Ube", firstComment: "hi", countries: ["PH"] }, ""),
    ).toEqual({
      platformSpecificData: {
        contentType: "reel",
        title: "Ube",
        firstComment: "hi",
        geoRestriction: { countries: ["PH"] },
      },
    });
    expect(
      targetExtras("facebook", { as: "story", title: "x", firstComment: "hi", countries: ["PH"] }, ""),
    ).toEqual({ platformSpecificData: { contentType: "story" } });
  });

  it("Facebook post: draft on Facebook, title only on Reels", () => {
    expect(targetExtras("facebook", { as: "post", title: "x", fbDraft: true }, "")).toEqual({
      platformSpecificData: { facebookSettings: { draft: true } },
    });
  });

  it("YouTube: title, visibility, kids, AI label, playlist, first comment", () => {
    expect(
      targetExtras(
        "youtube",
        {
          title: "Ube in 30 s",
          visibility: "unlisted",
          madeForKids: false,
          aiLabel: true,
          playlistId: "pl1",
          firstComment: "Menu: link",
        },
        "",
      ),
    ).toEqual({
      platformSpecificData: {
        title: "Ube in 30 s",
        visibility: "unlisted",
        madeForKids: false,
        containsSyntheticMedia: true,
        playlistId: "pl1",
        firstComment: "Menu: link",
      },
    });
  });

  it("first comment on Threads and LinkedIn; ignored where the platform has none", () => {
    expect(targetExtras("threads", { firstComment: "x" }, "")).toEqual({
      platformSpecificData: { firstComment: "x" },
    });
    expect(targetExtras("linkedin", { firstComment: "x" }, "")).toEqual({
      platformSpecificData: { firstComment: "x" },
    });
    expect(targetExtras("tiktok", { firstComment: "x" }, "")).toEqual({});
    expect(targetExtras("bluesky", { firstComment: "x" }, "")).toEqual({});
  });

  it("Pinterest board", () => {
    expect(targetExtras("pinterest", { boardId: "b1" }, "")).toEqual({
      platformSpecificData: { boardId: "b1" },
    });
  });
});

describe("postOptionsRow", () => {
  it("adds the YouTube title and the board to the composer's choices", () => {
    expect(
      postOptionsRow({ youtube: { visibility: "unlisted" }, instagram: { as: "reel" } }, "Ube", "b1"),
    ).toEqual({
      youtube: { visibility: "unlisted", title: "Ube" },
      instagram: { as: "reel" },
      pinterest: { boardId: "b1" },
    });
    expect(postOptionsRow({}, undefined, undefined)).toEqual({});
  });
});
