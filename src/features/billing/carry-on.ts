import { platformLabel } from "@/lib/social/platforms";
import type { PopupVersion, WorkerBeeTopic } from "./popup-copy";

// Carry on after paying (board "Playbook Round 2", 3 · Carry on after paying, approved 26 Nov):
// once Stripe has confirmed, the success moment says what happens next for about two seconds,
// then the tap carries on by itself ("Stay here instead" stops it). Things that need a choice
// open their form ready; things that are a switch are switched on and shown where they live.
// Not built: a paid tap from a topic or check-first editor (none opens a pop-up today). Pure.

export type CarryOnStep =
  /** The platform's own sign-in starts (connect, reconnect). */
  | { kind: "connect"; platform: string }
  /** Another page, ready for the next step. */
  | { kind: "go"; href: string }
  /** That kind of message is switched to Auto-reply, then How Waggle replies shows it. */
  | { kind: "worker_bee"; topic: WorkerBeeTopic; href: string }
  /** Replies for the messages that waited while replies were out, then the Inbox. */
  | { kind: "write_replies" }
  /** Back on the page it was on, which reads the new plan. */
  | { kind: "stay" };

export interface CarryOnPlan {
  step: CarryOnStep;
  /** "Opening TikTok…" */
  doing: string;
  /** "So you can finish connecting it." */
  why: string;
}

/** Where How Waggle replies lives (Teach Waggle's side panel), with the row just switched on. */
export const workerBeeHref = (topic: WorkerBeeTopic) => `/teach?replies=1&on=${topic}`;
export const ACCOUNTS_HREF = "/settings/accounts";
/** Settings, Team with the invite form's Email focused. */
export const INVITE_HREF = "/settings/team#invite-email";
/** Automations with the follow-ups card switched on, its message ready to check. */
export const FOLLOW_UPS_HREF = "/teach/automations?followups=on#follow-ups";

const TOPIC: Record<WorkerBeeTopic, string> = { faq: "questions", lead: "leads" };

/**
 * Pure: what the paid tap carries on to. `connected`: the brand's connected platforms (setup's
 * multi-pick starts the first chosen one not connected yet). `canConnect`: the page has the
 * connect action (else the connect list opens instead).
 */
export function carryOnPlan(
  version: PopupVersion,
  opts: { connected?: readonly string[]; canConnect: boolean },
): CarryOnPlan {
  const connectList: CarryOnPlan = {
    step: { kind: "go", href: ACCOUNTS_HREF },
    doing: "Opening your connected accounts…",
    why: "To connect the next one.",
  };
  const connect = (platform: string, why: string): CarryOnPlan =>
    opts.canConnect
      ? { step: { kind: "connect", platform }, doing: `Opening ${platformLabel(platform)}…`, why }
      : connectList;
  switch (version.v) {
    case "accounts":
      return version.platform
        ? connect(version.platform, "So you can finish connecting it.")
        : connectList;
    case "accounts_pick": {
      const connected = new Set(opts.connected ?? []);
      const first = version.picked.find((p) => !connected.has(p)) ?? version.picked[0];
      return first ? connect(first, "So you can finish connecting it.") : connectList;
    }
    case "worker_bee": {
      // In general, the regular questions (board: Leads stay as they were).
      const topic = version.topic ?? "faq";
      return {
        step: { kind: "worker_bee", topic, href: workerBeeHref(topic) },
        doing: `Turning on Worker Bee for ${TOPIC[topic]}…`,
        why: "Then you’ll see it in How Waggle replies.",
      };
    }
    case "replies":
      return version.level === "out"
        ? {
            step: { kind: "write_replies" },
            doing: "Writing replies for the messages that waited…",
            why: "Then you’ll see them in your Inbox.",
          }
        : {
            step: { kind: "stay" },
            doing: "Back to where you were…",
            why: "Your plan shows the new replies.",
          };
    case "idle":
      return version.platform ? connect(version.platform, "So you can reconnect it.") : connectList;
    case "team":
      return teamPlan(version.sub);
    case "try":
      return {
        step: { kind: "go", href: "/inbox" },
        doing: "Opening your Inbox…",
        why: "To see what’s waiting.",
      };
  }
}

function teamPlan(sub: "invite" | "brands" | "follow_ups" | "leads"): CarryOnPlan {
  switch (sub) {
    case "invite":
      return {
        step: { kind: "go", href: INVITE_HREF },
        doing: "Opening your team…",
        why: "To invite the people you work with.",
      };
    case "brands":
      return {
        step: { kind: "go", href: "/brands/new" },
        doing: "Opening a new business…",
        why: "To add it to Waggle.",
      };
    case "follow_ups":
      return {
        step: { kind: "go", href: FOLLOW_UPS_HREF },
        doing: "Opening follow-ups…",
        why: "Switched on, with your message ready to check.",
      };
    case "leads":
      return {
        step: { kind: "go", href: "/contacts/leads" },
        doing: "Opening your leads…",
        why: "To see who wants to buy.",
      };
  }
}

/** How long the success moment shows before the tap carries on (board: about 2 seconds). */
export const CARRY_ON_DELAY_MS = 2500;

/** The server actions the carry-on can use, handed down from the layout (features stay apart). */
export interface CarryOnActions {
  /** Accounts' connect: starts the platform's sign-in (redirects). */
  connect?: (formData: FormData) => Promise<void>;
  /** Reply rules: one kind's mode (approvals' updateAutonomyMode). */
  workerBee?: (
    prev: { error?: string; saved?: boolean },
    formData: FormData,
  ) => Promise<{ error?: string; saved?: boolean }>;
  /** Replies for the messages that waited while replies were out (approvals). */
  writeReplies?: () => Promise<{ count: number } | { error: string }>;
}
