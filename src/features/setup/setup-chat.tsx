"use client";

import { Lock, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { BeeBody } from "@/components/app/bee";
import { BeeDance, BeeFliesItOut, BeeHandsYouSend } from "@/components/app/bee-setup";
import { StateMark } from "@/components/app/state-mark";
import { ownerReplyAction } from "@/features/approvals/actions";
import { WELCOME_HREF } from "@/features/billing/client";
import {
  CUSTOM_LENGTH_MAX,
  CUSTOM_MAX,
  customLabel,
  customTopic,
  isCustomTopic,
} from "@/lib/ask-first";
import {
  answerWaitingMessage,
  finishSetup,
  sendSetupReplies,
  skipWaitingMessages,
} from "./actions";
import {
  allSetLine,
  chatProgress,
  factsIntro,
  GREETING,
  kindAnswer,
  needYouLine,
  nextMissing,
  repliesQuestion,
  topicsAnswer,
  type ChatSaved,
  type ChatStep,
} from "./chat";
import {
  askMeInstead,
  saveChatAnswer,
  saveChatFact,
  saveChatHours,
  saveChatLog,
  typeToWaggle,
  type ChatAnswer,
} from "./chat-actions";
import {
  BOX_REST_MS,
  FIELD_WORD,
  TYPED_MAX,
  turnLine,
  unusable,
  UNUSABLE_IN_A_ROW,
  type FactField,
  type KnownFact,
  type TypedTurn,
} from "./chat-fields";
import { anythingElse, hoursAnswerOf, savedBubble } from "./chat-editors";
import { formatHours, openDaysFromText, weekOf, withNewHours, type OpenDay } from "./chat-hours";
import {
  addEntries,
  askAgain,
  BACK_LINE,
  closeAsks,
  entriesAt,
  missingFields,
  missingNeedsAsking,
  MISSING_INTRO,
  MISSING_QUESTION,
  pendingAsk,
  type Anchor,
  type AskWhat,
  type ChatLog,
  type LogEntry,
  type NeedKind,
  type NewEntry,
} from "./chat-log";
import {
  BeeSmall,
  ChatHeader,
  Chips,
  Divider,
  EditReply,
  FactLine,
  FeedbackCard,
  Mine,
  ReplyRow,
  Tick,
  Typing,
  TypeBox,
  Waggle,
  type Chip,
} from "./chat-parts";
import { plural } from "./copy";
import { AddressCard, AnswerCard, AnswerList, ContactCard, SyncCard } from "./fix-editors";
import { HoursCard } from "./hours-card";
import type { WaitingMessage } from "./setup-data";
import { BUSINESS_KINDS, CUSTOM_KIND_MAX } from "./starter";
import type { BatchReply } from "./topics";
import { useHoldWayOut } from "./way-out";

// Step 3 is a conversation with Waggle (boards "Step 3 is a conversation with Waggle" and
// "Replica update", approved 23 Nov). One thread, top to bottom, our cards in the replica's fixed
// order (chat.ts): hello, the kind (only when unknown), the facts found, the facts Waggle couldn't
// find (one at a time), what customers wanted, the replies Waggle wrote (Send with 8 s Undo), the
// customers who need the owner, what to always check first, how replies go out; then the bee
// dances. Each answer is saved when tapped. Nothing is ever cut (user feedback, 23 Nov): changing
// an earlier answer asks again at the bottom, and the thread goes on from where the owner was.
// Everything said besides the fixed questions is the thread's log (chat-log.ts), saved
// server-side as it grows, so leaving and coming back restores it. The typing box is the one place
// the owner types to Waggle: the server stops secrets, the AI only picks an action, and every
// change shows a Save / Not quite card first.

/** Undo after Send, before anything leaves (design.md §5). */
const UNDO_MS = 8_000;
const WRITING_POLL_MS = 5_000;
const FINISH_FORM = "setup-chat-finish";
/** The facts card's lines when the profile gives none (the kind sits on the Business line). */
const FACT_ROWS: { field: FactField; label: string }[] = [
  { field: "hours", label: "Hours" },
  { field: "address", label: "Address" },
  { field: "contact", label: "Contact" },
];

export interface SetupChatProps {
  firstName: string;
  brandName: string;
  tenantId: string;
  platformWord: string;
  saved: ChatSaved;
  /** Everything said besides the fixed questions, as saved (restored on coming back). */
  log: ChatLog;
  /** The kind saved, else the profile's guess. */
  kind: string | null;
  /** "Something else": what was typed. */
  kindWords: string;
  facts: {
    field: FactField;
    label: string;
    entryId: string | null;
    value: string | null;
    from: string | null;
  }[];
  known: KnownFact[];
  answers: number;
  replies: BatchReply[];
  unchecked: Record<string, string[]>;
  writing: { done: number; of: number };
  outOfReplies: boolean;
  readBefore: string | null;
  waiting: WaitingMessage[];
  autoAllowed: boolean;
  topics: { id: string; label: string; on: boolean; locked: boolean }[];
  custom: string[];
  suggested: string[];
  urgent: string[];
  /** "What they wanted" (moved here from step 2); muted is "Not about your business". */
  wanted: { label: string; count: number; muted?: boolean }[];
  /** People who wanted to buy or order and got no answer. */
  buyers: number;
  finished: boolean;
  canSend: boolean;
}

type NeedOutcome = { kind: NeedKind };

/** The turns that are editors (while one is the newest, the chips and the box wait). */
const EDITOR_TURNS = new Set<TypedTurn["kind"]>(["hours", "address", "contact", "answer", "sync"]);

function editorLiveNow(log: readonly LogEntry[], asking: { what: AskWhat } | undefined): boolean {
  const last = log[log.length - 1];
  return (
    last?.who === "turn" && EDITOR_TURNS.has(last.turn.kind) && (!asking || asking.what === "facts")
  );
}

const NEED_LABEL: Record<NeedKind, string> = {
  reply: "Saved to your business info. The reply waits in your Inbox.",
  queued: "Saved. I’m writing the reply; it’ll be in your Inbox in a minute.",
  still: "Saved. I still need more to go on, so it stays in your Inbox.",
  sent: "Sent.",
  later: "Okay, it stays in your inbox.",
};

const BTN_LIGHT =
  "border-line bg-surface hover:border-honey inline-flex min-h-10 items-center justify-center rounded-xl border px-3.5 text-sm font-semibold";
const BTN_PRIMARY =
  "bg-honey hover:bg-honey-hover inline-flex min-h-10 items-center justify-center rounded-xl px-3.5 text-sm font-semibold text-[#17140F] disabled:opacity-60";

/** An entry within what the saved thread takes (long facts and labels are cut, never refused). */
function clipEntry(e: NewEntry): NewEntry {
  const cut = (v: string, n: number) => (v.length > n ? `${v.slice(0, n - 1)}…` : v);
  if (e.who === "me" || e.who === "waggle") return { ...e, text: cut(e.text, 1000) };
  if (e.who === "which") {
    return { ...e, options: e.options.map((o) => ({ ...o, label: cut(o.label, 300), value: "" })) };
  }
  if (e.who === "turn" && e.turn.kind === "propose" && e.turn.before) {
    return { ...e, turn: { ...e.turn, before: cut(e.turn.before, 4000) } };
  }
  return e;
}

/** The topics' starting choices: what the thread saved, else the kind's defaults. */
function topicChoices(
  p: Pick<SetupChatProps, "topics" | "suggested" | "custom">,
  savedTopics: string[] | null | undefined,
): { on: Set<string>; custom: string[]; suggestOn: Set<string> } {
  return {
    on: new Set(
      p.topics
        .filter((t) => !t.locked && (savedTopics ? savedTopics.includes(t.id) : t.on))
        .map((t) => t.id),
    ),
    custom: savedTopics
      ? savedTopics.filter((t) => isCustomTopic(t) && !p.suggested.includes(t))
      : p.custom,
    suggestOn: new Set(
      savedTopics
        ? p.suggested.filter((s) => savedTopics.includes(s))
        : p.suggested
            .filter((s) => !p.custom.includes(s))
            .slice(0, Math.max(0, CUSTOM_MAX - p.custom.length)),
    ),
  };
}

export function SetupChat(p: SetupChatProps) {
  const router = useRouter();
  const [saved, setSaved] = useState<ChatSaved>(p.saved);
  const [log, setLog] = useState<LogEntry[]>(p.log.entries);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [otherWords, setOtherWords] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [target, setTarget] = useState<{ field: FactField; id: string | null } | null>(null);
  const [misses, setMisses] = useState(0);
  const [resting, setResting] = useState(false);
  const boxRef = useRef<HTMLInputElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  // At (or near) the newest turn: new turns scroll into view. Scrolled up: the place is kept.
  const atEnd = useRef(true);
  const scrolledOnce = useRef(false);
  const lastTop = useRef(0);
  /** Near the bottom: following. Moved up (by the owner; our scrolls only go down): not. */
  const onThreadScroll = () => {
    const el = threadRef.current;
    if (!el) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 48) atEnd.current = true;
    else if (el.scrollTop < lastTop.current) atEnd.current = false;
    lastTop.current = el.scrollTop;
  };

  // Replies: ticks, edits, and the Undo seconds.
  const [unticked, setUnticked] = useState<Set<string>>(new Set());
  const [sentHere, setSentHere] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<string | null>(null);
  const [queued, setQueued] = useState<{ pairs: string[]; again: boolean } | null>(null);
  const [sending, startSending] = useTransition();
  const unsent = useRef<string[] | null>(null);
  useHoldWayOut(!!queued);

  // Need you: what happened to each (saved with the thread: ids, names and outcomes only).
  const [need, setNeed] = useState<ChatLog["need"]>(p.log.need);
  const [needText, setNeedText] = useState<Record<string, string>>({});

  // The thread's history is saved server-side as it grows, one write at a time, in order.
  const saving = useRef<Promise<unknown>>(Promise.resolve());
  const savedJson = useRef(JSON.stringify(p.log));
  useEffect(() => {
    const snapshot: ChatLog = { entries: log, need };
    const json = JSON.stringify(snapshot);
    if (json === savedJson.current) return;
    savedJson.current = json;
    saving.current = saving.current.then(() =>
      saveChatLog(snapshot).then(
        (r) => {
          // Not saved: tried again with the next change.
          if (r.error) savedJson.current = "";
        },
        () => {
          savedJson.current = "";
        },
      ),
    );
  }, [log, need]);

  // What to always check first: what was saved in the thread, else the kind's defaults.
  const [on, setOn] = useState(() => topicChoices(p, p.saved.topics).on);
  const [custom, setCustom] = useState<string[]>(() => topicChoices(p, p.saved.topics).custom);
  const [suggestOn, setSuggestOn] = useState<Set<string>>(
    () => topicChoices(p, p.saved.topics).suggestOn,
  );
  // A new kind brings new topics (and floor) after the refresh: start them again from those, so
  // what shows is what finishing saves.
  const topicsKey = JSON.stringify([p.topics, p.suggested, p.custom]);
  const [topicsFor, setTopicsFor] = useState(topicsKey);
  if (topicsFor !== topicsKey) {
    setTopicsFor(topicsKey);
    const next = topicChoices(p, saved.topics);
    setOn(next.on);
    setCustom(next.custom);
    setSuggestOn(next.suggestOn);
  }
  const [ownTopic, setOwnTopic] = useState("");
  const [topicError, setTopicError] = useState<string | null>(null);
  const [finishing, startFinish] = useTransition();

  const toSend = p.replies.filter((r) => !r.approved && !sentHere.has(r.itemId));
  // Customers handled here who've left the waiting list since stay in the thread (from the log).
  const handledGone = Object.entries(need)
    .filter(([id]) => !p.waiting.some((w) => w.itemId === id))
    .map(([id, o]) => ({ itemId: id, ...o }));
  const needTotal = p.waiting.length + handledGone.length;
  const needOpen = p.waiting.filter((w) => !need[w.itemId]);
  const needHere = Object.keys(need).length > 0;
  const writingNow = p.writing.of > 0 && p.writing.done < p.writing.of;
  const progress = chatProgress(saved, {
    kindKnown: !!p.kind,
    toSend: toSend.length,
    writing: writingNow,
    needYou: p.waiting.length,
    finished: p.finished,
  });
  const open = progress.open;
  const answered = (s: ChatStep) => progress.answered.includes(s);
  const here: Anchor = open;
  const asking = pendingAsk(log);
  const missingNow = open === "missing" ? nextMissing(saved.toAsk ?? [], saved.missing) : null;

  // The newest turn in view inside the chat window, unless the owner scrolled up (no smooth
  // scroll with reduced motion, nor on first load, which opens at the bottom).
  useEffect(() => {
    const el = threadRef.current;
    if (!el || !atEnd.current) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({
      top: el.scrollHeight,
      behavior: reduce || !scrolledOnce.current ? "auto" : "smooth",
    });
    scrolledOnce.current = true;
  }, [open, log.length, queued, busy, error, asking?.id]);

  // Still writing replies: look again every few seconds.
  useEffect(() => {
    if (open !== "replies" || !writingNow) return;
    const t = setInterval(() => router.refresh(), WRITING_POLL_MS);
    return () => clearInterval(t);
  }, [open, writingNow, router]);

  // The box rests after three unusable messages in a row.
  useEffect(() => {
    if (!resting) return;
    const t = setTimeout(() => setResting(false), BOX_REST_MS);
    return () => clearTimeout(t);
  }, [resting]);

  // Left during Undo (not by Undo, which clears it first): send now instead of dropping them.
  useEffect(
    () => () => {
      const left = unsent.current;
      unsent.current = null;
      if (left) void sendSetupReplies({ pairs: left, next: "chat" });
    },
    [],
  );

  /**
   * Said in the thread, at the bottom, under the question open now. While a missing fact is
   * asked, its question is written into the log first (so it stays above what's said to it).
   */
  const say = (...entries: NewEntry[]) =>
    setLog((l) => {
      const asked =
        here === "missing" && missingNow && !pendingAsk(l) && missingNeedsAsking(l, missingNow)
          ? addEntries(l, [{ who: "missing", field: missingNow }], here)
          : l;
      return addEntries(asked, entries.map(clipEntry), here);
    });
  /** Said right after an answer to a question asked again (no missing question in between). */
  const sayAfter = (...entries: NewEntry[]) =>
    setLog((l) => addEntries(l, entries.map(clipEntry), here));

  /** Save an answer (shown at once; saved behind it). */
  async function answer(a: ChatAnswer): Promise<{ error?: string; line?: string }> {
    setError(null);
    setSaved((s) => {
      if (a.step === "kind") return { ...s, kind: a.kind, kindWords: a.words ?? "" };
      if (a.step === "facts") return { ...s, facts: "ok", toAsk: s.toAsk ?? a.toAsk };
      if (a.step === "missing") return { ...s, missing: { ...s.missing, [a.field]: a.outcome } };
      if (a.step === "replies") return { ...s, replies: a.replies, sent: a.sent };
      if (a.step === "needyou") return { ...s, needyou: "done" };
      if (a.step === "topics") return { ...s, topics: a.topics };
      return { ...s, mode: a.mode };
    });
    const r = await saveChatAnswer(a);
    if (r.error) setError(r.error);
    // A new kind: the page reads its facts lines and topics again.
    else if (a.step === "kind") router.refresh();
    return r;
  }

  /**
   * An earlier answer tapped (user feedback, 23 Nov): nothing is cut. That question is asked
   * again at the bottom; once answered, the thread goes on from where the owner was.
   */
  function ask(what: AskWhat) {
    if (queued || busy || finishing) return;
    setError(null);
    setOtherWords(null);
    setTarget(null);
    atEnd.current = true;
    if (what === "replies" && toSend.length === 0) {
      say({ who: "waggle", text: "Nothing left to send here. New replies wait in your Inbox." });
      return;
    }
    setLog((l) => askAgain(l, what, here));
  }

  /** The owner answered (or left) the question asked again: it closes with their words. */
  const closeWith = (words: string) =>
    setLog((l) => addEntries(closeAsks(l), [clipEntry({ who: "me", text: words })], here));

  // Undo had its seconds: now they go.
  useEffect(() => {
    if (!queued) return;
    unsent.current = queued.pairs;
    const t = setTimeout(() => {
      unsent.current = null;
      startSending(async () => {
        const n = queued.pairs.length;
        const r = await sendSetupReplies({ pairs: queued.pairs, next: "chat" });
        if (r.error) {
          setQueued(null);
          setError(r.error);
          return;
        }
        if (queued.again) {
          // Asked again further down: the first answer stays as it was; this one is the log's.
          setSentHere((s) => new Set([...s, ...queued.pairs.map((x) => x.split(":")[0])]));
          setLog((l) =>
            addEntries(
              closeAsks(l),
              [
                { who: "me", text: `Send ${plural(n, "reply", "replies")}` },
                { who: "waggle", text: `Sent ${n} ✓` },
              ],
              here,
            ),
          );
          setQueued(null);
          return;
        }
        // Saved first, so the card doesn't flash back while the page catches up.
        const label = `Send ${plural(n, "reply", "replies")}`;
        const savingAnswer = answer({ step: "replies", replies: "sent", sent: n, label });
        setQueued(null);
        await savingAnswer;
        router.refresh();
      });
    }, UNDO_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queued]);

  // ---- facts: the card, buttons and the typing box ----
  // Every line the profile gives (services need "Area you cover"); "Looks good" checks only these.
  const factRows = (p.facts.length > 0 ? p.facts : FACT_ROWS).map((r) => {
    const found = p.facts.find((f) => f.field === r.field);
    const known = p.known.find((k) => k.field === r.field);
    return {
      field: r.field,
      label: r.label,
      entryId: found?.entryId ?? known?.id ?? null,
      value: found?.value ?? known?.value ?? null,
      from: found?.from ?? null,
    };
  });
  // The replica's chips: "Fix address" says "Change address" in the owner's bubble.
  const fixChips: Chip[] = [
    ...factRows.map((f) => ({
      key: f.field,
      label: `Fix ${FIELD_WORD[f.field]}`,
      onClick: () => fix(f.field, f.entryId, `Change ${FIELD_WORD[f.field]}`),
    })),
    { key: "answer", label: "Fix an answer", onClick: () => fixAnswer("Change an answer") },
  ];
  const factChips: Chip[] = [
    {
      key: "ok",
      label: "Looks good",
      main: true,
      onClick: () => {
        setTarget(null);
        void answer({
          step: "facts",
          checked: factRows
            .filter((f) => f.from && f.entryId)
            .map((f) => f.entryId as string)
            .filter((id, i, all) => all.indexOf(id) === i),
          // What's still missing is asked next, one at a time.
          toAsk: missingFields(factRows),
          label: "Looks good",
        });
      },
    },
    ...fixChips,
  ];

  function fix(field: FactField, id: string | null, label: string) {
    const now = factRows.find((f) => f.field === field)?.value ?? null;
    // Hours: the week editor, prefilled with the hours saved now (user change, 23 Nov).
    if (field === "hours") {
      say(
        { who: "me", text: label },
        {
          who: "turn",
          turn: { kind: "hours", days: openDaysFromText(now), entryId: id, unread: false },
          typed: "",
        },
      );
      setTarget({ field, id });
      return;
    }
    // Address and contact: the replica's editors, prefilled with what's saved (24 Nov).
    if (field === "address" || field === "contact") {
      say(
        { who: "me", text: label },
        {
          who: "turn",
          turn: { kind: field, value: now ?? "", entryId: id, unread: false },
          typed: "",
        },
      );
      setTarget({ field, id });
      return;
    }
    say(
      { who: "me", text: label },
      { who: "waggle", text: `What should your ${FIELD_WORD[field]} say? Just tell me.` },
    );
    setTarget({ field, id });
    boxRef.current?.focus();
  }

  function fixAnswer(label: string) {
    const answers = p.known.filter((k) => k.field === "answer").slice(0, 8);
    if (answers.length === 0) {
      say(
        { who: "me", text: label },
        { who: "waggle", text: "There are no answers yet. You can add them in Teach Waggle." },
      );
      return;
    }
    // The replica's "Which one?": the answers as a list; one tapped opens its editor in place.
    say(
      { who: "me", text: label },
      {
        who: "turn",
        turn: { kind: "answer", entryId: null, value: null, which: true },
        typed: "",
      },
    );
  }

  function pickOption(f: KnownFact) {
    say({ who: "me", text: f.label }, { who: "waggle", text: "What should it say? Just tell me." });
    setTarget({ field: f.field, id: f.id });
    boxRef.current?.focus();
  }

  /** A line of the facts card tapped: fix it here, or (once past the facts) at the bottom. */
  function tapFact(field: FactField, id: string | null) {
    if (queued || busy || finishing) return;
    atEnd.current = true;
    const row = factRows.find((f) => f.field === field)?.label;
    const label = `Change ${(field === "answer" ? "Answers" : (row ?? FIELD_WORD[field])).toLowerCase()}`;
    if ((open === "facts" && !asking) || asking?.what === "facts") {
      if (field === "answer") fixAnswer(label);
      else fix(field, id, label);
      return;
    }
    if (open === "missing" && field === missingNow && !asking) {
      boxRef.current?.focus();
      return;
    }
    ask("facts");
    if (field === "answer") fixAnswer(label);
    else fix(field, id, label);
  }

  // The box's target: what was tapped, else the missing fact being asked.
  const boxTarget = target ?? (missingNow && !asking ? { field: missingNow, id: null } : null);

  async function sendTyped() {
    const typed = text.trim();
    if (!typed || busy || resting) return;
    const full = typed.slice(0, TYPED_MAX);
    setText("");
    say({ who: "me", text: full });
    setBusy(true);
    let turn: TypedTurn;
    try {
      turn = await typeToWaggle({ text: full, target: boxTarget });
    } catch {
      turn = { kind: "error" };
    }
    setBusy(false);
    // "Which hours?" with only one (or none) to pick: the owner says it again for that one.
    if (turn.kind === "ask_which" && turn.field) {
      const field = turn.field;
      const options = p.known.filter((k) => k.field === field).slice(0, 8);
      if (options.length > 1) {
        say({ who: "which", text: turnLine(turn), options });
      } else {
        setTarget({ field, id: options[0]?.id ?? null });
        say({ who: "waggle", text: `What should your ${FIELD_WORD[field]} say? Just tell me.` });
      }
    } else {
      say({ who: "turn", turn, typed: full });
    }
    const miss = unusable(turn) ? misses + 1 : 0;
    setMisses(miss);
    if (miss >= UNUSABLE_IN_A_ROW) {
      setMisses(0);
      say({ who: "waggle", text: "Easier with the buttons:" });
      setResting(true);
    }
  }

  /** In the facts (or fixing them again): the replica's "Anything else?" follows a fix. */
  const inFacts = (open === "facts" && !asking) || asking?.what === "facts";
  const SAVED_LABEL: Record<FactField, string> = {
    hours: "Hours",
    address: "Address",
    area: "Area",
    contact: "Contact",
    price: "Price",
    answer: "Answer",
  };

  /** The missing fact being asked was saved (checked: the owner wrote it): on to the next. */
  async function missingSaved(field: FactField) {
    if (open === "missing" && missingNow && field === missingNow) {
      await answer({ step: "missing", field: missingNow, outcome: "saved" });
    }
  }

  /**
   * A fix saved (any editor, or Save on a proposed change): the owner's "✓ Address: …", then
   * Waggle's "Updated." (with the replies written again), as in the replica. A failed save keeps
   * the editor open with the error under it.
   */
  async function saveField(field: FactField, value: string, entryId: string | null) {
    setError(null);
    setBusy(true);
    const r = await saveChatFact({ field, value, entryId });
    setBusy(false);
    if (r.error) return setError(r.error);
    say(
      { who: "me", text: savedBubble(SAVED_LABEL[field], value) },
      { who: "waggle", text: anythingElse(r.line ?? "Updated.", inFacts) },
    );
    setTarget(null);
    await missingSaved(field);
    router.refresh();
  }

  const saveFact = (turn: Extract<TypedTurn, { kind: "propose" }>) =>
    saveField(turn.field, turn.value, turn.entryId);

  /**
   * "Save hours" on the week editor: saved like any fact (one normalized line). Then, as in the
   * replica, an answer about the hours is offered the new hours too.
   */
  async function saveHours(days: OpenDay[], entryId: string | null) {
    setError(null);
    setBusy(true);
    const r = await saveChatHours({ days, entryId });
    setBusy(false);
    if (r.error) return setError(r.error);
    const line = formatHours(weekOf(days));
    const ha = hoursAnswerOf(p.known);
    const synced = ha ? withNewHours(ha.value, line) : null;
    setTarget(null);
    if (ha && synced && synced !== ha.value.trim()) {
      // The missing hours count as saved once this is answered.
      say(
        { who: "me", text: savedBubble("Hours", line) },
        {
          who: "turn",
          turn: { kind: "sync", entryId: ha.id, label: ha.label, value: synced },
          typed: "",
        },
      );
      router.refresh();
      return;
    }
    say(
      { who: "me", text: savedBubble("Hours", line) },
      { who: "waggle", text: anythingElse(r.line ?? "Updated.", inFacts) },
    );
    await missingSaved("hours");
    router.refresh();
  }

  /** The replica's sync: "Update it" saves the rewritten answer; "Keep the old one" doesn't. */
  async function syncHours(t: Extract<TypedTurn, { kind: "sync" }>, update: boolean) {
    setError(null);
    if (!update) {
      say(
        { who: "me", text: "Keep the old one" },
        { who: "waggle", text: anythingElse("Okay.", inFacts) },
      );
    } else {
      setBusy(true);
      const r = await saveChatFact({ field: "answer", value: t.value, entryId: t.entryId });
      setBusy(false);
      if (r.error) return setError(r.error);
      say(
        { who: "me", text: "Yes, update it" },
        { who: "waggle", text: anythingElse(r.line ?? "Updated.", inFacts) },
      );
    }
    await missingSaved("hours");
    router.refresh();
  }

  /** Cancel on an editor (the replica's): "Never mind", "No problem. Anything else?" */
  function neverMind() {
    setError(null);
    setTarget(null);
    say(
      { who: "me", text: "Never mind" },
      { who: "waggle", text: inFacts ? "No problem. Anything else?" : "No problem." },
    );
  }

  /** "Ask me instead": the answer is removed, so customers asking it come to the owner. */
  async function askMe(a: KnownFact) {
    setError(null);
    setBusy(true);
    const r = await askMeInstead({ entryId: a.id });
    setBusy(false);
    if (r.error) return setError(r.error);
    say(
      { who: "me", text: `Ask me about “${a.label}”` },
      {
        who: "waggle",
        text: inFacts ? "Okay, those come to you. Anything else?" : "Okay, those come to you.",
      },
    );
    setTarget(null);
    router.refresh();
  }

  /** An answer picked from "Which one?": its editor opens in the same turn (the replica's). */
  function pickAnswer(entryLogId: number, a: KnownFact) {
    setTarget({ field: "answer", id: a.id });
    setLog((l) =>
      l.map((x) =>
        x.id === entryLogId && x.who === "turn" && x.turn.kind === "answer"
          ? { ...x, turn: { ...x.turn, entryId: a.id } }
          : x,
      ),
    );
  }

  // ---- the facts Waggle couldn't find ----
  const missingChips: Chip[] = missingNow
    ? [
        {
          key: "skip",
          label: "Skip for now",
          onClick: () => {
            say({ who: "me", text: "Skip for now" });
            setTarget(null);
            void answer({ step: "missing", field: missingNow, outcome: "skipped" });
          },
        },
      ]
    : [];

  // ---- replies ----
  const ticked = toSend.filter((r) => !unticked.has(r.itemId));
  const sendTicked = () => {
    setEditing(null);
    setError(null);
    setQueued({
      pairs: ticked.map((r) => `${r.itemId}:${r.draftId}`),
      again: asking?.what === "replies",
    });
  };
  const undo = () => {
    unsent.current = null;
    setQueued(null);
  };
  const skipReplies = () => {
    if (asking?.what === "replies") closeWith("Skip");
    else void answer({ step: "replies", replies: "skipped", sent: 0, label: "Skip" });
  };

  // ---- need you ----
  const needDone = (w: WaitingMessage, o: NeedOutcome) => {
    const next = { ...need, [w.itemId]: { kind: o.kind, author: w.author.slice(0, 200) } };
    setNeed(next);
    if (p.waiting.every((x) => next[x.itemId])) void answer({ step: "needyou" });
  };

  // ---- what to check first ----
  const addTopic = () => {
    const t = customTopic(ownTopic);
    const ownCount = custom.length + suggestOn.size;
    if (!t) return setTopicError(`Type 2 to ${CUSTOM_LENGTH_MAX} letters.`);
    if (custom.includes(t) || suggestOn.has(t))
      return setTopicError("That one is already on the list.");
    if (ownCount >= CUSTOM_MAX) return setTopicError(`Up to ${CUSTOM_MAX} of your own.`);
    setCustom((c) => [...c, t]);
    setOwnTopic("");
    setTopicError(null);
  };
  const lockedTopics = p.topics.filter((t) => t.locked);
  const offered = p.topics.filter((t) => !t.locked);
  const suggestions = p.suggested.filter((s) => !p.custom.includes(s));
  const chosenTopics = [...on, ...custom, ...suggestOn];
  const chosenLabels = [
    ...lockedTopics.map((t) => t.label),
    ...offered.filter((t) => on.has(t.id)).map((t) => t.label),
    ...[...suggestOn, ...custom].map((t) => {
      const words = customLabel(t);
      return words.charAt(0).toUpperCase() + words.slice(1);
    }),
  ];

  const finishForm = (
    <form
      id={FINISH_FORM}
      action={(fd) => startFinish(() => finishSetup(fd))}
      className="hidden"
      aria-hidden
    >
      <input type="hidden" name="mode" value={saved.mode === "auto" ? "auto" : "approve"} />
      {chosenTopics.map((id) => (
        <input key={id} type="hidden" name="topic" value={id} />
      ))}
    </form>
  );
  /** Setup finishes (again) with what's chosen, once the thread's history is saved. */
  const submitFinish = async () => {
    await saving.current;
    (document.getElementById(FINISH_FORM) as HTMLFormElement | null)?.requestSubmit();
  };
  /** A reply choice tapped: saved, then setup finishes with it. */
  const choose = (mode: "approve" | "auto") => {
    const label = mode === "auto" ? "Reply on its own" : "Ask me first";
    if (asking?.what === "mode") closeWith(label);
    void answer({ step: "mode", mode, label }).then(submitFinish);
  };
  /** The topics' Done: saved; asked again after setup finished, they're saved for replies too. */
  const doneTopics = () => {
    const label = topicsAnswer(chosenLabels).slice(0, 1000);
    const again = asking?.what === "topics";
    if (again) closeWith(label);
    void answer({ step: "topics", topics: chosenTopics, label }).then(() => {
      if (again && p.finished) void submitFinish();
    });
  };

  // ---- the kind ----
  const kindNow = saved.kind
    ? kindAnswer(saved.kind, saved.kindWords)
    : p.kind
      ? kindAnswer(p.kind, p.kindWords)
      : null;
  // Asked in the thread's fixed order only when Waggle couldn't tell (older threads: a saved kind
  // with no first-answer labels was asked there too).
  const kindAsked = !p.kind || !!saved.labels?.kind || (!!saved.kind && !saved.labels);
  const pickKind = async (kind: string, words?: string) => {
    const again = asking?.what === "kind";
    setOtherWords(null);
    if (!again) {
      void answer({ step: "kind", kind, words, label: kindAnswer(kind, words) });
      return;
    }
    closeWith(kindAnswer(kind, words));
    const r = await answer({ step: "kind", kind, words });
    if (!r.error) sayAfter({ who: "waggle", text: r.line ?? "Got it." });
  };
  const kindChips = (again: boolean): Chip[] => [
    ...BUSINESS_KINDS.map((k) => ({
      key: k.key,
      label: k.label,
      onClick: () => {
        if (k.key === "other") setOtherWords("");
        else void pickKind(k.key);
      },
    })),
    ...(again ? [{ key: "keep", label: "Keep it", onClick: () => closeWith("Keep it") }] : []),
  ];
  const kindPicker = (again: boolean) =>
    otherWords !== null ? (
      <form
        className="ml-9 flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const words = otherWords.replace(/\s+/g, " ").trim();
          if (words) void pickKind("other", words);
        }}
      >
        <label className="sr-only" htmlFor="kind-words">
          What kind, in a few words?
        </label>
        <input
          id="kind-words"
          value={otherWords}
          maxLength={CUSTOM_KIND_MAX}
          onChange={(e) => setOtherWords(e.target.value)}
          placeholder="What kind, in a few words?"
          className="field min-w-0 flex-1"
          autoFocus
        />
        <button type="submit" className={BTN_PRIMARY} disabled={!otherWords.trim()}>
          Next
        </button>
      </form>
    ) : (
      <Chips chips={kindChips(again)} />
    );

  // ---- the cards asked in place, or again at the bottom ----
  const topicsCard = (
    <div className="card flex flex-col px-3 pt-1.5 pb-2 text-[13px]">
      <ul className="divide-line flex flex-col divide-y">
        {lockedTopics.map((t) => (
          <li key={t.id} className="flex min-h-10 items-center gap-2.5">
            <Tick on />
            <span className="min-w-0 flex-1">{t.label}</span>
            <span className="text-ink-3 inline-flex items-center gap-1 text-[11.5px]">
              <Lock className="size-3" strokeWidth={1.75} aria-hidden />
              always
            </span>
          </li>
        ))}
        {offered.map((t) => (
          <li key={t.id}>
            <label className="flex min-h-10 cursor-pointer items-center gap-2.5">
              <input
                type="checkbox"
                checked={on.has(t.id)}
                onChange={() =>
                  setOn((s) => {
                    const n = new Set(s);
                    if (n.has(t.id)) n.delete(t.id);
                    else n.add(t.id);
                    return n;
                  })
                }
                className="sr-only"
              />
              <Tick on={on.has(t.id)} />
              {t.label}
            </label>
          </li>
        ))}
        {suggestions.map((t) => (
          <li key={t}>
            <label className="flex min-h-10 cursor-pointer items-center gap-2.5">
              <input
                type="checkbox"
                checked={suggestOn.has(t)}
                onChange={() =>
                  setSuggestOn((s) => {
                    const n = new Set(s);
                    if (n.has(t)) n.delete(t);
                    else if (custom.length + n.size < CUSTOM_MAX) n.add(t);
                    return n;
                  })
                }
                className="sr-only"
              />
              <Tick on={suggestOn.has(t)} />
              <span className="capitalize">{customLabel(t)}</span>
            </label>
          </li>
        ))}
        {custom.map((t) => (
          <li key={t} className="flex min-h-10 items-center gap-2.5">
            <Tick on />
            <span className="min-w-0 flex-1 break-words capitalize">
              {customLabel(t)} <span className="text-ink-3 text-[11px] normal-case">· yours</span>
            </span>
            <button
              type="button"
              aria-label={`Remove ${customLabel(t)}`}
              onClick={() => setCustom((c) => c.filter((x) => x !== t))}
              className="text-ink-3 hover:text-ink inline-flex size-9 items-center justify-center rounded-md"
            >
              <X className="size-4" aria-hidden />
            </button>
          </li>
        ))}
        <li className="flex flex-col gap-1 py-2">
          <span className="flex gap-2">
            <input
              type="text"
              value={ownTopic}
              maxLength={CUSTOM_LENGTH_MAX}
              onChange={(e) => {
                setOwnTopic(e.target.value);
                setTopicError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addTopic();
                }
              }}
              placeholder="+ Add your own"
              aria-label="Add your own topic"
              aria-invalid={topicError ? true : undefined}
              className="field min-w-0 flex-1"
            />
            <button
              type="button"
              onClick={addTopic}
              className="bg-ink text-surface rounded-xl px-3.5 text-sm font-semibold"
            >
              Add
            </button>
          </span>
          {topicError && (
            <span role="alert" className="text-danger text-xs">
              {topicError}
            </span>
          )}
        </li>
      </ul>
      {p.urgent.length > 0 && (
        <p className="text-ink-2 pt-1 text-[12.5px]">
          <b className="font-semibold">Comes to you first:</b>{" "}
          {p.urgent.map((u) => `“${u}”`).join(", ")}
        </p>
      )}
      <span className="flex justify-end pt-2">
        <button type="button" className={BTN_PRIMARY} onClick={doneTopics}>
          Done
        </button>
      </span>
    </div>
  );

  // Above the toggles (user approved 24 Nov): what these topics mean once replies go out alone.
  const topicsBlock = (
    <div className="flex flex-col gap-1.5">
      <p className="text-ink-3 px-1 text-[12.5px]">
        When I reply on my own, messages about these always wait for you.
      </p>
      {topicsCard}
    </div>
  );

  const modeCard = (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      <button
        type="button"
        className="card hover:border-honey flex flex-col gap-0.5 p-3 text-left text-[13px]"
        disabled={finishing}
        data-busy={finishing || undefined}
        onClick={() => choose("approve")}
      >
        <BeeHandsYouSend />
        <b className="text-[14px] font-semibold">Ask me first</b>
        <span className="text-ink-2">I write the reply and wait for your OK. One tap to send.</span>
      </button>
      {p.autoAllowed ? (
        <button
          type="button"
          className="card hover:border-honey flex flex-col gap-0.5 p-3 text-left text-[13px]"
          disabled={finishing}
          onClick={() => choose("auto")}
        >
          <BeeFliesItOut />
          <b className="text-[14px] font-semibold">Reply on its own</b>
          <span className="text-ink-2">
            When your answers cover it, I reply right away. Everything else still comes to you.
          </span>
        </button>
      ) : (
        <Link
          href="/setup?screen=chat&upgrade=auto_reply"
          scroll={false}
          className="card hover:border-honey flex flex-col gap-0.5 p-3 text-[13px] no-underline"
        >
          {/* Free: the plan bee pill; a tap opens the Solo offer in place. */}
          <BeeFliesItOut />
          <span className="flex flex-wrap items-center gap-2">
            <b className="text-ink text-[14px] font-semibold">Reply on its own</b>
            <span className="bg-honey-tint text-ink border-honey-border inline-flex items-center gap-1 rounded-full border px-2 py-px text-[11px] font-semibold">
              <svg width="14" height="10" viewBox="0 0 24 16" aria-hidden>
                <BeeBody flutter={false} />
              </svg>
              Solo
            </span>
          </span>
          <span className="text-ink-2">
            When your answers cover it, I reply right away. Everything else still comes to you.
          </span>
        </Link>
      )}
    </div>
  );

  const repliesProps = {
    p,
    saved,
    toSend,
    ticked,
    unticked,
    setUnticked,
    editing,
    setEditing,
    onSentOne: (id: string) => setSentHere((s) => new Set(s).add(id)),
    queued: queued?.pairs ?? null,
    sending,
    onSend: sendTicked,
    onSkip: skipReplies,
    onUndo: undo,
    onReopen: () => ask("replies"),
    writingNow,
  };

  const doneCard = (
    <div className="flex flex-col items-start gap-2">
      <Link href={WELCOME_HREF} className={`${BTN_PRIMARY} no-underline`}>
        {toSend.length > 0 ? `Go to my inbox · ${toSend.length} ready` : "Go to my inbox"}
      </Link>
      {saved.mode !== "auto" && (
        <span className="text-ink-3 text-[12.5px]">Nothing is sent without your OK.</span>
      )}
      {!asking && (
        <button
          type="button"
          className="text-ink-3 hover:text-ink text-[12.5px] underline"
          onClick={() => ask("facts")}
        >
          Change something
        </button>
      )}
    </div>
  );

  // ---- the log: everything said besides the fixed questions ----
  const lastId = log[log.length - 1]?.id ?? 0;
  const firstMissingId = log.find((e) => e.who === "missing")?.id ?? null;

  const renderTurn = (s: Extract<LogEntry, { who: "turn" }>, last: boolean): ReactNode => {
    const t = s.turn;
    const typed = s.typed.length > 0;
    if (t.kind === "hours") {
      return (
        <Waggle
          key={s.id}
          card={
            last ? (
              <HoursCard
                days={t.days}
                hint={s.typed}
                busy={busy}
                onSave={(days) => void saveHours(days, t.entryId)}
                onCancel={neverMind}
              />
            ) : undefined
          }
        >
          {turnLine(t, typed)}
        </Waggle>
      );
    }
    if (t.kind === "address" || t.kind === "contact") {
      const Card = t.kind === "address" ? AddressCard : ContactCard;
      return (
        <Waggle
          key={s.id}
          card={
            last ? (
              <Card
                value={t.value}
                hint={s.typed}
                busy={busy}
                onSave={(v) => void saveField(t.kind, v, t.entryId)}
                onCancel={neverMind}
              />
            ) : undefined
          }
        >
          {turnLine(t, typed)}
        </Waggle>
      );
    }
    if (t.kind === "answer") {
      const answers = p.known.filter((k) => k.field === "answer");
      const item = t.entryId ? answers.find((a) => a.id === t.entryId) : undefined;
      return (
        <Waggle
          key={s.id}
          card={
            !last ? undefined : item ? (
              <AnswerCard
                key={item.id}
                question={item.label}
                value={t.value ?? item.value}
                hint={s.typed}
                busy={busy}
                onSave={(v) => void saveField("answer", v, item.id)}
                onAskMe={() => void askMe(item)}
                onCancel={neverMind}
              />
            ) : (
              <AnswerList answers={answers} onPick={(a) => pickAnswer(s.id, a)} />
            )
          }
        >
          {turnLine(t, typed)}
        </Waggle>
      );
    }
    if (t.kind === "sync") {
      return (
        <Waggle
          key={s.id}
          card={
            last ? (
              <SyncCard
                value={t.value}
                busy={busy}
                onUpdate={() => void syncHours(t, true)}
                onKeep={() => void syncHours(t, false)}
              />
            ) : undefined
          }
        >
          {turnLine(t)}
        </Waggle>
      );
    }
    if (t.kind === "propose") {
      return (
        <Waggle
          key={s.id}
          card={
            <div className="card flex flex-col gap-1 px-3 py-2.5 text-[13px]">
              {t.before && (
                <span className="text-ink-3 break-words whitespace-pre-line line-through">
                  {t.before}
                </span>
              )}
              <b className="font-semibold break-words whitespace-pre-line">{t.value}</b>
              {last && (
                <span className="mt-1 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={BTN_PRIMARY}
                    disabled={busy}
                    onClick={() => void saveFact(t)}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    className={BTN_LIGHT}
                    disabled={busy}
                    onClick={() => {
                      say(
                        { who: "me", text: "Not quite" },
                        { who: "waggle", text: "OK. Tell me again, or tap a button." },
                      );
                      boxRef.current?.focus();
                    }}
                  >
                    Not quite
                  </button>
                </span>
              )}
            </div>
          }
        >
          {turnLine(t)}
        </Waggle>
      );
    }
    return (
      <div key={s.id} className="flex flex-col gap-1.5">
        <Waggle>{turnLine(t)}</Waggle>
        {t.kind === "unsupported" && last && (
          <Chips
            chips={[
              {
                key: "tell",
                label: "Tell the team you’d like it",
                main: true,
                onClick: () => say({ who: "feedback", text: s.typed, sent: false }),
              },
            ]}
          />
        )}
      </div>
    );
  };

  const ASK_LINE: Record<AskWhat, string> = {
    kind: "Change your business type? Tap one:",
    facts: "Sure. What should I change?",
    replies: repliesQuestion(toSend.length),
    topics: "A few things I’ll always check with you first, even later on. Change any?",
    mode: "When I’ve written a reply, should I wait for your OK?",
  };

  const renderAsk = (e: Extract<LogEntry, { who: "ask" }>): ReactNode => {
    const live = asking?.id === e.id;
    if (e.what === "replies") {
      return live ? (
        <RepliesTurn key={e.id} {...repliesProps} open again />
      ) : (
        <Waggle key={e.id}>{ASK_LINE.replies}</Waggle>
      );
    }
    if (e.what === "kind") {
      return (
        <div key={e.id} className="flex flex-col gap-1.5">
          <Waggle>{ASK_LINE.kind}</Waggle>
          {live && kindPicker(true)}
        </div>
      );
    }
    const card = live
      ? e.what === "topics"
        ? topicsBlock
        : e.what === "mode"
          ? modeCard
          : null
      : null;
    return (
      <Waggle key={e.id} card={card ?? undefined}>
        {ASK_LINE[e.what]}
      </Waggle>
    );
  };

  const renderEntries = (list: readonly LogEntry[]) =>
    list.map((e) => {
      // Only the newest turn keeps its buttons (and not while an earlier answer is asked again).
      const live = e.id === lastId && (!asking || asking.what === "facts");
      switch (e.who) {
        case "me":
          return <Mine key={e.id}>{e.text}</Mine>;
        case "waggle":
          return <Waggle key={e.id}>{e.text}</Waggle>;
        case "turn":
          return renderTurn(e, live);
        case "ask":
          return renderAsk(e);
        case "missing":
          return (
            <div key={e.id} className="flex flex-col gap-3">
              {e.id === firstMissingId && <Waggle>{MISSING_INTRO}</Waggle>}
              <Waggle>{MISSING_QUESTION[e.field]}</Waggle>
            </div>
          );
        case "which":
          return (
            <div key={e.id} className="flex flex-col gap-1.5">
              <Waggle>{e.text}</Waggle>
              {live && (
                <Chips
                  chips={e.options.map((o) => ({
                    key: o.id,
                    label: o.label,
                    onClick: () => pickOption(o),
                  }))}
                />
              )}
            </div>
          );
        case "feedback":
          return (
            <Waggle
              key={e.id}
              card={
                e.sent ? undefined : (
                  <FeedbackCard
                    initial={e.text}
                    tenantId={p.tenantId}
                    onCancel={() => setLog((l) => l.filter((x) => x.id !== e.id))}
                    onSent={() =>
                      setLog((l) => l.map((x) => (x.id === e.id ? { ...x, sent: true } : x)))
                    }
                  />
                )
              }
            >
              {e.sent ? "Thanks, sent to the team." : "Tell the team what you’d like:"}
            </Waggle>
          );
      }
    });

  /**
   * What was said while `step` was open, then (for the steps with a card) the card again at the
   * bottom: "Back to where we were."
   */
  const afterStep = (step: Anchor, card: ReactNode | null): ReactNode => {
    const list = entriesAt(log, step);
    if (list.length === 0) return null;
    const askingHere = !!asking && asking.at === step;
    return (
      <>
        {renderEntries(list)}
        {!askingHere && card}
      </>
    );
  };
  const stepHasLog = (step: Anchor) => log.some((e) => e.at === step);

  // The box to type to Waggle: pinned at the chat window's bottom while facts are checked or
  // fixed, or a missing one is asked.
  const boxOpen =
    !editorLiveNow(log, asking) &&
    ((open === "facts" && (!asking || asking.what === "facts")) ||
      (open === "missing" && !asking) ||
      asking?.what === "facts");
  const typeBox = (
    <div className="border-line bg-surface flex shrink-0 flex-col gap-1 border-t px-3.5 py-2.5">
      <TypeBox
        ref={boxRef}
        value={text}
        onChange={setText}
        onSend={() => void sendTyped()}
        disabled={busy || resting}
        max={TYPED_MAX}
        placeholder={
          resting
            ? "Use the buttons for a minute"
            : boxTarget
              ? `Your ${FIELD_WORD[boxTarget.field]}, as you’d tell a new staff member`
              : "Tell me what to change"
        }
      />
      <button
        type="button"
        className="text-ink-3 hover:text-ink self-start text-[12px] underline"
        onClick={() => say({ who: "feedback", text: "", sent: false })}
      >
        Send feedback
      </button>
    </div>
  );

  const sentCount = saved.replies === "sent" ? (saved.sent ?? 0) : 0;
  const wantedShown = p.wanted.filter((t) => !t.muted).length > 0;
  const missingLive = open === "missing" && !asking && missingNow;
  /**
   * An editor is open as the newest turn: as in the replica, the chips and the box wait until it's
   * saved or cancelled (and a missing fact's own editor stays away).
   */
  const editorLive = editorLiveNow(log, asking);

  return (
    // The chat window (board "Step 3 chat: separate it from the page", option A, 23 Nov): its own
    // card under the steps, the thread scrolling inside it, the typing box pinned at its bottom.
    <div className="bg-surface border-line mb-4 flex h-[max(520px,calc(100dvh_-_150px))] min-h-0 flex-col overflow-hidden rounded-[18px] border shadow-[0_2px_10px_rgba(23,20,15,0.06)] md:mb-6 md:h-[max(600px,calc(100dvh_-_140px))]">
      <ChatHeader
        details={
          <Link href="/setup?screen=replies" className="text-[12.5px] font-semibold">
            See all details
          </Link>
        }
      />
      <div
        ref={threadRef}
        onScroll={onThreadScroll}
        className="bg-subtle/35 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-3 py-3.5 md:px-3.5"
      >
        <Divider label="Your business" />
        <Waggle>{GREETING}</Waggle>

        {/* 1. The kind of business, only when Waggle can't tell. */}
        {kindAsked && (
          <>
            <Waggle>First, what kind of business is this?</Waggle>
            {answered("kind") && kindNow ? (
              <>
                <Mine onChange={() => ask("kind")}>{saved.labels?.kind ?? kindNow}</Mine>
                <Waggle>Got it.</Waggle>
              </>
            ) : (
              !asking && kindPicker(false)
            )}
            {afterStep("kind", null)}
          </>
        )}

        {/* 2. What Waggle found: right? Missing lines are a gentle "Add" (user feedback, 23 Nov). */}
        {answered("kind") && (
          <>
            <Waggle
              card={
                <div className="card overflow-hidden">
                  <FactLine
                    kind="business"
                    label="Business"
                    value={`${p.brandName}${kindNow ? ` · ${kindNow}` : ""}`}
                    onClick={() => ask("kind")}
                  />
                  {factRows.map((f) => (
                    <FactLine
                      key={f.field}
                      kind={f.field}
                      label={f.label}
                      value={f.value}
                      tag={f.from}
                      onClick={() => tapFact(f.field, f.entryId)}
                    />
                  ))}
                  <FactLine
                    kind="answer"
                    label="Answers"
                    value={
                      p.answers > 0
                        ? `Ready for ${plural(p.answers, "common question", "common questions")}`
                        : null
                    }
                    onClick={() => tapFact("answer", null)}
                  />
                </div>
              }
            >
              {factsIntro(p.platformWord, p.replies.length > 0 || writingNow)}
            </Waggle>
            <Waggle>
              Anything wrong or missing? Tell me like you’d tell a new staff member, or tap a line.
            </Waggle>
            {renderEntries(entriesAt(log, "facts"))}
            {answered("facts") ? (
              <Mine onChange={() => ask("facts")}>{saved.labels?.facts ?? "Looks good"}</Mine>
            ) : (
              !asking && !editorLive && <Chips chips={factChips} disabled={busy} />
            )}
          </>
        )}

        {/* 3. What Waggle couldn't find, one at a time (saved like a fix, or skipped for now). */}
        {answered("facts") && (stepHasLog("missing") || missingLive) && (
          <>
            {renderEntries(entriesAt(log, "missing"))}
            {missingLive && (
              <>
                {missingNeedsAsking(log, missingLive) && (
                  <>
                    {firstMissingId === null && <Waggle>{MISSING_INTRO}</Waggle>}
                    <Waggle>{MISSING_QUESTION[missingLive]}</Waggle>
                  </>
                )}
                {missingLive === "hours" && !editorLive && (
                  <Waggle
                    card={
                      <HoursCard
                        days={[]}
                        busy={busy}
                        onSave={(days) => void saveHours(days, null)}
                      />
                    }
                  />
                )}
                {/* The replica's editors for a missing address or contact too (no Cancel:
                    "Skip for now" is the way out). */}
                {(missingLive === "address" || missingLive === "contact") && !editorLive && (
                  <Waggle
                    card={
                      missingLive === "address" ? (
                        <AddressCard
                          value=""
                          hint=""
                          busy={busy}
                          onSave={(v) => void saveField("address", v, null)}
                        />
                      ) : (
                        <ContactCard
                          value=""
                          hint=""
                          busy={busy}
                          onSave={(v) => void saveField("contact", v, null)}
                        />
                      )
                    }
                  />
                )}
                {!editorLive && <Chips chips={missingChips} disabled={busy} />}
              </>
            )}
          </>
        )}

        {answered("missing") && <Divider label="Replies" />}

        {/* 4. What the customers wanted (moved here from step 2). */}
        {answered("missing") && wantedShown && (
          <Waggle
            card={
              <div className="card flex flex-col gap-2 px-3 py-2.5">
                <ul className="flex flex-wrap gap-1.5" aria-label="What they asked about">
                  {p.wanted.map((t) => (
                    <li
                      key={t.label}
                      className={
                        t.muted
                          ? "border-line text-ink-3 rounded-full border px-2.5 py-1 text-[12.5px]"
                          : "border-line bg-surface text-ink-2 rounded-full border px-2.5 py-1 text-[12.5px]"
                      }
                    >
                      {t.label} · <b className="font-semibold">{t.count}</b>
                    </li>
                  ))}
                </ul>
                {p.buyers > 0 && (
                  <p className="text-ink-2 text-[13px]">
                    <b className="text-danger font-semibold">{p.buyers} wanted to buy or order</b>{" "}
                    and got no answer.
                  </p>
                )}
              </div>
            }
          >
            Here’s what your customers wanted.
          </Waggle>
        )}

        {/* 5. The replies Waggle wrote (said again at the bottom after a change in between). */}
        {answered("missing") &&
          (stepHasLog("replies") ? (
            <>
              <RepliesTurn {...repliesProps} open={false} stub />
              {afterStep(
                "replies",
                <>
                  <Waggle>{BACK_LINE}</Waggle>
                  <RepliesTurn {...repliesProps} open={open === "replies"} />
                </>,
              )}
            </>
          ) : (
            <RepliesTurn {...repliesProps} open={open === "replies" && !asking} />
          ))}

        {/* 6. The customers who need the owner. */}
        {answered("replies") && (
          <>
            {sentCount > 0 && <Waggle>Sent {sentCount} ✓</Waggle>}
            {needTotal > 0 && (!answered("needyou") || needHere) && (
              <>
                <Waggle>{needYouLine(needTotal)}</Waggle>
                {handledGone.map((h) => (
                  <NeedDone key={h.itemId} author={h.author} kind={h.kind} />
                ))}
                {renderEntries(entriesAt(log, "needyou"))}
                {(!asking || asking.at !== "needyou") &&
                  p.waiting.map((w, i) => (
                    <NeedItem
                      key={w.itemId}
                      m={w}
                      index={handledGone.length + i}
                      total={needTotal}
                      outcome={need[w.itemId]}
                      current={needOpen[0]?.itemId === w.itemId}
                      text={needText[w.itemId] ?? ""}
                      setText={(v) => setNeedText((t) => ({ ...t, [w.itemId]: v }))}
                      onDone={(o) => needDone(w, o)}
                    />
                  ))}
              </>
            )}
            {saved.needyou && !needHere && p.waiting.length > 0 && (
              <Mine
                onChange={() =>
                  say({ who: "waggle", text: "They’re in your Inbox whenever you want them." })
                }
              >
                Done with these
              </Mine>
            )}
          </>
        )}

        {/* 7. What Waggle always checks first, for everyone (refunds and complaints locked on). */}
        {answered("needyou") && (
          <>
            <Divider label="How replies go out" />
            <Waggle
              card={open === "topics" && !asking && !stepHasLog("topics") ? topicsBlock : undefined}
            >
              A few things I’ll always check with you first, even later on. Change any?
            </Waggle>
            {afterStep(
              "topics",
              <Waggle card={open === "topics" ? topicsBlock : undefined}>{BACK_LINE}</Waggle>,
            )}
            {answered("topics") && (
              <Mine onChange={() => ask("topics")}>
                {saved.labels?.topics ?? topicsAnswer(chosenLabels)}
              </Mine>
            )}
          </>
        )}

        {/* 8. How replies go out: the tap finishes setup. */}
        {answered("topics") && (
          <>
            <Waggle card={open === "mode" && !asking && !stepHasLog("mode") ? modeCard : undefined}>
              Last thing: when I’ve written a reply, should I wait for your OK?
            </Waggle>
            {afterStep(
              "mode",
              <Waggle card={open === "mode" ? modeCard : undefined}>{BACK_LINE}</Waggle>,
            )}
            {answered("mode") && (
              <Mine onChange={() => ask("mode")}>
                {saved.labels?.mode ??
                  (saved.mode === "auto" ? "Reply on its own" : "Ask me first")}
              </Mine>
            )}
            {finishForm}
          </>
        )}

        {/* The end: the bee dances once; changes after it go on below. */}
        {open === "done" && (
          <>
            <div className="flex justify-center">
              <BeeDance scale={0.35} />
            </div>
            <Waggle card={stepHasLog("done") ? undefined : doneCard}>
              {allSetLine(toSend.length)}
            </Waggle>
            {afterStep("done", <Waggle card={doneCard}>{allSetLine(toSend.length)}</Waggle>)}
          </>
        )}

        {finishing && (
          <Waggle>
            <span className="inline-flex items-center gap-2" role="status">
              <BeeSmall />
              Saving…
            </span>
          </Waggle>
        )}
        {busy && <Typing />}
        {/* Fixing facts after they were checked: the buttons stay at the bottom until "That's all". */}
        {asking?.what === "facts" && !editorLive && (
          <Chips
            chips={[
              ...fixChips,
              {
                key: "all",
                label: "That’s all",
                main: true,
                onClick: () => closeWith("That’s all"),
              },
            ]}
            disabled={busy}
          />
        )}

        {error && (
          <p role="alert" className="text-danger pl-9 text-sm">
            {error}
          </p>
        )}
      </div>
      {boxOpen && typeBox}
    </div>
  );
}

