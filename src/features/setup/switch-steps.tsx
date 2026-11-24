"use client";

import { useId, useState, type ReactNode } from "react";
import { cn } from "cn";
import { PlatformMark } from "@/components/app/platform-mark";
import { switchNote, switchSteps, type SwitchPlatform } from "./connect-help";
import { OkLine, StepRow } from "./step-drawings";

// Connect fix 2 (board approved 24 Nov): the rule above the Instagram and Facebook buttons, and
// "How to switch (30 sec)" opening the drawn steps in place, one platform at a time.

const LABEL: Record<SwitchPlatform, string> = { instagram: "Instagram", facebook: "Facebook" };
const TAB_KEY = "waggle.switch-tab";

function readTab(): SwitchPlatform | null {
  try {
    const v = window.localStorage.getItem(TAB_KEY);
    return v === "instagram" || v === "facebook" ? v : null;
  } catch {
    return null;
  }
}

function saveTab(tab: SwitchPlatform) {
  try {
    window.localStorage.setItem(TAB_KEY, tab);
  } catch {
    // A private window: it opens on the default next time.
  }
}

/** One line per platform: what each needs (each with its own mark). */
function RuleLines({ platforms }: { platforms: SwitchPlatform[] }) {
  return (
    <ul className="flex min-w-[200px] flex-1 flex-col gap-1.5 text-[13.5px]">
      {platforms.map((p) => (
        <li key={p} className="flex items-center gap-2">
          <PlatformMark platform={p} size={18} />
          {p === "instagram" ? (
            <span>
              <b className="font-semibold">Instagram</b> needs a{" "}
              <b className="font-semibold">business or creator</b> account
            </span>
          ) : (
            <span>
              <b className="font-semibold">Facebook</b> needs a{" "}
              <b className="font-semibold">Page you manage</b>
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

const TOGGLE =
  "text-ink inline-flex min-h-11 shrink-0 cursor-pointer items-center px-1 text-[13.5px] font-semibold underline underline-offset-4 hover:text-ink-2";

/**
 * The rule, and the steps it opens. `connect` holds each platform's "I switched, connect …"
 * button (a form made on the server).
 */
export function SwitchHelp({
  platforms,
  initial,
  connect,
}: {
  platforms: SwitchPlatform[];
  /** The tab to open on (the platform last tapped), when known. */
  initial: SwitchPlatform | null;
  connect: Partial<Record<SwitchPlatform, ReactNode>>;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<SwitchPlatform>(initial ?? platforms[0] ?? "instagram");
  const panelId = useId();
  if (platforms.length === 0) return null;
  const pick = (p: SwitchPlatform) => {
    setTab(p);
    saveTab(p);
  };
  const toggle = (
    <button
      type="button"
      className={TOGGLE}
      aria-expanded={open}
      aria-controls={panelId}
      onClick={() => {
        // Opens on the platform tapped last (remembered on this device).
        if (!open && !initial) {
          const last = readTab();
          if (last && platforms.includes(last)) setTab(last);
        }
        setOpen(!open);
      }}
    >
      {open ? "Hide steps" : "How to switch (30 sec)"}
    </button>
  );
  return (
    <div className="flex flex-col gap-3">
      <div className="border-honey-border border-l-honey bg-surface flex flex-wrap items-center gap-3 rounded-xl border border-l-4 px-3 py-2">
        <RuleLines platforms={platforms} />
        {toggle}
      </div>
      {open && (
        <section
          id={panelId}
          aria-label="How to switch"
          className="card flex flex-col gap-3 p-3 sm:p-4"
        >
          {platforms.length > 1 && (
            <div
              role="tablist"
              aria-label="Platform"
              className="bg-line flex gap-1 rounded-[11px] p-[3px]"
            >
              {platforms.map((p) => (
                <button
                  key={p}
                  type="button"
                  role="tab"
                  aria-selected={tab === p}
                  onClick={() => pick(p)}
                  className={cn(
                    "inline-flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-[9px] text-[13.5px]",
                    tab === p
                      ? "bg-surface font-bold shadow-[0_1px_2px_rgba(23,20,15,.12)]"
                      : "text-ink-2 font-medium",
                  )}
                >
                  <PlatformMark platform={p} size={16} />
                  {LABEL[p]}
                </button>
              ))}
            </div>
          )}
          <SwitchStepsBody platform={tab} />
          <div className="flex flex-wrap items-center justify-end gap-3">
            <button type="button" className={TOGGLE} onClick={() => setOpen(false)}>
              Hide steps
            </button>
            {connect[tab]}
          </div>
        </section>
      )}
    </div>
  );
}

/** The drawn steps for one platform and the "it's free" line. */
export function SwitchStepsBody({ platform }: { platform: SwitchPlatform }) {
  return (
    <>
      <StepRow
        steps={switchSteps(platform)}
        label={
          platform === "facebook"
            ? "How to make a Facebook Page"
            : "How to switch Instagram to business or creator"
        }
      />
      <OkLine>{switchNote(platform)}</OkLine>
    </>
  );
}
