import "server-only";
import { createHash } from "node:crypto";
import { normalizeEmail } from "./tags";

/**
 * SHA-256 in hex, done on the server so the page never holds a plain email. Meta and TikTok
 * both accept these hashes for matching (Jason, 16 Nov: hashed email shared to measure ads).
 */
export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export interface MatchKeys {
  /** Hashed, normalized email. */
  em?: string;
  /** Hashed login id. */
  externalId: string;
}

/** The hashed keys for one login. */
export function matchKeys(userId: string, email: string | undefined): MatchKeys {
  return {
    externalId: sha256Hex(userId),
    ...(email ? { em: sha256Hex(normalizeEmail(email)) } : {}),
  };
}
