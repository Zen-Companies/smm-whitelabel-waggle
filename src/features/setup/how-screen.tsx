"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { cn } from "cn";
import { finishSetup } from "./actions";
import type { SetupScreen } from "./flow";
import { PRIMARY, ScreenFooter, ScreenTitle } from "./setup-frame";

// 3.4 "Last thing: how replies go out" (Walter's flow, paged, approved 20 Nov): the Always ask me
// topics, then Ask me first / Reply on its own. On Free, Reply on its own carries the Solo tag
// and opens the Solo offer in place (build A: upgradeHref("auto_reply", here), the (setup) layout
// mounts the pop-ups) instead of switching on.

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
      {pending ? "Saving…" : "Go to my inbox"}
    </button>
  );
}

export function HowScreen({
  topics,
  mode,
  autoAllowed,
  top,
  back,
  index,
  count,
}: {
  topics: { id: string; label: string; on: boolean }[];
  mode: "approve" | "auto";
  autoAllowed: boolean;
  top?: React.ReactNode;
  back: SetupScreen | null;
  index: number;
  count: number;
}) {
  const [on, setOn] = useState(() => new Set(topics.filter((t) => t.on).map((t) => t.id)));
  const [choice, setChoice] = useState<"approve" | "auto">(autoAllowed ? mode : "approve");
  const [pending, start] = useTransition();
  return (
    <>
      {top}
      <form id={FORM} action={(fd) => start(() => finishSetup(fd))} className="contents">
        <ScreenTitle title="Last thing: how replies go out" />
        <fieldset className="card px-3 py-1">
          <legend className="sr-only">Always ask me first about</legend>
          {topics.map((t, i) => {
            const checked = on.has(t.id);
            return (
              <label
                key={t.id}
                className={cn(
                  "flex min-h-11 cursor-pointer items-center justify-between gap-3 py-2 text-[13.5px]",
                  i > 0 && "border-line border-t",
                )}
              >
                <span className="min-w-0">
                  {i === 0 ? `Always ask me: ${t.label.toLowerCase()}` : t.label}
                </span>
                <input
                  type="checkbox"
                  name="topic"
                  value={t.id}
                  checked={checked}
                  onChange={() =>
                    setOn((s) => {
                      const n = new Set(s);
                      if (n.has(t.id)) n.delete(t.id);
                      else n.add(t.id);
                      return n;
                    })
                  }
                  className="peer sr-only"
                />
                <span
                  aria-hidden
                  className={cn(
                    "peer-focus-visible:ring-ink/20 relative h-6 w-11 shrink-0 rounded-full transition-colors duration-150 peer-focus-visible:ring-3",
                    checked ? "bg-success" : "bg-line-strong",
                  )}
                >
                  <span
                    className={cn(
                      "bg-surface absolute top-0.5 size-5 rounded-full transition-[left] duration-150",
                      checked ? "left-[22px]" : "left-0.5",
                    )}
                  />
                </span>
              </label>
            );
          })}
        </fieldset>
        <p className="text-ink-3 -mt-1 text-xs">
          Complaints always come to you, whatever you choose here.
        </p>
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
              <b className="text-[14px] font-semibold">Reply on its own</b>
              <span className="text-ink-2">Answers what you approved right away.</span>
            </label>
          ) : (
            <Link
              href="/setup?screen=how&upgrade=auto_reply"
              scroll={false}
              className="card hover:border-honey flex flex-col gap-0.5 p-3 text-[13px] no-underline"
            >
              <span className="flex flex-wrap items-center gap-2">
                <b className="text-ink text-[14px] font-semibold">Reply on its own</b>
                <span className="bg-honey-tint text-honey-text border-honey-border rounded-full border px-2 text-[11px] font-semibold">
                  Solo
                </span>
              </span>
              <span className="text-ink-2">Answers what you approved right away.</span>
            </Link>
          )}
        </fieldset>
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
