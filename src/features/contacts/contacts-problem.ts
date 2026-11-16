import { SocialProviderError } from "@/lib/social/types";

/**
 * Why the contact list didn't load: "not_set_up" when the provider doesn't know this business
 * (no access or no such profile: it will never load as it is), "down" for anything that a retry
 * can fix (timeouts, outages, rate limits).
 */
export type ContactsProblem = "not_set_up" | "down";

/** Pure: sort a failed listContacts call. */
export function contactsProblem(error: unknown): ContactsProblem {
  if (error instanceof SocialProviderError) {
    const s = error.details.status;
    if (s === 403 || s === 404) return "not_set_up";
  }
  return "down";
}
