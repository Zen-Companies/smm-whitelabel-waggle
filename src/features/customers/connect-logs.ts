import "server-only";
import { getSocialProvider, type ProviderLog } from "@/lib/social";
import { logWindow } from "./connect-story";

// Staff connect trace: Zernio's activity log for one brand's tries, read live when staff open the
// page (and on Refresh). Read only, nothing stored. Ids only in logs (CLAUDE.md rule 10).

/** The whole read gives up after this, and the page shows Waggle's side only. */
export const LOGS_TIMEOUT_MS = 4000;
/** Only the newest tries are checked; Zernio keeps 90 days. */
export const LOGS_MAX_TRIES = 8;
const KEEP_MS = 90 * 24 * 60 * 60 * 1000;

export interface ConnectLogs {
  checkedAt: string;
  /** False when no try could be read (Zernio down, timeout, no profile). */
  reached: boolean;
  byAttempt: Map<string, ProviderLog[] | null>;
}

export async function loadConnectLogs(input: {
  profileId: string | null;
  attempts: readonly { id: string; platform: string; startedAt: string }[];
  now: Date;
}): Promise<ConnectLogs> {
  const byAttempt = new Map<string, ProviderLog[] | null>();
  const checkedAt = input.now.toISOString();
  if (!input.profileId) return { checkedAt, reached: false, byAttempt };
  const profileId = input.profileId;
  const recent = [...input.attempts]
    .filter((a) => input.now.getTime() - Date.parse(a.startedAt) < KEEP_MS)
    .sort((x, y) => (x.startedAt < y.startedAt ? 1 : -1))
    .slice(0, LOGS_MAX_TRIES);
  const signal = AbortSignal.timeout(LOGS_TIMEOUT_MS);
  let provider: ReturnType<typeof getSocialProvider>;
  try {
    provider = getSocialProvider();
  } catch {
    return { checkedAt, reached: false, byAttempt };
  }
  const results = await Promise.allSettled(
    recent.map(async (a) => {
      const { from, to } = logWindow(a.startedAt, input.now);
      const [requests, connections] = await Promise.all([
        provider.listLogs({ type: "api_request", profileId, from, to, limit: 50, signal }),
        provider.listLogs({
          type: "connections",
          profileId,
          platform: a.platform,
          from,
          to,
          limit: 50,
          signal,
        }),
      ]);
      return [...requests, ...connections];
    }),
  );
  let reached = false;
  results.forEach((r, i) => {
    const id = recent[i]!.id;
    if (r.status === "fulfilled") {
      reached = true;
      byAttempt.set(id, r.value);
    } else {
      byAttempt.set(id, null);
      console.warn("connect trace: Zernio logs unreadable", { attemptId: id });
    }
  });
  return { checkedAt, reached, byAttempt };
}
