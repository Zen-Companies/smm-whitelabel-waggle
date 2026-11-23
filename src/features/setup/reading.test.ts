import { describe, expect, it } from "vitest";
import type { CatchUpProgress } from "@/features/catch-up/reveal-data";
import {
  READING_FAIL_LIMIT,
  READING_STALL_MS,
  readingHealth,
  readingTiles,
  readStateOf,
  readTiles,
  STARTING_READ_MS,
  writingLine,
} from "./reading";

const progress = (over: Partial<CatchUpProgress> = {}): CatchUpProgress => ({
  catchUpId: "c1",
  phase: "reading",
  platform: "instagram",
  handle: "sunnyside",
  commentsFound: 14,
  messagesFound: 9,
  waiting: 0,
  capped: false,
  dmAccessMissing: false,
  ...over,
});

describe("readingTiles", () => {
  it("is plain, and still waiting is unknown until sorted", () => {
    const tiles = readingTiles(progress());
    expect(tiles.every((t) => t.tone === "plain")).toBe(true);
    expect(tiles.map((t) => t.value)).toEqual(["14", "9", "–"]);
    expect(tiles[2]).toMatchObject({ label: "still waiting", note: "known when sorted" });
    expect(tiles[0].note).toBe("still counting…");
  });

  it("shows the waiting count once sorted", () => {
    const tiles = readingTiles(progress({ phase: "drafting", waiting: 5 }));
    expect(tiles[2].value).toBe("5");
    expect(tiles[2].note).toBeNull();
  });
});

describe("readTiles", () => {
  it("red only for a non-zero no reply", () => {
    const { tiles, quiet } = readTiles({
      comments: 34,
      messages: 19,
      dmAccessMissing: false,
      noReply: 5,
      capped: false,
    });
    expect(tiles.map((t) => [t.value, t.label, t.tone])).toEqual([
      ["34", "comments", "plain"],
      ["19", "messages", "plain"],
      ["5", "no reply", "lost"],
    ]);
    expect(quiet).toBe(false);
  });

  it("a quiet month is all zeros, all plain", () => {
    const { tiles, quiet } = readTiles({
      comments: 0,
      messages: 0,
      dmAccessMissing: false,
      noReply: 0,
      capped: false,
    });
    expect(tiles.map((t) => t.value)).toEqual(["0", "0", "0"]);
    expect(tiles.every((t) => t.tone === "plain")).toBe(true);
    expect(quiet).toBe(true);
  });

  it("never a misleading 0 messages when Waggle can't see them", () => {
    const { tiles } = readTiles({
      comments: 3,
      messages: 0,
      dmAccessMissing: true,
      noReply: 0,
      capped: false,
    });
    expect(tiles[1].value).toBe("—");
  });
});

describe("readingHealth", () => {
  it("is ok while things change and asks work", () => {
    expect(readingHealth({ failures: 0, lastChangeAt: 0, now: 1000 })).toBe("ok");
  });

  it("is stalled after a long time with no change", () => {
    expect(readingHealth({ failures: 0, lastChangeAt: 0, now: READING_STALL_MS })).toBe("stalled");
  });

  it("is offline after asks fail in a row", () => {
    expect(readingHealth({ failures: READING_FAIL_LIMIT, lastChangeAt: 0, now: 1 })).toBe(
      "offline",
    );
  });
});

describe("writingLine", () => {
  it("counts what's written", () => {
    expect(writingLine({ done: 2, of: 5 })).toBe("Writing replies · 2 of 5");
    expect(writingLine({ done: 7, of: 5 })).toBe("Writing replies · 5 of 5");
  });
});

describe("readStateOf", () => {
  const now = new Date("2026-11-23T10:00:00Z");
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
  it("is read once the brand has a catch-up", () => {
    expect(readStateOf({ hasCatchUp: true, account: null, now })).toBe("read");
  });
  it("is before only when the same account was read elsewhere", () => {
    expect(
      readStateOf({
        hasCatchUp: false,
        account: { readElsewhere: true, connectedAt: ago(0) },
        now,
      }),
    ).toBe("before");
  });
  it("is starting right after a connect, not read before (the catch-up is on its way)", () => {
    expect(
      readStateOf({
        hasCatchUp: false,
        account: { readElsewhere: false, connectedAt: ago(5_000) },
        now,
      }),
    ).toBe("starting");
    expect(
      readStateOf({
        hasCatchUp: false,
        account: { readElsewhere: false, connectedAt: ago(STARTING_READ_MS) },
        now,
      }),
    ).toBe("none");
  });
  it("is none without a readable account", () => {
    expect(readStateOf({ hasCatchUp: false, account: null, now })).toBe("none");
  });
});
