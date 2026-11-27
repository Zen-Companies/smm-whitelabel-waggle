"use client";

import { useEffect, useState, type ReactNode } from "react";
import { buttonVariants } from "@/components/ui/button";
import { detectInApp, type BreakerApp, type InAppHit } from "./in-app-browser";
import { autoSwitchUrl, browserFor, noteCopy, type InAppWhere } from "./in-app-switch";
import { copyPlainLink, InAppCard } from "./in-app-card";

// "Any in-app browser" (hotfix approved 27 Nov). On sign-up, sign-in and Connect:
// 1. In an app's browser, try once per page visit to hand the page to Safari (iOS 17+,
//    x-safari-https) or Chrome (Android intent), with the page's plain address only.
// 2. Still here after ~1.5 s: Instagram's, Facebook's, Messenger's and TikTok's browsers get the
//    full card, replacing the form on sign-up and sign-in (at Connect the page shows its own card
//    from the server); any other app's browser gets a gentle honey note above the form, with
//    "Continue here anyway". Computers and real browsers see nothing.
// Feedback in place, never a toast (design.md §4).

export type RecordInAppSwitch = (input: { where: InAppWhere; stayed: boolean }) => Promise<void>;

const SWITCH_WAIT_MS = 1500;
const TRIED_KEY = "waggle.inapp.tried:";
const CONTINUE_KEY = "waggle.inapp.continue";

/** Waggle saved to the home screen runs standalone: never an in-app browser. */
function isStandalone(): boolean {
  try {
    const nav = navigator as Navigator & { standalone?: boolean };
    return nav.standalone === true || window.matchMedia("(display-mode: standalone)").matches;
  } catch {
    return false;
  }
}

/** True the first time in this browser session; false after, or without session storage. */
function claimOnce(key: string): boolean {
  try {
    if (window.sessionStorage.getItem(key)) return false;
    window.sessionStorage.setItem(key, "1");
    return true;
  } catch {
    // No session storage: never try automatically, so it can't loop.
    return false;
  }
}

function readFlag(key: string): boolean {
  try {
    return window.sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function setFlag(key: string) {
  try {
    window.sessionStorage.setItem(key, "1");
  } catch {
    // Hidden for this page only.
  }
}

/** The gentle note (board C): the form under it stays usable. */
function InAppNote({ hit, onContinue }: { hit: InAppHit; onContinue: () => void }) {
  const [copied, setCopied] = useState<"yes" | "no" | null>(null);
  const { browser, menu } = noteCopy(hit);
  return (
    <div
      role="note"
      className="border-honey-border bg-honey-tint flex flex-col gap-2.5 rounded-xl border p-3 text-[13.5px]"
    >
      <div className="flex items-start gap-2">
        <span className="text-honey-text" aria-hidden>
          ◌
        </span>
        <p className="flex-1">
          You’re inside{" "}
          {hit.app ? (
            <>
              <b className="font-semibold">{hit.app}</b>’s browser
            </>
          ) : (
            "another app’s browser"
          )}
          . Signing in to your accounts works best in {browser}. Tap {menu} →{" "}
          <b className="font-semibold">Open in browser</b>.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {copied === "yes" ? (
          <span role="status" className="text-success min-h-9 px-1 py-2 font-semibold">
            ✓ Copied. Now open {browser} and paste it in the address bar.
          </span>
        ) : (
          <button
            type="button"
            onClick={async () => setCopied((await copyPlainLink()) ? "yes" : "no")}
            className={buttonVariants({ variant: "secondary", className: "min-h-9" })}
          >
            Copy link
          </button>
        )}
        <button
          type="button"
          onClick={onContinue}
          className={buttonVariants({ variant: "quiet", className: "min-h-9" })}
        >
          Continue here anyway
        </button>
      </div>
      {copied === "no" && (
        <p role="alert" className="text-danger text-[13px]">
          Couldn’t copy here. Tap {menu} → Open in browser instead.
        </p>
      )}
    </div>
  );
}

/** "Opening Waggle in Safari…" while the automatic switch is tried (known breakers only). */
function Opening({ browser }: { browser: string }) {
  return (
    <p role="status" className="text-ink-2 py-6 text-center text-sm">
      Opening Waggle in {browser}…
    </p>
  );
}

/**
 * The in-app check around a page's form. `where` is sign-up, sign-in or Connect; `record` writes
 * `inapp_switch_attempted` (app, phone, page, whether the page was still showing after 1.5 s).
 * At Connect, pass no children: it only tries the switch and shows the gentle note.
 */
export function InAppGuard({
  where,
  record,
  children,
}: {
  where: InAppWhere;
  record?: RecordInAppSwitch;
  children?: ReactNode;
}) {
  const [hit, setHit] = useState<InAppHit | null>(null);
  const [trying, setTrying] = useState(false);
  const [continued, setContinued] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent;
    const found = detectInApp(ua, { standalone: isStandalone() });
    if (!found) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the user agent is client-only
    setHit(found);
    if (found.level === "note" && readFlag(CONTINUE_KEY)) setContinued(true);
    const target = autoSwitchUrl(window.location.href, ua, found);
    if (!target || !claimOnce(`${TRIED_KEY}${window.location.pathname}`)) return;
    setTrying(true);
    window.location.href = target;
    // Not cleared on unmount: it only settles state and records the try, once.
    window.setTimeout(() => {
      setTrying(false);
      const stayed = document.visibilityState === "visible";
      if (record) void record({ where, stayed }).catch(() => undefined);
    }, SWITCH_WAIT_MS);
  }, [where, record]);

  if (!hit) return <>{children}</>;

  if (hit.level === "card") {
    // At Connect the page already shows its card where the tiles would fail.
    if (where === "connect") return <>{children}</>;
    if (trying) return <Opening browser={browserFor(hit.device)} />;
    return <InAppCard app={hit.app as BreakerApp} device={hit.device} where={where} />;
  }

  return (
    <>
      {!trying && !continued && (
        <InAppNote
          hit={hit}
          onContinue={() => {
            setFlag(CONTINUE_KEY);
            setContinued(true);
          }}
        />
      )}
      {children}
    </>
  );
}
