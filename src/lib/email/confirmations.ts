import { createHash, randomBytes } from "node:crypto";
import type { ServiceClient } from "@/lib/supabase/service";

// Confirm later (hotfix, approved 21 Nov). An email signup is logged in at once; Waggle confirms
// the address afterwards with its own link. Until then team invites and Waggle's emails to that
// person wait. No row means confirmed (Google sign-ups, everyone from before the hotfix).

/** A new link token and the hash that's stored. */
export function newConfirmToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashConfirmToken(token) };
}

export function hashConfirmToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Of these people, the ones whose email isn't confirmed yet (their emails wait). */
export async function unconfirmedUserIds(
  db: ServiceClient,
  userIds: readonly string[],
): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const { data, error } = await db
    .from("email_confirmations")
    .select("user_id")
    .in("user_id", [...userIds])
    .is("confirmed_at", null);
  if (error) throw new Error(`email confirmations lookup failed: ${error.message}`);
  return new Set((data ?? []).map((r) => r.user_id));
}

/** Pure: who can be emailed, dropping anyone not confirmed yet. */
export function onlyConfirmed<T extends { userId: string }>(
  people: readonly T[],
  unconfirmed: ReadonlySet<string>,
): T[] {
  return people.filter((p) => !unconfirmed.has(p.userId));
}
