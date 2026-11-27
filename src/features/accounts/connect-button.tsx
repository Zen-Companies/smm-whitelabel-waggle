"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { StateMark } from "@/components/app/state-mark";
import { ConnectNoteBox } from "./connect-note-box";
import { connectNoteCopy, safeContinueUrl } from "./connect-note";
import { startConnect } from "./start-connect";
import type { UnfinishedConnect } from "./connect-unfinished";
import { ConnectTrouble, UnfinishedNote } from "./connect-unfinished-note";

/** The channel /connect/done tells: "this one is connected". */
export const CONNECT_CHANNEL = "waggle-connect";

type Phase =
  | { at: "idle" }
  | { at: "note" }
  | { at: "waiting"; url: string | null; blocked: boolean; after: string | null }
  | { at: "error"; text: string };

/**
 * Connect without losing your place (design approved 18 Nov). Connect asks for the link with no
 * page reload. Our welcome page: go there in this tab. The partner's own page: the "Before you
 * connect" note opens right here and scrolls into view; Continue opens the sign-in in a new tab
 * and this row waits, then updates itself when that tab is done.
 *
 * Renders the button plus, when open, a full-width block after it (the row wraps).
 *
 * "Didn't finish?" (26 Nov): `unfinished` is this platform's connect try that never came back;
 * its note shows under the button, with Try again (a new connect, the normal way). `trouble`
 * adds "Having trouble?" with the sign-in tips, for platforms that sign in on their own page.
 */
