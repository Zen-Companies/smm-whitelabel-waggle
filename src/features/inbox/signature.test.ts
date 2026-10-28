import { describe, expect, it } from "vitest";
import { signZernioBody, verifyZernioSignature } from "./signature";

const secret = "whsec_test";
const body = '{"id":"evt_1","event":"comment.received"}';

describe("verifyZernioSignature", () => {
  it("accepts the hex HMAC-SHA256 of the raw body", () => {
    const signature = signZernioBody(body, secret);
    expect(signature).toMatch(/^[0-9a-f]{64}$/);
    expect(verifyZernioSignature(body, signature, secret)).toBe(true);
  });

  it("accepts uppercase hex", () => {
    expect(verifyZernioSignature(body, signZernioBody(body, secret).toUpperCase(), secret)).toBe(
      true,
    );
  });

  it("rejects a signature made with another secret", () => {
    expect(verifyZernioSignature(body, signZernioBody(body, "other"), secret)).toBe(false);
  });

  it("rejects a body that changed by a single byte, even if it is the same JSON", () => {
    const signature = signZernioBody(body, secret);
    expect(verifyZernioSignature(body.replace(":", ": "), signature, secret)).toBe(false);
  });

  it.each([null, "", "abc", "z".repeat(64), "a".repeat(63), "a".repeat(66)])(
    "rejects a malformed signature %j",
    (signature) => {
      expect(verifyZernioSignature(body, signature, secret)).toBe(false);
    },
  );
});
