import { describe, expect, it } from "vitest";
import {
  allSetLine,
  chatProgress,
  chatSavedOf,
  factsIntro,
  GREETING,
  kindAnswer,
  needYouLine,
  nextMissing,
  repliesQuestion,
  topicsAnswer,
  type ChatSaved,
} from "./chat";

const facts = { kindKnown: false, toSend: 3, writing: false, needYou: 1, finished: false };

describe("chatSavedOf", () => {
  it("keeps what parses and drops junk", () => {
    expect(chatSavedOf({ kind: "food", facts: "ok", mode: "auto" })).toEqual({
      kind: "food",
      facts: "ok",
      mode: "auto",
    });
    expect(chatSavedOf({ topics: ["refunds", "custom:cakes"] })).toEqual({
      topics: ["refunds", "custom:cakes"],
    });
    expect(chatSavedOf({ kind: "spaceship" })).toEqual({});
    expect(chatSavedOf(null)).toEqual({});
    expect(chatSavedOf("text")).toEqual({});
  });
});

describe("chatProgress", () => {
  it("asks in the replica's order: kind, facts, replies, need you, topics, reply choice", () => {
    expect(chatProgress({}, facts).open).toBe("kind");
    expect(chatProgress({ kind: "food" }, facts).open).toBe("facts");
    expect(chatProgress({ kind: "food", facts: "ok" }, facts).open).toBe("replies");
    expect(chatProgress({ kind: "food", facts: "ok", replies: "sent", sent: 2 }, facts).open).toBe(
      "needyou",
    );
    const upToTopics = { kind: "food", facts: "ok", replies: "sent", needyou: "done" } as const;
    expect(chatProgress(upToTopics, facts).open).toBe("topics");
    expect(chatProgress({ ...upToTopics, topics: ["refunds"] }, facts).open).toBe("mode");
  });

  it("doesn't ask the kind when it's known", () => {
    expect(chatProgress({}, { ...facts, kindKnown: true }).open).toBe("facts");
  });

  it("never skips ahead of an earlier question", () => {
    // A saved reply choice doesn't count while the kind is open again.
    expect(chatProgress({ facts: "ok", mode: "approve" }, facts).open).toBe("kind");
  });

  it("answers replies and need-you on its own when there's nothing to ask", () => {
    const empty = { ...facts, toSend: 0, needYou: 0 };
    expect(chatProgress({ kind: "food", facts: "ok" }, empty).open).toBe("topics");
    // Still writing: the replies question waits.
    expect(chatProgress({ kind: "food", facts: "ok" }, { ...empty, writing: true }).open).toBe(
      "replies",
    );
  });

  it("asks the topics for everyone, then the reply choice, which ends it once finished", () => {
    const all: ChatSaved = {
      kind: "food",
      facts: "ok",
      replies: "skipped",
      needyou: "done",
      topics: [],
    };
    // Saved but setup not finished (a reload in between): the choice is asked again.
    expect(chatProgress({ ...all, mode: "approve" }, facts).open).toBe("mode");
    expect(chatProgress({ ...all, mode: "auto" }, { ...facts, finished: true }).open).toBe("done");
  });

  it("treats setups finished before the topics question as answered", () => {
    const old = { kind: "food", facts: "ok", replies: "skipped", needyou: "done" } as const;
    expect(chatProgress({ ...old, mode: "approve" }, { ...facts, finished: true }).open).toBe(
      "done",
    );
    // The reply choice reopened: the topics come first again.
    expect(chatProgress(old, { ...facts, finished: true }).open).toBe("topics");
  });
});

describe("the facts Waggle couldn't find", () => {
  const base = { kind: "food", facts: "ok" } as const;

  it("asks what was missing at Looks good, one at a time, before the replies", () => {
    const saved: ChatSaved = { ...base, toAsk: ["hours", "contact"] };
    expect(chatProgress(saved, facts).open).toBe("missing");
    expect(nextMissing(saved.toAsk ?? [], saved.missing)).toBe("hours");
    const after = { ...saved, missing: { hours: "saved" } } as const;
    expect(nextMissing(after.toAsk ?? [], after.missing)).toBe("contact");
    const all = { ...saved, missing: { hours: "saved", contact: "skipped" } } as const;
    expect(nextMissing(all.toAsk ?? [], all.missing)).toBeNull();
    expect(chatProgress(all, facts).open).toBe("replies");
  });

  it("skips the question when nothing was missing, and never pulls a finished setup back", () => {
    expect(chatProgress({ ...base, toAsk: [] }, facts).open).toBe("replies");
    expect(chatProgress(base, facts).open).toBe("replies");
    const finished: ChatSaved = {
      ...base,
      toAsk: ["hours"],
      replies: "skipped",
      needyou: "done",
      topics: [],
      mode: "approve",
    };
    expect(chatProgress(finished, { ...facts, finished: true }).open).toBe("done");
  });

  it("keeps the saved answers (nothing cleared) and the first bubbles", () => {
    expect(
      chatSavedOf({
        ...base,
        toAsk: ["area"],
        missing: { area: "skipped" },
        labels: { facts: "Looks good" },
      }),
    ).toEqual({
      ...base,
      toAsk: ["area"],
      missing: { area: "skipped" },
      labels: { facts: "Looks good" },
    });
  });
});

describe("Waggle's words", () => {
  it("opens with the replica's greeting", () => {
    expect(GREETING).toBe("Hi! I’m Waggle, your assistant. I’ll answer your customers for you.");
  });

  it("says the owner's kind back", () => {
    expect(kindAnswer("food")).toBe("Café or restaurant");
    expect(kindAnswer("other", "dog grooming")).toBe("Something else: dog grooming");
    expect(kindAnswer("health")).toBe("Clinic or health");
  });

  it("leads into the facts", () => {
    expect(factsIntro("Instagram", true)).toBe(
      "I already wrote replies to your customers using what I found on your Instagram. Before any go out, is this right?",
    );
    expect(factsIntro("Instagram", false)).toContain("Here’s what I found on your Instagram.");
  });

  it("counts replies and who needs you", () => {
    expect(repliesQuestion(3)).toBe(
      "I wrote 3 replies, most important first. Nothing goes out until you send it.",
    );
    expect(repliesQuestion(1)).toBe("I wrote 1 reply. Nothing goes out until you send it.");
    expect(needYouLine(1)).toBe(
      "1 customer is still waiting. I couldn’t answer from what I know. Tell me the answer and I’ll write the reply.",
    );
    expect(needYouLine(2)).toContain("2 customers are still waiting.");
    expect(needYouLine(0)).toBeNull();
  });

  it("ends with what's ready", () => {
    expect(allSetLine(3)).toBe(
      "All set. 3 replies are ready for your OK in your inbox. Send them one by one, or all at once.",
    );
    expect(allSetLine(1)).toBe("All set. 1 reply is ready for your OK in your inbox.");
    expect(allSetLine(0)).toBe(
      "All set. New messages will show up in your inbox with a reply ready.",
    );
  });

  it("says the chosen topics back", () => {
    expect(topicsAnswer(["Refunds and complaints", "Allergies and ingredients"])).toBe(
      "Ask me first about: Refunds and complaints, Allergies and ingredients",
    );
  });
});