/** A customer handled here who has left the waiting list since (restored from the thread). */
function NeedDone({ author, kind }: { author: string; kind: NeedKind }) {
  if (kind === "later") {
    return (
      <>
        <Mine>I’ll answer it myself</Mine>
        <Waggle>{NEED_LABEL.later}</Waggle>
      </>
    );
  }
  return (
    <p className="text-ink-2 flex items-center gap-2 pl-9 text-[12.5px]">
      <StateMark state="working" size={11} />
      <span className="min-w-0 break-words">
        <b className="text-ink font-semibold">{author}</b> · {NEED_LABEL[kind]}
      </span>
    </p>
  );
}

/** Step 3's replies turn: the question with its card, or what's in the way. */
function RepliesTurn({
  p,
  saved,
  open,
  toSend,
  ticked,
  unticked,
  setUnticked,
  editing,
  setEditing,
  onSentOne,
  queued,
  sending,
  onSend,
  onSkip,
  onUndo,
  onReopen,
  writingNow,
  stub,
  again,
}: {
  p: SetupChatProps;
  saved: ChatSaved;
  open: boolean;
  toSend: BatchReply[];
  ticked: BatchReply[];
  unticked: Set<string>;
  setUnticked: (f: (s: Set<string>) => Set<string>) => void;
  editing: string | null;
  setEditing: (id: string | null) => void;
  onSentOne: (id: string) => void;
  queued: string[] | null;
  sending: boolean;
  onSend: () => void;
  onSkip: () => void;
  onUndo: () => void;
  onReopen: () => void;
  writingNow: boolean;
  /** Only the question, where it was first asked (the card is said again further down). */
  stub?: boolean;
  /** Asked again at the bottom: the card only; the owner's answer goes in the thread's log. */
  again?: boolean;
}) {
  const sent = saved.replies === "sent" ? (saved.sent ?? 0) : 0;
  const answeredLine =
    stub || again
      ? null
      : (saved.labels?.replies ??
        (sent > 0
          ? `Send ${plural(sent, "reply", "replies")}`
          : saved.replies === "skipped"
            ? "Skip"
            : null));

  // Nothing left to send (and nothing on its way): what was sent, else why there's no question.
  if (toSend.length === 0 && !queued && !(open && writingNow)) {
    if (again) return null;
    if (sent > 0) {
      return (
        <>
          <Waggle>{repliesQuestion(sent)}</Waggle>
          {answeredLine && <Mine onChange={onReopen}>{answeredLine}</Mine>}
        </>
      );
    }
    return (
      <>
        {p.readBefore ? (
          <Waggle>
            {p.readBefore} was connected before, so I didn’t read its past messages again. New ones
            come to your Inbox.
          </Waggle>
        ) : p.outOfReplies && p.waiting.length > 0 ? (
          <Waggle
            card={
              <Link
                href="/setup?screen=chat&upgrade=replies"
                scroll={false}
                className="bg-ink text-surface inline-flex min-h-10 items-center self-start rounded-xl px-3.5 text-sm font-semibold no-underline"
              >
                Add replies
              </Link>
            }
          >
            <span className="inline-flex items-center gap-2">
              <BeeSmall moving={false} />
              <span>
                <b className="font-semibold">I’m out of AI replies this month.</b>{" "}
                {plural(p.waiting.length, "customer waits", "customers wait")} for you in the inbox.
              </span>
            </span>
          </Waggle>
        ) : p.waiting.length === 0 ? (
          <Waggle>No one from the last 30 days is waiting on a reply. Nice.</Waggle>
        ) : null}
      </>
    );
  }

  if (toSend.length === 0 && open && writingNow) {
    return (
      <>
        <Waggle>
          <span className="inline-flex items-center gap-2" role="status">
            <BeeSmall />
            Still writing replies · {p.writing.done} of {p.writing.of}
          </span>
        </Waggle>
        {!stub && <Chips chips={[{ key: "skip", label: "Go on without them", onClick: onSkip }]} />}
      </>
    );
  }

  return (
    <>
      <Waggle
        card={
          open && !queued && !stub ? (
            <div className="card overflow-hidden">
              <ul className="flex flex-col">
                {toSend.map((r) =>
                  editing === r.itemId ? (
                    <EditReply
                      key={r.itemId}
                      reply={r}
                      onCancel={() => setEditing(null)}
                      onSent={() => {
                        onSentOne(r.itemId);
                        setEditing(null);
                      }}
                    />
                  ) : (
                    <ReplyRow
                      key={r.itemId}
                      reply={r}
                      on={!unticked.has(r.itemId)}
                      marks={p.unchecked[r.draftId]}
                      locked={!p.canSend}
                      onToggle={() =>
                        setUnticked((s) => {
                          const n = new Set(s);
                          if (n.has(r.itemId)) n.delete(r.itemId);
                          else n.add(r.itemId);
                          return n;
                        })
                      }
                      onEdit={() => setEditing(r.itemId)}
                    />
                  ),
                )}
              </ul>
              {Object.keys(p.unchecked).length > 0 && (
                <p className="text-ink-3 border-line border-t px-3 py-1.5 text-[11.5px]">
                  Highlighted facts came from your {p.platformWord}. Sending one counts as checking
                  it.
                </p>
              )}
              <div className="border-line flex flex-wrap items-center justify-end gap-2 border-t px-3 py-2">
                {p.canSend && ticked.length === 0 && (
                  <span className="text-ink-3 mr-auto text-[12.5px]">
                    Tick at least one to send
                  </span>
                )}
                <button type="button" className={BTN_LIGHT} onClick={onSkip}>
                  Skip
                </button>
                {p.canSend && (
                  <button
                    type="button"
                    className={BTN_PRIMARY}
                    disabled={ticked.length === 0}
                    onClick={onSend}
                  >
                    Send {plural(ticked.length, "reply", "replies")}
                  </button>
                )}
              </div>
            </div>
          ) : undefined
        }
      >
        {repliesQuestion(toSend.length)}
      </Waggle>
      {stub ? null : queued ? (
        <>
          <Mine>Send {plural(queued.length, "reply", "replies")}</Mine>
          <Waggle>
            <span className="inline-flex flex-wrap items-center gap-2" role="status">
              <BeeSmall />
              Sending {plural(queued.length, "reply", "replies")}…
              {!sending && (
                <button type="button" className="font-semibold underline" onClick={onUndo}>
                  Undo
                </button>
              )}
            </span>
          </Waggle>
        </>
      ) : (
        answeredLine && <Mine onChange={onReopen}>{answeredLine}</Mine>
      )}
    </>
  );
}

