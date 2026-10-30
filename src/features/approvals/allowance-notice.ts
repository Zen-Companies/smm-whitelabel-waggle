import type { AiSpend } from "@/lib/llm/spend";

/**
 * The owner's banner about the monthly AI allowance (T32), in plain words: what happens, not
 * dollars or models (docs/design.md principle 5). null while there's plenty left.
 */
export function allowanceNotice(spend: Pick<AiSpend, "level" | "resetsAt">): string | null {
  // The month that's running, as the owner reads it ("October").
  const month = new Date(spend.resetsAt.getTime() - 1).toLocaleDateString("en-US", {
    month: "long",
    timeZone: "UTC",
  });
  switch (spend.level) {
    case "reached":
      return `This month's AI allowance is used up. New messages are still sorted, but they come to you without a suggested reply until the end of ${month}.`;
    case "warn":
      return `You've used most of this month's AI allowance. Once it's used up, new messages come to you without a suggested reply until the end of ${month}.`;
    default:
      return null;
  }
}
