"use client";

import { Lock, X } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { cn } from "cn";
import { BeeBody } from "@/components/app/bee";
import { BeeFliesItOut, BeeHandsYouSend } from "@/components/app/bee-setup";
import { CUSTOM_LENGTH_MAX, CUSTOM_MAX, customLabel, customTopic } from "@/lib/ask-first";
import { finishSetup } from "./actions";
import type { SetupScreen } from "./flow";
import { PRIMARY, ScreenFooter, ScreenTitle } from "./setup-frame";

// 3.4 "Last thing: how replies go out" (board "How replies go out, made clear", approved 21 Nov):
// the choice first. The topics matter only when Waggle replies on its own, so they open under it
// then: "Even then, ask me first about:", tick boxes, plus the owner's own topics ("Add your own").
// Refunds and complaints always come to the owner: a fixed line with a lock, never a switch. On
// Free, Reply on its own carries the plan bee pill (bee + Solo) and opens the Solo offer in place.

const FORM = "setup-finish";

function Finish({ pending }: { pending: boolean }) {
  return (
    <button
      type="submit"
      form={FORM}
      className={PRIMARY}
      disabled={pending}
      data-busy={pending || undefined}
    >
      {pending ? "Saving…" : "Finish setup"}
    </button>
  );
}

function Tick({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex size-[18px] shrink-0 items-center justify-center rounded-[5px] text-[11px]",
        on ? "bg-ink text-surface" : "border-line-strong border-[1.5px]",
      )}
    >
      {on ? "✓" : ""}
    </span>
  );
}

export function HowScreen({
  topics,
  custom: savedCustom,
  mode,
  autoAllowed,
  top,
  back,
  index,
  count,
}: {
  topics: { id: string; label: string; on: boolean }[];
  /** The owner's own topics, "custom:…". */
  custom: string[];
  mode: "approve" | "auto";
  autoAllowed: boolean;
  top?: React.ReactNode;
  back: SetupScreen | null;
  index: number;
  count: number;
}) {
  const [on, setOn] = useState(() => new Set(topics.filter((t) => t.on).map((t) => t.id)));
  const [custom, setCustom] = useState<string[]>(savedCustom);
  const [draft, setDraft] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [choice, setChoice] = useState<"approve" | "auto">(autoAllowed ? mode : "approve");
  const [pending, start] = useTransition();
  const offered = topics.filter((t) => t.id !== "refunds");

  const toggle = (id: string) =>
    setOn((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const add = () => {
    const t = customTopic(draft);
    if (!t) {
      setAddError(`Type 2 to ${CUSTOM_LENGTH_MAX} letters.`);
      return;
    }
    if (custom.includes(t)) {
      setAddError("That one is already on the list.");
      return;
    }
    if (custom.length >= CUSTOM_MAX) {
      setAddError(`Up to ${CUSTOM_MAX} of your own.`);
      return;
    }
    setCustom((c) => [...c, t]);
    setDraft("");
    setAddError(null);
  };

  return (
    <>
      {top}
      <form id={FORM} action={(fd) => start(() => finishSetup(fd))} className="contents">
        <ScreenTitle title="Last thing: how replies go out" />
        {/* What's saved, whichever choice is shown (switching back keeps it). */}
        {[...on].map((id) => (
          <input key={id} type="hidden" name="topic" value={id} />
        ))}
        {custom.map((t) => (
          <input key={t} type="hidden" name="topic" value={t} />
        ))}

        <fieldset className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <legend className="sr-only">How replies go out</legend>
          <label
            className={cn(
              "card flex cursor-pointer flex-col gap-0.5 p-3 text-[13px]",
              choice === "approve" && "border-honey ring-honey ring-1",
            )}
          >
            <input
              type="radio"
              name="mode"
              value="approve"
              checked={choice === "approve"}
              onChange={() => setChoice("approve")}
              className="sr-only"
            />
            <BeeHandsYouSend />
            <b className="text-[14px] font-semibold">Ask me first</b>
            <span className="text-ink-2">I write it, you send it. One tap.</span>
          </label>
          {autoAllowed ? (
            <label
              className={cn(
                "card flex cursor-pointer flex-col gap-0.5 p-3 text-[13px]",
                choice === "auto" && "border-honey ring-honey ring-1",
              )}
            >
              <input
                type="radio"
                name="mode"
                value="auto"
                checked={choice === "auto"}
                onChange={() => setChoice("auto")}
                className="sr-only"
              />
              <BeeFliesItOut />
              <b className="text-[14px] font-semibold">Reply on its own</b>
              <span className="text-ink-2">Answers what you approved right away.</span>
            </label>
          ) : (
            <Link
              href="/setup?screen=how&upgrade=auto_reply"
              scroll={false}
              className="card hover:border-honey flex flex-col gap-0.5 p-3 text-[13px] no-underline"
            >
              {/* Free (board "Setup, start to finish", 23 Nov): the plan bee pill, like Your plan's
                  pills; a tap opens the Solo offer in place. */}
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
              <span className="text-ink-2">Answers what you approved right away.</span>
            </Link>
          )}
        </fieldset>

        {choice === "auto" && (
          <div className="card part-in flex flex-col px-3.5 pt-3 pb-1.5">
            <b id="ask-first-title" className="text-[14px] font-semibold">
              Even then, ask me first about:
            </b>
            <ul
              aria-labelledby="ask-first-title"
              className="divide-line mt-1.5 flex flex-col divide-y"
            >
              {offered.map((t) => (
                <li key={t.id}>
                  <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-[13.5px]">
                    <input
                      type="checkbox"
                      checked={on.has(t.id)}
                      onChange={() => toggle(t.id)}
                      className="peer sr-only"
                    />
                    <Tick on={on.has(t.id)} />
                    {t.label}
                  </label>
                </li>
              ))}
              {custom.map((t) => (
                <li key={t} className="flex min-h-11 items-center gap-2.5 text-[13.5px]">
                  <Tick on />
                  <span className="min-w-0 flex-1 break-words capitalize">{customLabel(t)}</span>
                  <span className="text-ink-3 text-xs">yours</span>
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
                    value={draft}
                    maxLength={CUSTOM_LENGTH_MAX}
                    onChange={(e) => {
                      setDraft(e.target.value);
                      setAddError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        add();
                      }
                    }}
                    placeholder="Add your own, e.g. rush orders"
                    aria-label="Add your own topic"
                    aria-invalid={addError ? true : undefined}
                    className="field min-w-0 flex-1"
                  />
                  <button
                    type="button"
                    onClick={add}
                    className="bg-ink text-surface rounded-xl px-3.5 text-sm font-semibold"
                  >
                    Add
                  </button>
                </span>
                {addError ? (
                  <span role="alert" className="text-danger text-xs">
                    {addError}
                  </span>
                ) : (
                  <span className="text-ink-3 text-xs">
                    Use the words customers use. Waggle asks you when a message mentions them.
                  </span>
                )}
              </li>
            </ul>
          </div>
        )}

        <p className="text-ink-2 flex items-center gap-2 text-[13px]">
          <Lock className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />
          Refunds and complaints always come to you.
        </p>
      </form>
      <ScreenFooter
        back={back}
        index={index}
        count={count}
        primary={<Finish pending={pending} />}
      />
    </>
  );
}
