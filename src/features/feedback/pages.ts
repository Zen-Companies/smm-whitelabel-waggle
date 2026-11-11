// Help & feedback (design v3 "Beta access and feedback"): what each page is called in the panel,
// its prompt, the types and their one open question. Pure, so it is unit tested.

export interface PageInfo {
  /** The section key sent with feedback (never the full URL: no ids, no query). */
  page: string;
  name: string;
  prompt: string;
}

const PAGES: Record<string, Omit<PageInfo, "page">> = {
  inbox: { name: "Inbox", prompt: "Anything slowing you down in the inbox?" },
  posts: { name: "Posts", prompt: "Anything unclear about writing or scheduling posts?" },
  analytics: { name: "Analytics", prompt: "Anything unclear or missing here?" },
  leads: { name: "Leads", prompt: "Anything you'd want to see about your leads?" },
  "knowledge-base": {
    name: "Business info",
    prompt: "Anything hard about keeping your info up to date?",
  },
  lab: { name: "Lab", prompt: "Anything confusing when trying messages?" },
  settings: { name: "Settings", prompt: "Anything hard to find or set up?" },
  welcome: { name: "Getting started", prompt: "Anything unclear about getting started?" },
  orgs: { name: "Your organization", prompt: "Anything unclear about your team or organization?" },
  admin: { name: "Staff pages", prompt: "Anything to fix on this staff page?" },
};

export function pageInfo(pathname: string): PageInfo {
  const section = pathname.split(/[?#]/)[0].split("/")[1] || "inbox";
  const known = PAGES[section];
  return known
    ? { page: section, ...known }
    : { page: "other", name: "Waggle", prompt: "Anything we should know?" };
}

export const FEEDBACK_TYPES = ["idea", "problem", "question", "love"] as const;
export type FeedbackType = (typeof FEEDBACK_TYPES)[number];

export const TYPE_LABEL: Record<FeedbackType, string> = {
  idea: "Idea",
  problem: "Something's wrong",
  question: "Question",
  love: "Love it",
};

/** Each type's one open question (words over scores); a question needs none. */
export const FOLLOW_UP: Record<FeedbackType, string | null> = {
  idea: "What would that let you do?",
  problem: "What did you expect instead?",
  question: null,
  love: "What made it work for you?",
};

export const MESSAGE_MAX = 4000;
export const FOLLOW_UP_MAX = 2000;
export const REASON_MAX = 500;

/** Nudges after a first: which page each belongs to and what it says. */
export const NUDGES = {
  first_reply: {
    page: "inbox",
    title: "You approved your first reply",
    line: "How did that go? Anything you'd change?",
  },
  first_analytics: {
    page: "analytics",
    title: "First look at Analytics",
    line: "Anything missing or unclear?",
  },
  first_connect: {
    page: "settings",
    title: "Account connected",
    line: "Was that easy? Tell us if anything got in the way.",
  },
  first_post: {
    page: "posts",
    title: "First post scheduled",
    line: "How was writing and scheduling it?",
  },
} as const;
export type NudgeKey = keyof typeof NUDGES;