/** One customer who needs the owner, inline (complaints first). */
function NeedItem({
  m,
  index,
  total,
  outcome,
  current,
  text,
  setText,
  onDone,
}: {
  m: WaitingMessage;
  index: number;
  total: number;
  outcome: NeedOutcome | undefined;
  current: boolean;
  text: string;
  setText: (v: string) => void;
  onDone: (o: NeedOutcome) => void;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const complaint = m.category === "complaint";
  if (!current && !outcome) return null;
  if (outcome?.kind === "later") {
    return (
      <>
        <Mine>I’ll answer it myself</Mine>
        <Waggle>{NEED_LABEL.later}</Waggle>
      </>
    );
  }
  if (outcome) {
    return (
      <p className="text-ink-2 flex items-center gap-2 pl-9 text-[12.5px]">
        <StateMark state="working" size={11} />
        <span className="min-w-0 break-words">
          <b className="text-ink font-semibold">{m.author}</b> · {NEED_LABEL[outcome.kind]}
        </span>
      </p>
    );
  }
  return (
    <Waggle
      card={
        <div className="card flex flex-col gap-2 px-3 py-2.5">
          <span className="text-[12.5px] break-words">
            <b className="font-semibold">{m.author} is waiting</b>{" "}
            <span className="text-ink-3">
              · {index + 1} of {total}
            </span>{" "}
            <span className={complaint ? "text-danger" : "text-ink-3"}>
              · {m.kind === "dm" ? "DM" : "comment"}
              {complaint ? " · complaint" : ""}
            </span>
          </span>
          <span className="border-line bg-surface self-start rounded-[12px_12px_12px_4px] border px-2.5 py-1.5 text-[13px] break-words whitespace-pre-line">
            {m.text}
          </span>
          <label className="sr-only" htmlFor={`need-${m.itemId}`}>
            {m.ownReply ? "Your reply" : "What’s the answer? Just the facts."}
          </label>
          <textarea
            id={`need-${m.itemId}`}
            rows={2}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={m.ownReply ? "Write your reply…" : "Tell me the answer…"}
            className="field border-honey text-[13px]"
          />
          {error && (
            <p role="alert" className="text-danger text-xs">
              {error}
            </p>
          )}
          <span className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              className={BTN_LIGHT}
              disabled={pending}
              onClick={() => {
                void skipWaitingMessages({ itemIds: [m.itemId] });
                onDone({ kind: "later" });
              }}
            >
              I’ll answer it myself
            </button>
            <button
              type="button"
              className={BTN_PRIMARY}
              disabled={pending || !text.trim()}
              data-busy={pending || undefined}
              onClick={() =>
                start(async () => {
                  setError(null);
                  if (m.ownReply) {
                    const fd = new FormData();
                    fd.set("itemId", m.itemId);
                    fd.set("body", text);
                    const r = await ownerReplyAction({}, fd);
                    if (r.error) setError(r.error);
                    else onDone({ kind: "sent" });
                    return;
                  }
                  const r = await answerWaitingMessage({ itemId: m.itemId, facts: text });
                  if (r.error) setError(r.error);
                  else if (r.reply) onDone({ kind: "reply" });
                  else if (r.queued) onDone({ kind: "queued" });
                  else onDone({ kind: "still" });
                })
              }
            >
              {pending ? "Sending…" : m.ownReply ? "Send reply" : "Write the reply"}
            </button>
          </span>
        </div>
      }
    >
      {complaint ? "This one is a complaint. You answer it:" : undefined}
    </Waggle>
  );
}
