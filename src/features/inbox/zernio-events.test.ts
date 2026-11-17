import { describe, expect, it } from "vitest";
import fixture from "../../../tests/fixtures/zernio/message-received.json";
import { messageEventSchema } from "./zernio-events";

describe("message.received attachments (T72)", () => {
  it("keeps the kind of each attachment and the platform's message id, never the link", () => {
    const payload = structuredClone(fixture) as Record<string, unknown> & {
      message: Record<string, unknown>;
    };
    payload.message.platformMessageId = "m_123";
    payload.message.text = null;
    payload.message.attachments = [
      { type: "image", url: "https://cdn.example/x.jpg" },
      { type: "share", originalType: "story_mention", url: "https://cdn.example/s" },
    ];
    const e = messageEventSchema.parse(payload);
    expect(e.message.platformMessageId).toBe("m_123");
    expect(e.message.attachments).toEqual([
      { type: "image" },
      { type: "share", originalType: "story_mention" },
    ]);
  });

  it("a malformed attachments list doesn't drop the message", () => {
    const payload = structuredClone(fixture) as Record<string, unknown> & {
      message: Record<string, unknown>;
    };
    payload.message.attachments = "nope";
    expect(messageEventSchema.parse(payload).message.attachments).toEqual([]);
  });
});
