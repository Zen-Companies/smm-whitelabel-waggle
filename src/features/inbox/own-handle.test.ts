import { describe, expect, it } from "vitest";
import { sameHandle } from "./ingest";

describe("sameHandle (T61: our own replies come back as comments)", () => {
  it("matches the account's handle with or without @, any case", () => {
    expect(sameHandle("@HarbourBean", "harbourbean")).toBe(true);
    expect(sameHandle("harbourbean.bsky.social", "harbourbean.bsky.social")).toBe(true);
  });
  it("doesn't match other people or a missing name", () => {
    expect(sameHandle("kape.lover", "harbourbean")).toBe(false);
    expect(sameHandle(undefined, "harbourbean")).toBe(false);
    expect(sameHandle("@", "@")).toBe(false);
  });
});
