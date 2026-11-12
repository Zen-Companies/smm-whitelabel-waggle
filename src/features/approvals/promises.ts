// "What Waggle will never do" (T27). Each line is enforced in code; keep them in step.
export const PROMISES: { text: string; enforcedBy: string }[] = [
  {
    text: "Make up prices, dates or promises. It only uses your Business info.",
    enforcedBy: "draft prompt rule 1 + grounding check (features/drafting/grounding.ts)",
  },
  {
    text: "Confirm a booking or order. It says your team will confirm.",
    enforcedBy: "draft prompt rule 6 (features/drafting/prompts.ts)",
  },
  {
    text: "Reply to complaints or messages it isn't sure about. Those come to you.",
    enforcedBy: "policy() steps 3-4 (features/approvals/policy.ts)",
  },
  {
    text: "Ask for phone numbers or addresses in public comments.",
    enforcedBy: "draft prompt rule 3 + grounding check for contact details",
  },
  {
    text: "Reply to a DM after the platform's reply window (Instagram and Facebook 24 hours, TikTok 48 hours and 10 replies).",
    enforcedBy: "policy() step 5, checked again when sending (send-step.ts)",
  },
  {
    text: "Send anything while you've paused replies.",
    enforcedBy: "policy() + send step hold (T27)",
  },
];
