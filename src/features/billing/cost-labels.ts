// Plain words for the Costs page: a message's status and what each AI call was for.

const STATUS_LABELS: Record<string, string> = {
  new: "New",
  classified: "Sorted",
  drafted: "Drafted",
  awaiting_approval: "Waiting for approval",
  sending: "Sending",
  sent: "Sent",
  rejected: "Rejected",
  ignored: "Ignored",
  escalated: "For you",
  paused: "Paused",
  failed: "Failed",
  handled: "Handled",
  awaiting_draft: "Sorted, not drafted yet",
};

const PURPOSE_LABELS: Record<string, string> = {
  classify: "Sort",
  embed: "Lookup",
  draft: "Draft",
  agent: "Agent",
  setup: "Setup",
};

const capitalize = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** A message status in plain words; unknown ones lose their underscores. */
export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? capitalize(status.replaceAll("_", " "));
}

/** What an AI call was for, in plain words. */
export function purposeLabel(purpose: string): string {
  return PURPOSE_LABELS[purpose] ?? capitalize(purpose.replaceAll("_", " "));
}
