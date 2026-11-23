import { describe, expect, it } from "vitest";
import {
  addEntries,
  askAgain,
  chatLogOf,
  closeAsks,
  entriesAt,
  kindChangedLine,
  LOG_MAX,
  missingFields,
  missingNeedsAsking,
  pendingAsk,
  type LogEntry,
} from "./chat-log";

const now = new Date("2026-11-23T12:00:00Z");

describe("chatLogOf (restore)", () => {
  const log = {
    entries: [
      { id: 1, at: "facts", who: "me", text: "Fix hours" },
      { id: 2, at: "facts", who: "waggle", text: "What should your hours say? Just tell me." },
      { id: 3, at: "facts", who: "me", text: "we open 8 to 6 every day" },
      {
        id: 4,
        at: "facts",
        who: "turn",
        typed: "we open 8 to 6 every day",
        turn: {
          kind: "propose",
          field: "hours",
          value: "Every day 8am–6pm",
          entryId: null,
          before: null,
        },
      },
      { id: 5, at: "replies", who: "ask", what: "kind", done: true },
      { id: 6, at: "replies", who: "feedback", text: "add my calendar", sent: true },
    ],
    need: { "item-1": { kind: "later", author: "Sam" } },
  };

  it("brings the whole thread back as saved", () => {
    expect(chatLogOf(log, { doneAt: null, now })).toEqual(log);
  });

  it("brings the replica's editors back (address, contact, answer, the hours answer)", () => {
    const editors = {
      entries: [
        { id: 1, at: "facts", who: "me", text: "Change address" },
        {
          id: 2,
          at: "facts",
          who: "turn",
          typed: "",
          turn: { kind: "address", value: "12 Mabini St", entryId: null, unread: false },
        },
        {
          id: 3,
          at: "facts",
          who: "turn",
          typed: "",
          turn: { kind: "contact", value: "", entryId: null, unread: true },
        },
        {
          id: 4,
          at: "facts",
          who: "turn",
          typed: "",
          turn: { kind: "answer", entryId: "a1", value: null, which: true },
        },
        {
          id: 5,
          at: "facts",
          who: "turn",
          typed: "",
          turn: { kind: "sync", entryId: "a2", label: "When are you open?", value: "We’re open…" },
        },
      ],
      need: {},
    };
    expect(chatLogOf(editors, { doneAt: null, now })).toEqual(editors);
  });

  it("is empty for junk, and once setup finished more than 30 days ago", () => {
    expect(chatLogOf(null, { doneAt: null, now }).entries).toEqual([]);
    expect(chatLogOf({ entries: [{ who: "robot" }] }, { doneAt: null, now }).entries).toEqual([]);
    expect(chatLogOf(log, { doneAt: "2026-11-01T12:00:00Z", now }).entries).toHaveLength(6);
    expect(chatLogOf(log, { doneAt: "2026-10-20T12:00:00Z", now })).toEqual({
      entries: [],
      need: {},
    });
  });
});

describe("changing an earlier answer (nothing cut)", () => {
  const thread: LogEntry[] = [
    { id: 1, at: "facts", who: "me", text: "Fix hours" },
    { id: 2, at: "facts", who: "waggle", text: "What should your hours say? Just tell me." },
  ];

  it("appends the question again at the bottom, under the question open now", () => {
    const asked = askAgain(thread, "kind", "replies");
    expect(asked.slice(0, 2)).toEqual(thread);
    expect(asked[2]).toEqual({ id: 3, at: "replies", who: "ask", what: "kind", done: false });
    expect(pendingAsk(asked)?.what).toBe("kind");
    expect(entriesAt(asked, "facts")).toEqual(thread);
    expect(entriesAt(asked, "replies")).toHaveLength(1);
  });

  it("closes with the owner's answer and goes on from where they were", () => {
    const asked = askAgain(thread, "kind", "replies");
    const answered = addEntries(
      closeAsks(asked),
      [
        { who: "me", text: "Shop" },
        { who: "waggle", text: kindChangedLine("Shop", []) },
      ],
      "replies",
    );
    expect(pendingAsk(answered)).toBeUndefined();
    expect(answered.map((e) => e.who)).toEqual(["me", "waggle", "ask", "me", "waggle"]);
    expect(answered.map((e) => e.id)).toEqual([1, 2, 3, 4, 5]);
  });

  it("keeps one open at a time: a new change replaces the open one", () => {
    const twice = askAgain(askAgain(thread, "kind", "topics"), "mode", "topics");
    expect(twice.filter((e) => e.who === "ask" && !e.done)).toHaveLength(1);
    expect(pendingAsk(twice)?.what).toBe("mode");
  });

  it("drops the oldest past the cap", () => {
    let l: LogEntry[] = [];
    for (let i = 0; i < LOG_MAX + 5; i += 1)
      l = addEntries(l, [{ who: "me", text: `${i}` }], "facts");
    expect(l).toHaveLength(LOG_MAX);
    expect(l[0]).toMatchObject({ text: "5" });
  });

  it("says what a new kind adds to check first", () => {
    expect(kindChangedLine("Clinic or health", ["Medical questions"])).toBe(
      "Got it, Clinic or health. I’ve updated your business. I’ll also always check with you first about: Medical questions.",
    );
    expect(kindChangedLine("Shop", [])).toBe("Got it, Shop. I’ve updated your business.");
  });
});

describe("missing facts", () => {
  it("lists the card's empty lines in its order (answers aren't asked)", () => {
    expect(
      missingFields([
        { field: "hours", value: null },
        { field: "address", value: "1 High St" },
        { field: "contact", value: null },
        { field: "answer", value: null },
        { field: "hours", value: null },
      ]),
    ).toEqual(["hours", "contact"]);
  });

  it("says the question once, and again after a change in between", () => {
    expect(missingNeedsAsking([], "hours")).toBe(true);
    const asked = addEntries([], [{ who: "missing", field: "hours" }], "missing");
    expect(missingNeedsAsking(asked, "hours")).toBe(false);
    expect(missingNeedsAsking(asked, "contact")).toBe(true);
    const typed = addEntries(asked, [{ who: "me", text: "9 to 5" }], "missing");
    expect(missingNeedsAsking(typed, "hours")).toBe(false);
    const changed = addEntries(closeAsks(askAgain(typed, "kind", "missing")), [], "missing");
    expect(missingNeedsAsking(changed, "hours")).toBe(true);
  });
});
