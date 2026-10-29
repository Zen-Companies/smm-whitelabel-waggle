import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { inject } from "vitest";
import { SocialProviderError, type SocialProvider } from "@/lib/social/types";
import type { Database } from "@/lib/supabase/database.types";
import type { ServiceClient } from "@/lib/supabase/service";

export function serviceClient(): ServiceClient {
  return createClient<Database>(inject("supabaseUrl"), inject("supabaseServiceKey"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function anonClient() {
  return createClient<Database>(inject("supabaseUrl"), inject("supabaseAnonKey"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export const uniqueEmail = () => `it-${randomUUID()}@test.local`;

/**
 * In-memory stand-in for Zernio's profile API: one profile per externalId, and a second create
 * gets the same 409 the real API returns (the adapter maps it to alreadyExisted).
 */
export function fakeZernio() {
  const profiles = new Map<string, { id: string; name: string }>();
  let loseNextResponse = false;

  const notImplemented = () => {
    throw new Error("not used in this test");
  };
  const provider: SocialProvider = {
    async createProfile({ name, externalId }) {
      await new Promise((resolve) => setTimeout(resolve, 5));
      const existing = profiles.get(externalId);
      if (existing) return { profileId: existing.id, alreadyExisted: true };
      const id = `prof_${randomUUID().slice(0, 8)}`;
      profiles.set(externalId, { id, name });
      if (loseNextResponse) {
        loseNextResponse = false;
        // Created on Zernio's side, but the response never arrived.
        throw new SocialProviderError("Zernio createProfile failed (TimeoutError)", {
          ambiguous: true,
        });
      }
      return { profileId: id, alreadyExisted: false };
    },
    getConnectUrl: notImplemented,
    createPost: notImplemented,
    replyToComment: notImplemented,
    sendDm: notImplemented,
    listConversationMessages: notImplemented,
    listCommentReplies: notImplemented,
    getAccountsHealth: notImplemented,
  };
  return {
    provider,
    profiles,
    loseNextResponse: () => {
      loseNextResponse = true;
    },
  };
}

/** claimItems narrowed to one tenant: other (live) items are released untouched. */
export function claimFor(tenantId: () => string) {
  return async (client: ServiceClient, limit: number) => {
    const { claimItems, releaseItems } = await import("@/lib/jobs");
    const items = await claimItems(client, limit);
    await releaseItems(
      client,
      items.filter((i) => i.tenantId !== tenantId()).map((i) => i.id),
    );
    return items.filter((i) => i.tenantId === tenantId());
  };
}
