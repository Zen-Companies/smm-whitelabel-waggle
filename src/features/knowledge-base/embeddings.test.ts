import { describe, expect, it } from "vitest";
import { EMBEDDING_DIMENSIONS, kbEmbeddingText, toVectorLiteral } from "./embeddings";

describe("kbEmbeddingText", () => {
  it("joins the trimmed title and content", () => {
    expect(kbEmbeddingText({ title: " Opening hours ", content: "Mon-Fri 7am-6pm.\n" })).toBe(
      "Opening hours\n\nMon-Fri 7am-6pm.",
    );
  });
});

describe("toVectorLiteral", () => {
  it("formats a 1536-dimension embedding for pgvector", () => {
    const literal = toVectorLiteral(Array.from({ length: EMBEDDING_DIMENSIONS }, (_, i) => i / 10));
    expect(literal.startsWith("[0,0.1,0.2,")).toBe(true);
    expect(literal.endsWith("]")).toBe(true);
  });

  it("rejects another model's dimension", () => {
    expect(() => toVectorLiteral([0.1, 0.2, 0.3])).toThrow(/3 dimensions, expected 1536/);
  });

  it("rejects non-finite values", () => {
    const v = Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0.1);
    v[5] = Number.NaN;
    expect(() => toVectorLiteral(v)).toThrow(/non-finite/);
  });
});
