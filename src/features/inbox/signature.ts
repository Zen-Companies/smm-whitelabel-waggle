import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Zernio signs the raw request body: `X-Zernio-Signature` is the lowercase hex HMAC-SHA256 of it,
 * keyed by the webhook secret (docs/tdd.md §7.1). Compare in constant time, on the exact bytes
 * received (never a re-serialized JSON).
 */
export function verifyZernioSignature(
  rawBody: string,
  signature: string | null,
  secret: string,
): boolean {
  if (!signature || !/^[0-9a-f]{64}$/i.test(signature)) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest();
  return timingSafeEqual(expected, Buffer.from(signature, "hex"));
}

export function signZernioBody(rawBody: string, secret: string): string {
  return createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
}
