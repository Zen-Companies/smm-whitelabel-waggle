import type { Json } from "@/lib/supabase/database.types";

// Limits on AI-assistant calls (docs/mcp/PLAN.md §5.3, §7). Pure: the counts come from mcp_calls.
// Why a limit at all: hosts let users "always allow" a tool, customer text can try to steer the
// model, assistants can loop, Instagram/Facebook penalise bursts, and a stolen token. Not cost.

export type CallKind = "read" | "act" | "send";

/** Tools that put something in front of customers: replies and posts. */
export const SEND_TOOLS = ["approve_reply", "write_reply", "create_post"] as const;

export function kindOf(tool: { name: string; access: "read" | "act" }): CallKind {
  if ((SEND_TOOLS as readonly string[]).includes(tool.name)) return "send";
  return tool.access;
}

export interface McpLimits {
  /** Calls per user and assistant per minute. */
  perMinute: number;
  /** Calls per user per 24 hours. */
  perDay: number;
  /** Actions (anything but reads) per brand per hour. */
  actsPerHour: number;
  /** Replies and posts per brand per 10 minutes. */
  burstSends: number;
  /** Replies and posts per brand per 24 hours, unless the brand has its own. */
  dailySends: number;
}

export const BURST_WINDOW_MS = 10 * 60_000;

const int = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : fallback;
};

export function limitsFromEnv(env: Record<string, string | undefined> = process.env): McpLimits {
  return {
    perMinute: int(env.MCP_CALLS_PER_MINUTE, 60),
    perDay: int(env.MCP_CALLS_PER_DAY, 1000),
    actsPerHour: int(env.MCP_ACTS_PER_HOUR, 30),
    burstSends: int(env.MCP_BURST_SEND_CAP, 10),
    dailySends: int(env.MCP_DAILY_SEND_CAP, 100),
  };
}

/** Counts in each window, this call included (it is logged before it is checked). */
export interface CallCounts {
  userClientMinute: number;
  userDay: number;
  brandActsHour: number | null;
  brandSendsBurst: number | null;
  brandSendsDay: number | null;
}

export type LimitBreach =
  { code: "rate_limited"; message: string } | { code: "daily_limit"; message: string };

/** Pure: the first limit this call goes over, or null. `dailyCap`: the brand's own, if set. */
export function overLimit(
  kind: CallKind,
  c: CallCounts,
  limits: McpLimits,
  dailyCap: number | null,
): LimitBreach | null {
  if (c.userClientMinute > limits.perMinute || c.userDay > limits.perDay) {
    return {
      code: "rate_limited",
      message: "Too many requests to Waggle right now. Wait a minute, then try again.",
    };
  }
  if (kind !== "read" && c.brandActsHour !== null && c.brandActsHour > limits.actsPerHour) {
    return {
      code: "rate_limited",
      message: `This brand has had ${limits.actsPerHour} actions from AI assistants in the last hour. Wait a while, or do it in Waggle.`,
    };
  }
  if (kind === "send") {
    if (c.brandSendsBurst !== null && c.brandSendsBurst > limits.burstSends) {
      return {
        code: "rate_limited",
        message: `This brand has sent ${limits.burstSends} replies or posts through AI assistants in the last 10 minutes. Wait a few minutes, then try again.`,
      };
    }
    const cap = dailyCap ?? limits.dailySends;
    if (c.brandSendsDay !== null && c.brandSendsDay > cap) {
      return {
        code: "daily_limit",
        message: `This brand reached its limit of ${cap} replies and posts from AI assistants in 24 hours. The owner can still send from Waggle.`,
      };
    }
  }
  return null;
}

/** Arguments kept in the activity log: choices, ids and numbers. Free text never (rule 10). */
const KEPT_TEXT = new Set([
  "tab",
  "action",
  "show",
  "section",
  "platform",
  "sort",
  "reply_via",
  "publish_at",
  "cursor",
]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function redactArgs(args: unknown): { [key: string]: Json } {
  if (!args || typeof args !== "object" || Array.isArray(args)) return {};
  const out: { [key: string]: Json } = {};
  for (const [key, value] of Object.entries(args).slice(0, 20)) {
    if (typeof value === "number" || typeof value === "boolean" || value === null) {
      out[key] = value;
    } else if (typeof value === "string") {
      out[key] =
        UUID.test(value) || (KEPT_TEXT.has(key) && value.length <= 40)
          ? value
          : `[text, ${value.length} chars]`;
    } else if (Array.isArray(value)) {
      out[key] = value.every((v) => typeof v === "string" && UUID.test(v))
        ? (value.slice(0, 20) as string[])
        : `[list, ${value.length} items]`;
    } else {
      out[key] = "[object]";
    }
  }
  return out;
}

/** The brand a call is about, from its arguments (only one the assistant may use). */
export function brandOfCall(args: unknown, brandIds: readonly string[]): string | null {
  const id =
    args && typeof args === "object" && "brand_id" in args
      ? (args as { brand_id?: unknown }).brand_id
      : undefined;
  if (typeof id === "string") return brandIds.includes(id) ? id : null;
  return brandIds.length === 1 ? brandIds[0] : null;
}
