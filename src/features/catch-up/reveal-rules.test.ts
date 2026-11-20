import { describe, expect, it } from "vitest";
import {
  catchUpAccountKeys,
  catchUpPhase,
  daysBetween,
  DRAFT_STALL_MS,
  isGiveawayPost,
  isTagOnly,
  MAX_COMMENTS_READ,
  MAX_POSTS_READ,
  needsReply,
  pickRevealDrafts,
  postLabel,
  questionTopic,
  quoteText,
  readBudget,
  readCachedTopQuestions,
  readyToPick,
  safeToQuote,
  SORT_STALL_MS,
  topQuestionsOutputSchema,
  toTopQuestions,
  pickRedrafts,
  priceItemsFrom,
  REDRAFT_MAX,
  summarizeReveal,
  underSortCap,
  type PulledItem,
  type RevealItem,
} from "./reveal-rules";

const NOW = new Date("2026-11-20T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

describe("needsReply", () => {
  it.each([
    "😍",
    "🔥🔥🔥",
    "❤️ ❤️",
    "!!!",
    "",
    "   ",
    "@anna",
    "@anna @ben.c @carla_d",
    "@anna 😍",
    "love this!",
    "Love it",
    "LOOOOVE THIS 😍😍",
    "thank you",
    "Thank you so much!",
    "thanks po",
    "so good",
    "sooo yummy",
    "Looks amazing 🔥",
    "the best!!",
    "ang ganda!",
    "sarap naman",
    "wow",
    "congrats guys",
    "@anna love this",
    "gracias",
  ])("%j doesn't need a reply", (text) => {
    expect(needsReply(text)).toBe(false);
  });

  it.each([
    "How much is it?",
    "how much",
    "magkano po",
    "Are you open on Sunday",
    "love this! do you deliver",
    "I want to book for 4 on Friday",
    "Love it?",
    "is this gluten free",
    "@anna we should go here",
    "price pls",
    "My order never arrived",
    "you're so good but the coffee was cold today",
    "love love love love love this so so much thank you",
    "?",
    "Where are you located",
    "available pa?",
  ])("%j needs a reply", (text) => {
    expect(needsReply(text)).toBe(true);
  });
});

describe("friend tags and giveaways", () => {
  it("a tag-only comment has only @mentions", () => {
    expect(isTagOnly("@anna @ben")).toBe(true);
    expect(isTagOnly("@anna 🎉")).toBe(true);
    expect(isTagOnly("@anna look")).toBe(false);
    expect(isTagOnly("😍")).toBe(false);
    expect(isTagOnly("")).toBe(false);
  });

  it("a post where most comments only tag friends is a giveaway", () => {
    const tags = Array.from({ length: 8 }, (_, i) => `@friend${i} @pal${i}`);
    const real = ["how much?", "love this", "open sunday?"];
    expect(isGiveawayPost([...tags, ...real])).toBe(true);
  });

  it("half or fewer tags, or too few comments, is not a giveaway", () => {
    const tags = Array.from({ length: 5 }, (_, i) => `@friend${i}`);
    const real = Array.from({ length: 5 }, (_, i) => `question ${i}?`);
    expect(isGiveawayPost([...tags, ...real])).toBe(false);
    expect(isGiveawayPost(["@a", "@b", "@c"])).toBe(false);
    expect(isGiveawayPost([])).toBe(false);
  });
});

describe("caps", () => {
  it("reads at most 100 posts and 1,000 comments", () => {
    expect(readBudget({ postsRead: 0, commentsRead: 0 })).toEqual({
      morePosts: true,
      commentsLeft: MAX_COMMENTS_READ,
    });
    expect(readBudget({ postsRead: MAX_POSTS_READ, commentsRead: 10 }).morePosts).toBe(false);
    expect(readBudget({ postsRead: 3, commentsRead: MAX_COMMENTS_READ })).toEqual({
      morePosts: false,
      commentsLeft: 0,
    });
    expect(readBudget({ postsRead: 3, commentsRead: 1200 }).commentsLeft).toBe(0);
    expect(readBudget({ postsRead: 3, commentsRead: 990 }).commentsLeft).toBe(10);
  });

  it("sorts the first 500 found (newest post first), counts the rest", () => {
    expect(underSortCap(0, 500)).toBe(true);
    expect(underSortCap(499, 500)).toBe(true);
    expect(underSortCap(500, 500)).toBe(false);
  });
});

describe("safeToQuote", () => {
  it.each([
    "How much is the winter box?",
    "Are you open on the 24th?",
    "Do you have oat milk",
    "Can I book a table for 6",
  ])("%j can be quoted", (text) => {
    expect(safeToQuote(text)).toBe(true);
  });

  it.each([
    "call me on 0412 345 678",
    "my number is +63 917-123-4567",
    "(02) 8123 4567 please",
    "email me at anna@example.com",
    "is it safe when pregnant?",
    "I have a nut allergy, is it ok?",
    "my son is diabetic, sugar free options?",
    "after my surgery can I come in",
    "I'm on medication, can I drink this?",
  ])("%j is never quoted", (text) => {
    expect(safeToQuote(text)).toBe(false);
  });
});

describe("quoting", () => {
  it("keeps short text as one line", () => {
    expect(quoteText("How  much\nis it?")).toBe("How much is it?");
  });
  it("cuts long text at a word, about 120 characters", () => {
    const long = `${"word ".repeat(40)}end`;
    const q = quoteText(long);
    expect(q.length).toBeLessThanOrEqual(120);
    expect(q.endsWith("…")).toBe(true);
    expect(q).not.toMatch(/wor…$/);
  });
  it("labels a post by its caption's start", () => {
    expect(postLabel("Winter menu is here! Come try the new boxes this weekend")).toBe(
      "Winter menu is here! Come try the new…",
    );
    expect(postLabel("Hello")).toBe("Hello");
    expect(postLabel("  ")).toBeNull();
    expect(postLabel(null)).toBeNull();
  });
  it("counts whole days waiting", () => {
    expect(daysBetween(hoursAgo(50), NOW)).toBe(2);
    expect(daysBetween(hoursAgo(1), NOW)).toBe(0);
  });
});

describe("questionTopic", () => {
  it.each([
    ["How much is the winter box?", "price"],
    ["magkano po?", "price"],
    ["what are your prices", "price"],
    ["is it $20?", "price"],
    ["Can I book for Friday?", "booking"],
    ["any slots left on Sat?", "booking"],
    ["do you take reservations", "booking"],
    ["What time do you open?", "hours"],
    ["are you open on Sunday", "hours"],
    ["Do you have oat milk?", "other"],
  ] as const)("%j is about %s", (text, topic) => {
    expect(questionTopic(text)).toBe(topic);
  });
});

describe("pickRevealDrafts", () => {
  const item = (over: Partial<PulledItem> & { id: string }): PulledItem => ({
    kind: "comment",
    category: "faq",
    status: "awaiting_draft",
    receivedAt: hoursAgo(5),
    draftRequested: false,
    ...over,
  });

  it("drafts questions and leads, newest first, up to the cap", () => {
    const items = [
      item({ id: "old", receivedAt: hoursAgo(300) }),
      item({ id: "new", receivedAt: hoursAgo(1) }),
      item({ id: "lead", category: "lead", receivedAt: hoursAgo(2) }),
      item({ id: "mid", receivedAt: hoursAgo(100) }),
    ];
    expect(pickRevealDrafts(items, NOW, 3)).toEqual(["new", "lead", "mid"]);
  });

  it("never drafts complaints, spam, unclear, or anything not waiting for a draft", () => {
    const items = [
      item({ id: "c", category: "complaint" }),
      item({ id: "s", category: "spam" }),
      item({ id: "u", category: "unclear" }),
      item({ id: "n", category: null }),
      item({ id: "esc", status: "escalated" }),
      item({ id: "ok" }),
    ];
    expect(pickRevealDrafts(items, NOW, 20)).toEqual(["ok"]);
  });

  it("never drafts a DM whose 24-hour window is closed or about to close", () => {
    const items = [
      item({ id: "fresh", kind: "dm", receivedAt: hoursAgo(3) }),
      item({ id: "closing", kind: "dm", receivedAt: hoursAgo(23.5) }),
      item({ id: "closed", kind: "dm", receivedAt: hoursAgo(30) }),
    ];
    expect(pickRevealDrafts(items, NOW, 20)).toEqual(["fresh"]);
  });

  it("drafts already asked for (picked or opened) count toward the cap", () => {
    const items = [
      item({ id: "a", draftRequested: true, status: "awaiting_approval" }),
      item({ id: "b", draftRequested: true, status: "classified" }),
      item({ id: "c" }),
      item({ id: "d" }),
    ];
    expect(pickRevealDrafts(items, NOW, 3)).toEqual(["c"]);
    expect(pickRevealDrafts(items, NOW, 2)).toEqual([]);
  });
});

describe("phase", () => {
  const base = { stage: "done", sortedAt: null, draftsPending: 0, now: NOW };
  it("reads, sorts, drafts, then is ready", () => {
    expect(catchUpPhase({ ...base, stage: "comments" })).toBe("reading");
    expect(catchUpPhase({ ...base, stage: "dms" })).toBe("reading");
    expect(catchUpPhase({ ...base, stage: "dms_again" })).toBe("sorting");
    expect(catchUpPhase(base)).toBe("sorting");
    expect(catchUpPhase({ ...base, sortedAt: hoursAgo(0), draftsPending: 3 })).toBe("drafting");
    expect(catchUpPhase({ ...base, sortedAt: hoursAgo(0) })).toBe("ready");
  });
  it("a stalled drafting step doesn't hold the reveal forever", () => {
    const sortedAt = new Date(NOW.getTime() - DRAFT_STALL_MS).toISOString();
    expect(catchUpPhase({ ...base, sortedAt, draftsPending: 3 })).toBe("ready");
  });
  it("drafts are picked when nothing is left to sort, or sorting stalled", () => {
    expect(readyToPick({ unsorted: 0, readAt: null, now: NOW })).toBe(true);
    expect(readyToPick({ unsorted: 4, readAt: NOW, now: NOW })).toBe(false);
    expect(
      readyToPick({ unsorted: 4, readAt: new Date(NOW.getTime() - SORT_STALL_MS), now: NOW }),
    ).toBe(true);
    expect(readyToPick({ unsorted: 4, readAt: null, now: NOW })).toBe(false);
  });
});

describe("top questions", () => {
  it("validates the AI's output", () => {
    expect(topQuestionsOutputSchema.safeParse({ questions: [] }).success).toBe(true);
    expect(
      topQuestionsOutputSchema.safeParse({ questions: [{ question: "", messages: [] }] }).success,
    ).toBe(false);
    expect(
      topQuestionsOutputSchema.safeParse({ questions: [{ question: "x", messages: [-1] }] })
        .success,
    ).toBe(false);
    expect(topQuestionsOutputSchema.safeParse({ nope: true }).success).toBe(false);
  });

  it("counts cited messages once, groups items, and never guesses an item", () => {
    const output = topQuestionsOutputSchema.parse({
      questions: [
        {
          question: "How much is it?",
          messages: [0, 1, 2, 3, 3, 99],
          about: [
            { message: 0, item: "Winter menu box" },
            { message: 1, item: "winter menu box" },
            { message: 2, item: "Oat latte" },
            { message: 3, item: null },
          ],
        },
        { question: "What time do you open?", messages: [4, 5, 0] },
        { question: "Nothing real", messages: [77] },
      ],
    });
    expect(toTopQuestions(output, 6)).toEqual([
      {
        question: "How much is it?",
        count: 4,
        items: [
          { item: "Winter menu box", count: 2 },
          { item: "Oat latte", count: 1 },
        ],
        unsure: 1,
      },
      { question: "What time do you open?", count: 2, items: [], unsure: 0 },
    ]);
  });

  it("reads a malformed cache as none", () => {
    expect(readCachedTopQuestions(null)).toEqual([]);
    expect(readCachedTopQuestions([{ question: 1 }])).toEqual([]);
    const ok = [{ question: "q", count: 2, items: [], unsure: 0 }];
    expect(readCachedTopQuestions(ok)).toEqual(ok);
  });
});

describe("summarizeReveal", () => {
  const it0 = (over: Partial<RevealItem> & { id: string }): RevealItem => ({
    kind: "comment",
    category: "faq",
    status: "awaiting_draft",
    text: "Do you have oat milk?",
    authorName: "mika",
    receivedAt: hoursAgo(10),
    postCaption: "Winter menu is here",
    ...over,
  });

  it("counts questions, leads and complaints that wait, with the breakdown", () => {
    const r = summarizeReveal(
      [
        it0({ id: "p", text: "how much is the box?" }),
        it0({ id: "b", category: "lead", text: "can I book for 4?" }),
        it0({ id: "h", text: "what time do you open" }),
        it0({ id: "o" }),
        it0({ id: "c", category: "complaint", text: "cold coffee" }),
        it0({ id: "s", category: "spam" }),
        it0({ id: "u", category: "unclear" }),
        it0({ id: "done", status: "sent" }),
        it0({ id: "handled", category: "complaint", status: "handled" }),
      ],
      NOW,
    );
    expect(r.waiting).toBe(5);
    expect(r.breakdown).toEqual({
      price: 1,
      booking: 1,
      hours: 1,
      otherQuestions: 1,
      complaints: 1,
    });
    expect(r.spam).toBe(1);
  });

  it("quotes the longest-waiting question comment, never a complaint, DM or private detail", () => {
    const r = summarizeReveal(
      [
        it0({ id: "complaint", category: "complaint", receivedAt: hoursAgo(900) }),
        it0({ id: "dm", kind: "dm", receivedAt: hoursAgo(800) }),
        it0({ id: "phone", text: "call me 0412 345 678?", receivedAt: hoursAgo(700) }),
        it0({ id: "noname", authorName: null, receivedAt: hoursAgo(650) }),
        it0({ id: "answered", status: "sent", receivedAt: hoursAgo(640) }),
        it0({ id: "lead", category: "lead", receivedAt: hoursAgo(630) }),
        it0({ id: "q", text: "Is the winter box vegan?", receivedAt: hoursAgo(100) }),
        it0({ id: "newer", receivedAt: hoursAgo(5) }),
      ],
      NOW,
    );
    expect(r.longestWait).toEqual({
      itemId: "q",
      handle: "@mika",
      text: "Is the winter box vegan?",
      daysWaiting: 4,
      postLabel: "Winter menu is here",
    });
  });

  it("lists DMs still inside the 24-hour window, soonest to expire first", () => {
    const r = summarizeReveal(
      [
        it0({ id: "late", kind: "dm", receivedAt: hoursAgo(2) }),
        it0({ id: "soon", kind: "dm", receivedAt: hoursAgo(20), authorName: "Lena Cruz" }),
        it0({ id: "gone", kind: "dm", receivedAt: hoursAgo(30) }),
        it0({ id: "spam", kind: "dm", category: "spam", receivedAt: hoursAgo(1) }),
      ],
      NOW,
    );
    expect(r.expiringToday.map((e) => e.itemId)).toEqual(["soon", "late"]);
    expect(r.expiringToday[0]).toMatchObject({
      handle: "Lena Cruz",
      expiresAt: new Date(NOW.getTime() + 4 * 3_600_000).toISOString(),
    });
  });

  it("counts drafts ready to approve", () => {
    const r = summarizeReveal(
      [it0({ id: "a", status: "awaiting_approval" }), it0({ id: "b" })],
      NOW,
    );
    expect(r.draftsReady).toBe(1);
  });

  it("price items come from the price questions of the top questions", () => {
    expect(
      priceItemsFrom([
        {
          question: "How much is it?",
          count: 5,
          items: [
            { item: "Winter box", count: 2 },
            { item: "Oat latte", count: 1 },
          ],
          unsure: 2,
        },
        {
          question: "What is the price?",
          count: 2,
          items: [{ item: "winter box", count: 2 }],
          unsure: 0,
        },
        {
          question: "Are you open Sunday?",
          count: 3,
          items: [{ item: "Brunch", count: 3 }],
          unsure: 0,
        },
      ]),
    ).toEqual([
      { item: "Winter box", count: 4 },
      { item: "Oat latte", count: 1 },
    ]);
  });
});

describe("pickRedrafts", () => {
  const d = (id: string, over: { kb?: string[]; needsHuman?: boolean; h?: number } = {}) => ({
    id,
    itemId: `item-${id}`,
    kbEntryIds: over.kb ?? [],
    needsHuman: over.needsHuman ?? false,
    createdAt: hoursAgo(over.h ?? 1),
  });

  it("rewrites drafts that used the changed answer, and drafts that had none to go on", () => {
    const drafts = [
      d("used", { kb: ["k1", "k2"], h: 3 }),
      d("other", { kb: ["k9"] }),
      d("human", { needsHuman: true, h: 2 }),
    ];
    expect(pickRedrafts(drafts, "k1").map((r) => r.id)).toEqual(["human", "used"]);
  });

  it("a new answer only rewrites the drafts that needed a human", () => {
    expect(
      pickRedrafts([d("used", { kb: ["k1"] }), d("human", { needsHuman: true })], null),
    ).toEqual([{ id: "human", itemId: "item-human" }]);
  });

  it("is bounded", () => {
    const many = Array.from({ length: 40 }, (_, i) => d(`h${i}`, { needsHuman: true, h: i }));
    const picked = pickRedrafts(many, null);
    expect(picked).toHaveLength(REDRAFT_MAX);
    expect(picked[0].id).toBe("h0");
  });
});

describe("catchUpAccountKeys", () => {
  it("keys on the platform and handle, and on Zernio's account id", () => {
    expect(
      catchUpAccountKeys({
        platform: "instagram",
        username: "@HarbourBean",
        zernioAccountId: "z1",
      }),
    ).toEqual({
      primary: "instagram:@harbourbean",
      all: ["instagram:@harbourbean", "instagram:zernio:z1"],
    });
  });
  it("without a handle, on the account id alone", () => {
    expect(
      catchUpAccountKeys({ platform: "facebook", username: " ", zernioAccountId: "z2" }),
    ).toEqual({ primary: "facebook:zernio:z2", all: ["facebook:zernio:z2"] });
  });
});
