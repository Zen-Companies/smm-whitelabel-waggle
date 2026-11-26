import { z } from "zod";
import type { ProviderLog } from "./types";

// Zernio's activity log (`GET /v1/logs`, docs.zernio.com/logs/list-logs), cut to codes, ids and
// error text for the staff connect trace. Request and response bodies are never read, so nothing
// a customer typed can come through.

const str = z.string().nullish().catch(null);

const entrySchema = z.object({
  type: z.string().catch(""),
  action: str,
  event_type: str,
  platform: str,
  account_id: str,
  status: str,
  status_code: z.number().nullish().catch(null),
  error_message: str,
  error_code: str,
  success_username: str,
  success_account_type: str,
  request_id: str,
  method: str,
  path: str,
  endpoint: str,
  operation_id: str,
  created_at: z.string().min(1),
  metadata: z.unknown().optional(),
});

export const logsResponseSchema = z.object({
  logs: z.array(z.unknown()).catch([]),
});

/** The few connect fields Zernio may keep in `metadata` (a JSON string) instead of on the entry. */
const metaSchema = z
  .object({
    event_type: str,
    eventType: str,
    success_username: str,
    username: str,
    success_account_type: str,
    accountType: str,
    error_message: str,
  })
  .partial()
  .catch({});

function metaOf(raw: unknown): z.infer<typeof metaSchema> {
  if (typeof raw === "string") {
    try {
      return metaSchema.parse(JSON.parse(raw));
    } catch {
      return {};
    }
  }
  return metaSchema.parse(raw ?? {});
}

/** One raw entry → the minimal shape, or null when it isn't one (no date). */
export function toProviderLog(raw: unknown): ProviderLog | null {
  const e = entrySchema.safeParse(raw);
  if (!e.success) return null;
  const d = e.data;
  const m = metaOf(d.metadata);
  return {
    type: d.type,
    status: d.status ?? null,
    statusCode: d.status_code ?? null,
    action: d.action ?? null,
    eventType: d.event_type ?? m.event_type ?? m.eventType ?? null,
    errorMessage: d.error_message ?? m.error_message ?? null,
    errorCode: d.error_code ?? null,
    platform: d.platform ?? null,
    accountId: d.account_id ?? null,
    successUsername: d.success_username ?? m.success_username ?? m.username ?? null,
    successAccountType: d.success_account_type ?? m.success_account_type ?? m.accountType ?? null,
    requestId: d.request_id ?? null,
    method: d.method ?? null,
    path: d.path ?? d.endpoint ?? null,
    operationId: d.operation_id ?? null,
    createdAt: d.created_at,
  };
}

export function toProviderLogs(data: unknown): ProviderLog[] {
  return logsResponseSchema.parse(data ?? {}).logs.flatMap((raw) => {
    const log = toProviderLog(raw);
    return log ? [log] : [];
  });
}

/** Platforms `GET /v1/logs` accepts as a filter; others are filtered after reading. */
export const LOG_PLATFORMS = [
  "tiktok",
  "instagram",
  "whatsapp",
  "facebook",
  "youtube",
  "linkedin",
  "twitter",
  "threads",
  "pinterest",
  "reddit",
  "bluesky",
  "googlebusiness",
  "telegram",
  "snapchat",
] as const;
export type LogPlatform = (typeof LOG_PLATFORMS)[number];
export const isLogPlatform = (p: string | undefined): p is LogPlatform =>
  p !== undefined && (LOG_PLATFORMS as readonly string[]).includes(p);
