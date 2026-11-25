"use client";

import { useEffect, useState } from "react";
import { cn } from "cn";
import { BeeBody } from "@/components/app/bee";
import { buttonVariants } from "@/components/ui/button";
import { recordConnectBlocked } from "./connect-help-actions";
import { chromeIntentUrl, leaveSteps, plainPageUrl, type Device, type InApp } from "./connect-help";
import { OkLine, PROGRESS_SAVED, StepRow } from "./step-drawings";

// Connect fix 2 (board approved 24 Nov): inside Instagram's or Facebook's own browser, signing in
// with Meta stops halfway, so the Instagram and Facebook tiles give way to this card: only that
// app's drawn steps out to Safari or Chrome, the bee, and "Your progress is saved". On Android one
// big "Open in Chrome" hands the page over. No "Try here anyway". The link copied or opened is this
// page's plain address (no secrets): over there the person signs in as usual and lands here.

const WIDE = "w-full min-h-11 text-sm rounded-xl";

function Divider() {
  return (
    <div className="text-ink-3 flex items-center gap-2 text-xs" aria-hidden>
      <span className="bg-line h-px flex-1" />
      or
      <span className="bg-line h-px flex-1" />
    </div>
  );
}

/** "Now open Safari, tap the address bar and choose Paste and Go", with the bar drawn. */
function PasteHint({ browser }: { browser: string }) {
  const ios = browser === "Safari";
  const paste = ios ? "Paste and Go" : "Paste";
  return (
    <div
      role="status"
      className="bg-success-soft border-success/30 flex items-center gap-3 rounded-xl border px-3 py-2"
    >
      <div
        aria-hidden
        className="border-ink bg-surface text-ink relative flex h-20 w-[70px] shrink-0 flex-col overflow-hidden rounded-[13px] border-2 text-[7.5px] font-semibold"
      >
        <div className="flex-1" />
        <div className="p-[5px]">
          <span className="bg-ink text-surface absolute bottom-[27px] left-2 rounded-[5px] px-[5px] py-[3px] whitespace-nowrap">
            {paste}
          </span>
          <span className="bg-line text-ink-3 block rounded-[4px] p-1 shadow-[0_0_0_2px_var(--honey),0_0_0_5px_rgba(246,178,27,.3)]">
            Address bar
          </span>
        </div>
      </div>
      <p className="min-w-0 flex-1 text-[13px]">
        <b className="font-semibold">Now open {browser}</b>, tap the address bar and choose{" "}
        <b className="font-semibold">{paste}</b>.
      </p>
    </div>
  );
}

export function InAppGate({ app, device }: { app: InApp; device: Device }) {
  const [copied, setCopied] = useState<"yes" | "no" | null>(null);
  const how = leaveSteps(device);
  const android = device === "android";

  // `connect_blocked_in_app`, once per browser session per app (the server skips repeats too).
  useEffect(() => {
    const key = `waggle.blocked.${app}`;
    try {
      if (window.sessionStorage.getItem(key)) return;
      window.sessionStorage.setItem(key, "1");
    } catch {
      // No session storage here: the server's own check keeps it to one an hour.
    }
    void recordConnectBlocked(app).catch(() => undefined);
  }, [app]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(
        plainPageUrl(window.location.href) ?? window.location.href,
      );
      setCopied("yes");
    } catch {
      setCopied("no");
    }
  };

  const steps = <StepRow steps={how.steps} label={`How to open Waggle in ${how.browser}`} />;

  return (
    <section
      aria-labelledby="in-app-title"
      className="border-honey-border border-t-honey bg-surface flex flex-col gap-3 rounded-[18px] border border-t-4 p-4"
    >
      <div className="flex items-start gap-2.5">
        <span className="bee-bob shrink-0" aria-hidden>
          <svg width="34" height="23" viewBox="0 0 24 16">
            <BeeBody />
          </svg>
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id="in-app-title" className="font-display text-[19px] leading-tight font-semibold">
            Open Waggle in {how.browser} to connect
          </h2>
          <p className="text-ink-2 text-[13.5px]">
            Instagram and Facebook can’t sign in inside {app}’s app.{" "}
            {android ? "One tap and you’re back." : "Two taps and you’re back."}
          </p>
        </div>
      </div>

      {android ? (
        <>
          <a
            href="#"
            onClick={(e) => {
              // Built on tap from this page's plain address (the server can't see it).
              e.preventDefault();
              const page = plainPageUrl(window.location.href);
              const intent = page ? chromeIntentUrl(page) : null;
              if (intent) window.location.href = intent;
            }}
            className={buttonVariants({ variant: "primary", className: cn(WIDE, "no-underline") })}
          >
            Open in Chrome
          </a>
          <p className="text-ink-3 text-center text-[13px]">Didn’t open? Do it by hand:</p>
          {steps}
        </>
      ) : (
        steps
      )}

      <Divider />
      {copied === "yes" ? (
        <span
          className={cn(
            WIDE,
            "border-success/40 bg-success-soft text-success inline-flex items-center justify-center border font-semibold",
          )}
        >
          ✓ Copied
        </span>
      ) : (
        <button
          type="button"
          onClick={copy}
          className={buttonVariants({ variant: "secondary", className: WIDE })}
        >
          {android ? "Copy link" : "Copy link instead"}
        </button>
      )}
      {copied === "yes" && <PasteHint browser={how.browser} />}
      {copied === "no" && (
        <p role="alert" className="text-danger text-[13px]">
          Couldn’t copy here. Use the {how.menu} steps above instead.
        </p>
      )}
      <OkLine>{PROGRESS_SAVED}</OkLine>
    </section>
  );
}
