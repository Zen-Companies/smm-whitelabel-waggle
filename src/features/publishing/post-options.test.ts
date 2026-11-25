import { describe, expect, it } from "vitest";
import {
  ownText,
  parsePostOptions,
  postOptionsRow,
  targetExtras,
  textFor,
  withoutMedia,
} from "./post-options";

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
      targetExtras(
        "instagram",
        { as: "post", shareToFeed: true, trialReel: true, aiLabel: true },
        "",
      ),
    ).toEqual({ platformSpecificData: { isAiGenerated: true } });
  });

  it("Facebook Reel with a title; Story drops comment and countries", () => {
    expect(
      targetExtras(
        "facebook",
        { as: "reel", title: "Ube", firstComment: "hi", countries: ["PH"] },
        "",
      ),
    ).toEqual({
      platformSpecificData: {
        contentType: "reel",
        title: "Ube",
        firstComment: "hi",
        geoRestriction: { countries: ["PH"] },
      },
    });
    expect(
      targetExtras(
        "facebook",
        { as: "story", title: "x", firstComment: "hi", countries: ["PH"] },
        "",
      ),
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
      postOptionsRow(
        { youtube: { visibility: "unlisted" }, instagram: { as: "reel" } },
        "Ube",
        "b1",
      ),
    ).toEqual({
      youtube: { visibility: "unlisted", title: "Ube" },
      instagram: { as: "reel" },
      pinterest: { boardId: "b1" },
    });
    expect(postOptionsRow({}, undefined, undefined)).toEqual({});
  });
});

describe("a platform's own text (Posts round 1, 25 Nov)", () => {
  it("follows the caption until the owner really changes it", () => {
    expect(ownText(undefined, "Caption")).toBeNull();
    expect(ownText({ text: "Caption" }, "Caption")).toBeNull();
    expect(ownText({ text: "  " }, "Caption")).toBeNull();
    expect(ownText({ text: "Short" }, "Caption")).toBe("Short");
  });

  it("is what goes to that platform, and only a real change is sent", () => {
    const options = { bluesky: { text: "Short" }, threads: { text: "New caption" } };
    expect(textFor("bluesky", options, "New caption")).toBe("Short");
    expect(textFor("threads", options, "New caption")).toBe("New caption");
    expect(textFor("instagram", options, "New caption")).toBe("New caption");
    expect(targetExtras("threads", options.threads, "New caption")).toEqual({});
    expect(targetExtras("bluesky", options.bluesky, "New caption")).toEqual({
      customContent: "Short",
    });
  });
});

describe("a platform's own crop (Posts Round 2)", () => {
  const crop = {
    url: "https://media.example.com/ig-crop.jpg",
    type: "image" as const,
    width: 1080,
    height: 1350,
  };

  it("goes to Zernio as that platform's customMedia, with its type", () => {
    const o = parsePostOptions({ instagram: { media: [crop] } });
    expect(targetExtras("instagram", o.instagram, "Hi")).toEqual({
      customMedia: [{ type: "image", url: crop.url }],
    });
    expect(targetExtras("facebook", o.facebook, "Hi")).toEqual({});
  });

  it("is never taken from the browser's options", () => {
    expect(withoutMedia({ instagram: { as: "story", media: [crop] } })).toEqual({
      instagram: { as: "story" },
    });
  });

  it("a link that isn't one is dropped", () => {
    expect(parsePostOptions({ instagram: { media: [{ url: "nope" }] } })).toEqual({
      instagram: {},
    });
  });
});
