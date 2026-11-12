import { SocialProviderError } from "@/lib/social/types";
import { platformLabel } from "@/lib/social/platforms";

// T21 offboarding: pure pieces of the staff Brands page and the clean-up (unit tested).

export const BRAND_FILTERS = ["all", "active", "offboarded", "attention"] as const;
export type BrandFilter = (typeof BRAND_FILTERS)[number];

export const parseBrandFilter = (v: unknown): BrandFilter =>
  typeof v === "string" && (BRAND_FILTERS as readonly string[]).includes(v)
    ? (v as BrandFilter)
    : "all";

export type BrandState = "active" | "offboarded" | "attention";

export function brandState(t: {
  offboarded_at: string | null;
  offboard_issue: string | null;
}): BrandState {
  if (!t.offboarded_at) return "active";
  return t.offboard_issue ? "attention" : "offboarded";
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days until the hard delete, never below 0. */
export function daysLeft(purgeAfter: string, now: Date): number {
  return Math.max(0, Math.ceil((new Date(purgeAfter).getTime() - now.getTime()) / DAY_MS));
}

/** The brand name typed to confirm: same letters, case and outer spaces aside. */
export function nameMatches(typed: string, name: string): boolean {
  const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
  return norm(typed) !== "" && norm(typed) === norm(name);
}

export { platformLabel };

/** Why a Zernio removal failed, in words an admin can act on. */
export function describeFailure(error: unknown): string {
  if (error instanceof SocialProviderError) {
    const { status } = error.details;
    if (status === undefined || status >= 500) return "Zernio didn't answer";
    if (status === 429) return "Zernio asked us to slow down";
    return `Zernio refused it (${status})`;
  }
  return "something went wrong on our side";
}

export interface Failure {
  /** "Facebook", "Instagram" or "profile". */
  what: string;
  error: unknown;
}

/** The "Needs attention" line, or null when every step went through. */
export function issueText(failures: readonly Failure[]): string | null {
  if (!failures.length) return null;
  return failures
    .map((f) =>
      f.what === "profile"
        ? `The Zernio profile wasn't deleted: ${describeFailure(f.error)}.`
        : `${f.what} didn't disconnect: ${describeFailure(f.error)}.`,
    )
    .join(" ");
}

export interface AccountView {
  platform: string;
  status: string;
  released_at: string | null;
}

/** The Accounts cell: connected platforms, or for an offboarded brand what Zernio still has. */
export function accountsSummary(state: BrandState, accounts: readonly AccountView[]): string[] {
  if (state === "active") {
    const live = accounts
      .filter((a) => a.status === "active")
      .map((a) => platformLabel(a.platform));
    return live.length ? [live.join(", ")] : ["Not connected"];
  }
  if (!accounts.length || accounts.every((a) => a.released_at)) return ["Disconnected"];
  return accounts.map(
    (a) => `${platformLabel(a.platform)} ${a.released_at ? "disconnected" : "still connected"}`,
  );
}