export function ConnectButton({
  id,
  label,
  mark,
  buttonLabel = "Connect",
  unfinished = null,
  trouble = false,
}: {
  id: string;
  label: string;
  mark: React.ReactNode;
  buttonLabel?: string;
  unfinished?: UnfinishedConnect | null;
  trouble?: boolean;
}) {
  const router = useRouter();
  // Where the sign-in comes back to (checked on the server).
  const here = usePathname();
  const [phase, setPhase] = useState<Phase>({ at: "idle" });
  const [pending, startTransition] = useTransition();
  // Try again was tapped on this try: its note is done with (a newer try gets its own).
  const [retriedId, setRetriedId] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const platform = connectNoteCopy(id, label).platform;

  // The note: into view, focus inside it.
  useEffect(() => {
    if (phase.at !== "note" && phase.at !== "waiting") return;
    box.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    box.current?.querySelector<HTMLElement>("button, a")?.focus({ preventScroll: true });
  }, [phase.at]);

  // Waiting: refresh when the other tab says it's done, when this tab comes back, and every few
  // seconds for 10 minutes. Once connected, the page no longer renders this button. The brand's
  // first account goes on to setup step 2 (20 Nov).
  const after = phase.at === "waiting" ? phase.after : null;
  useEffect(() => {
    if (phase.at !== "waiting") return;
    const refresh = () => router.refresh();
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(CONNECT_CHANNEL);
      channel.onmessage = (e: MessageEvent<{ id?: string; ok?: boolean }>) => {
        if (e.data?.id !== id) return;
        if (after && e.data.ok !== false) router.push(after);
        else refresh();
      };
    } catch {
      // older browsers: focus and the timer still work
    }
    window.addEventListener("focus", refresh);
    const timer = window.setInterval(refresh, 4000);
    const stop = window.setTimeout(() => window.clearInterval(timer), 10 * 60_000);
    return () => {
      channel?.close();
      window.removeEventListener("focus", refresh);
      window.clearInterval(timer);
      window.clearTimeout(stop);
    };
  }, [phase.at, after, id, router]);

  // Back from the sign-in with the browser's back button, the page can come back as it was left
  // (the back/forward cache): ask the server again, so a connect that didn't finish shows.
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) router.refresh();
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, [router]);

  const begin = () =>
    startTransition(async () => {
      const r = await startConnect(id, "here", here);
      if (r.kind === "go") {
        const url = safeContinueUrl(r.url) ?? (r.url.startsWith("/") ? r.url : null);
        if (url) window.location.assign(url);
        else
          setPhase({ at: "error", text: `Couldn't start connecting ${label}. Please try again.` });
      } else if (r.kind === "note") setPhase({ at: "note" });
      else if (r.kind === "connected") router.refresh();
      else if (r.kind === "upgrade") router.push(r.href);
      else if (r.kind === "error") setPhase({ at: "error", text: r.text });
    });

  const continueInNewTab = () => {
    // Opened now, while the click still counts, so the browser doesn't block it; the link
    // follows a moment later.
    const tab = window.open("", "_blank");
    if (tab) tab.opener = null;
    setPhase({ at: "waiting", url: null, blocked: !tab, after: null });
    startTransition(async () => {
      const r = await startConnect(id, "tab", here);
      if (r.kind === "open") {
        const url = safeContinueUrl(r.url);
        if (!url) {
          tab?.close();
          setPhase({ at: "error", text: `Couldn't start connecting ${label}. Please try again.` });
        } else if (tab) {
          tab.location.href = url;
          setPhase({ at: "waiting", url, blocked: false, after: r.after });
        } else {
          setPhase({ at: "waiting", url, blocked: true, after: r.after });
        }
      } else {
        tab?.close();
        if (r.kind === "connected") router.refresh();
        else if (r.kind === "upgrade") router.push(r.href);
        else if (r.kind === "error") setPhase({ at: "error", text: r.text });
        else setPhase({ at: "note" });
      }
    });
  };

  const cancel = () => setPhase({ at: "idle" });

  return (
    <>
      {phase.at === "idle" || phase.at === "error" ? (
        <Button
          type="button"
          variant="secondary"
          onClick={begin}
          disabled={pending}
          aria-label={`${buttonLabel} ${label}`}
        >
          {pending ? "Opening…" : buttonLabel}
        </Button>
      ) : null}
      {phase.at === "error" && (
        <p role="alert" className="text-danger basis-full text-sm">
          {phase.text}
        </p>
      )}
      {phase.at === "idle" && unfinished && unfinished.id !== retriedId && (
        <UnfinishedNote
          unfinished={unfinished}
          label={label}
          tryAgain={
            <Button
              type="button"
              variant="primary"
              disabled={pending}
              onClick={() => {
                setRetriedId(unfinished.id);
                begin();
              }}
            >
              Try again
            </Button>
          }
        />
      )}
      {trouble && (phase.at === "idle" || phase.at === "error") && <ConnectTrouble />}
      {phase.at === "note" && (
        <div ref={box} data-connect-open className="basis-full pt-1">
          <ConnectNoteBox
            id={id}
            label={label}
            mark={mark}
            actions={
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-3">
                  <Button type="button" variant="primary" onClick={continueInNewTab}>
                    Continue to {platform} ↗
                  </Button>
                  <Button type="button" variant="secondary" onClick={cancel}>
                    Not now
                  </Button>
                </div>
                <span className="text-ink-3 text-xs">
                  Opens in a new tab. This page stays here.
                </span>
              </div>
            }
          />
        </div>
      )}
      {phase.at === "waiting" && (
        <div
          ref={box}
          data-connect-open
          role="status"
          className="border-line bg-surface flex basis-full flex-col gap-2 rounded-2xl border p-4 text-sm"
        >
          <b className="flex items-center gap-2 font-semibold">
            <StateMark state="waiting" /> Waiting for {platform}…
          </b>
          {phase.blocked ? (
            <p className="text-ink-2">
              Your browser stopped the new tab.{" "}
              {phase.url ? (
                <a
                  href={phase.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link-inline"
                >
                  Open the sign-in
                </a>
              ) : (
                "Getting the link…"
              )}
            </p>
          ) : (
            <p className="text-ink-2">
              Finish in the other tab. This updates by itself when you&apos;re done.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {phase.url && !phase.blocked && (
              <a
                href={phase.url}
                target="_blank"
                rel="noopener noreferrer"
                className="action-link text-sm"
              >
                Open the sign-in again ↗
              </a>
            )}
            <button type="button" onClick={cancel} className="action-link text-sm">
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
}
