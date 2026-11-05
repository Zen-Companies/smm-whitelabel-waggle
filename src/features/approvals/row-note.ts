import type { InboxEntry } from "./inbox-data";
import { responseTime } from "./inbox-data";

/** The icon at the start of a row's third line (design.md §1 rule 4). */
export type RowTone = "lead" | "complaint" | "info" | "done" | "none";

export interface RowNote {
  tone: RowTone;
  /** A word in color before the text ("Lead", "Complaint"). */
  label?: string;
  text: string;
}

/**
 * Pure: a list row's third line, "what happens next", in plain words (design.md §1 rules 4, 9).
 */
export function rowNote(entry: InboxEntry & { status: string }): RowNote {
  const lead = entry.category === "lead";
  const platform = entry.platform === "facebook" ? "Facebook" : "Instagram";
  // T40: a comment hidden on its post, whoever hid it.
  if (entry.hiddenOnPlatformAt && (entry.status === "ignored" || entry.status === "handled")) {
    return { tone: "none", text: `Hidden on ${platform}` };
  }
  switch (entry.status) {
    case "awaiting_approval":
      return lead
        ? { tone: "lead", label: "Lead", text: "reply ready" }
        : { tone: "none", text: "Reply ready to send" };
    case "escalated":
      if (entry.category === "spam" && entry.kind === "comment") {
        return { tone: "none", text: "Looks like spam: hide it" };
      }
      if (entry.category === "complaint") {
        return { tone: "complaint", label: "Complaint", text: "for you to answer" };
      }
      if (entry.draft?.needsHuman) {
        return lead
          ? { tone: "lead", label: "Lead", text: "not in your business info" }
          : { tone: "info", text: "Not in your business info" };
      }
      return lead
        ? { tone: "lead", label: "Lead", text: "for you to answer" }
        : { tone: "none", text: "For you to answer" };
    case "failed":
      return { tone: "complaint", text: "Couldn't be sent" };
    case "sending":
      return { tone: "none", text: "Sending now" };
    case "sent": {
      const sentAt = entry.draft?.sentAt;
      const by = entry.draft && !entry.draft.decidedByOwner ? "Waggle" : "you";
      return {
        tone: "done",
        text: sentAt
          ? `Answered by ${by} in ${responseTime(entry.receivedAt, sentAt).replace(/(\d)([a-z])$/, "$1 $2")}`
          : `Answered by ${by}`,
      };
    }
    case "ignored":
      return { tone: "none", text: "Ignored: looked like spam" };
    case "handled":
      return { tone: "done", text: "Handled by you" };
    case "rejected":
      return { tone: "none", text: "You chose not to reply" };
    default:
      return { tone: "none", text: "Being sorted" };
  }
}
