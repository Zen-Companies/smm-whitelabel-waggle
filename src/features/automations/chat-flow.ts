import { z } from "zod";
import type { WorkflowGraph } from "@/lib/social/types";

// Chat flows (T77b, design "Automations · chat flow"): a short conversation that runs on its
// own when someone sends a word, then hands over to the owner. Built as a straight line of
// Zernio workflow nodes (`/v1/workflows`): trigger → steps → end.

/** Platforms Zernio runs workflows on that Waggle connects (X stays off; Reddit unavailable). */
export const FLOW_PLATFORMS = new Set(["whatsapp", "instagram", "facebook", "telegram", "bluesky", "tiktok"]);

export type FlowStep =
  | { kind: "send"; text: string }
  | { kind: "wait"; hours: number; saveAs: string }
  | { kind: "tag"; tag: string }
  | { kind: "handoff"; note: string };

export interface FlowInput {
  name: string;
  platform: string;
  accountId: string;
  keywords: string[];
  steps: FlowStep[];
}

const stepSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("send"), text: z.string().trim().max(1000) }),
  z.object({
    kind: z.literal("wait"),
    hours: z.coerce.number().int().min(1).max(720).catch(24),
    saveAs: z.string().catch("answer"),
  }),
  z.object({ kind: z.literal("tag"), tag: z.string().trim().max(50) }),
  z.object({ kind: z.literal("handoff"), note: z.string().trim().max(200).catch("") }),
]);

const fieldName = (s: string) => s.replace(/[^A-Za-z0-9_]+/g, "_").replace(/^_+|_+$/g, "") || "answer";

export function parseFlowForm(
  f: FormData,
): { ok: true; value: FlowInput } | { ok: false; field: string; error: string } {
  const name = String(f.get("name") ?? "").trim();
  const platform = String(f.get("platform") ?? "");
  const accountId = String(f.get("accountId") ?? "");
  if (!name) return { ok: false, field: "name", error: "Give it a name." };
  if (!accountId || !FLOW_PLATFORMS.has(platform)) {
    return { ok: false, field: "accountId", error: "Pick a WhatsApp, Instagram, Facebook, Telegram, Bluesky or TikTok account." };
  }
  let raw: unknown = [];
  try {
    raw = JSON.parse(String(f.get("steps") ?? "[]"));
  } catch {
    raw = [];
  }
  const steps = (Array.isArray(raw) ? raw : [])
    .slice(0, 12)
    .flatMap((s): FlowStep[] => {
      const p = stepSchema.safeParse(s);
      if (!p.success) return [];
      const v = p.data;
      if (v.kind === "send" && !v.text) return [];
      if (v.kind === "tag" && !v.tag) return [];
      if (v.kind === "wait") return [{ ...v, saveAs: fieldName(v.saveAs) }];
      return [v];
    });
  if (!steps.length || steps[0].kind !== "send") {
    return { ok: false, field: "steps", error: "Start with a message to send." };
  }
  const keywords = String(f.get("keywords") ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean)
    .slice(0, 30);
  return { ok: true, value: { name: name.slice(0, 100), platform, accountId, keywords, steps } };
}

/** The straight-line workflow graph Zernio runs. */
export function buildFlow(input: {
  keywords: string[];
  steps: FlowStep[];
  /** T77d: start on this ig.me / m.me link code instead of words. */
  referral?: string;
}): WorkflowGraph {
  const nodes: WorkflowGraph["nodes"] = [
    {
      id: "trigger",
      type: "trigger",
      config: input.referral
        ? {
            triggerType: "referral",
            referral: { ref: input.referral, matchType: "exact" },
            cooldownHours: 24,
          }
        : {
            triggerType: "inbound_message",
            keywords: input.keywords,
            matchType: input.keywords.length ? "contains" : "any",
            cooldownHours: 24,
          },
    },
  ];
  const edges: WorkflowGraph["edges"] = [];
  let prev = "trigger";
  let prevWait = false;
  input.steps.forEach((s, i) => {
    const id = `s${i + 1}`;
    if (s.kind === "send") nodes.push({ id, type: "send_message", config: { messageType: "text", text: s.text } });
    if (s.kind === "wait") nodes.push({ id, type: "wait_for_reply", config: { timeoutMinutes: s.hours * 60, saveAs: s.saveAs } });
    if (s.kind === "tag") nodes.push({ id, type: "add_tag", config: { tag: s.tag } });
    if (s.kind === "handoff") nodes.push({ id, type: "handoff", config: { note: s.note } });
    edges.push(
      prevWait
        ? { id: `e${i}`, source: prev, target: id, sourceHandle: "reply" }
        : { id: `e${i}`, source: prev, target: id },
    );
    if (prevWait) edges.push({ id: `e${i}t`, source: prev, target: "end", sourceHandle: "timeout" });
    prev = id;
    prevWait = s.kind === "wait";
  });
  nodes.push({ id: "end", type: "end" });
  // A handoff ends the run itself; anything else flows on to the end.
  const last = input.steps.at(-1);
  if (last && last.kind !== "handoff") {
    const n = input.steps.length;
    edges.push(
      prevWait
        ? { id: `e${n}`, source: prev, target: "end", sourceHandle: "reply" }
        : { id: `e${n}`, source: prev, target: "end" },
    );
    if (prevWait) edges.push({ id: `e${n}t`, source: prev, target: "end", sourceHandle: "timeout" });
  }
  return { nodes, edges, entryNodeId: "trigger" };
}
