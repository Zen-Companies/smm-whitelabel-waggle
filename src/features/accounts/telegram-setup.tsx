"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { PlatformMark } from "@/components/app/platform-mark";
import { Button, buttonVariants } from "@/components/ui/button";
import { checkTelegram, startTelegram } from "./actions";

const POLL_MS = 4_000;

type State =
  | { step: "loading" }
  | { step: "waiting"; code: string; expiresAt: string; botUsername: string }
  | { step: "expired" }
  | { step: "error"; message: string };

/**
 * Settings → Accounts → Connect Telegram, opened in place (design v3 "Platforms · Setup steps"):
 * the code for Zernio's bot, checked every few seconds until it arrives.
 */
export function TelegramSetup() {
  const router = useRouter();
  const [state, setState] = useState<State>({ step: "loading" });
  const [copied, setCopied] = useState(false);
  const started = useRef(false);

  const getCode = useCallback(async () => {
    setState({ step: "loading" });
    const result = await startTelegram();
    setState(
      "error" in result ? { step: "error", message: result.error } : { step: "waiting", ...result },
    );
  }, []);

  useEffect(() => {
    // Once per open (React runs effects twice in development).
    if (started.current) return;
    started.current = true;
    void getCode();
  }, [getCode]);

  useEffect(() => {
    if (state.step !== "waiting") return;
    const code = state.code;
    const expiresAt = new Date(state.expiresAt).getTime();
    let stopped = false;
    const timer = setInterval(async () => {
      if (Date.now() > expiresAt) {
        setState({ step: "expired" });
        return;
      }
      const result = await checkTelegram(code);
      if (stopped) return;
      if ("error" in result) setState({ step: "error", message: result.error });
      else if (result.status === "expired") setState({ step: "expired" });
      else if (result.status === "foreign") {
        setState({
          step: "error",
          message: "That code connected a channel to another brand. Get a new code and try again.",
        });
      } else if (result.status === "connected") {
        stopped = true;
        router.push(
          `/settings?section=accounts&${result.username ? "connected" : "connecting"}=telegram`,
        );
      }
    }, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [state, router]);

  return (
    <section
      id="setup"
      aria-labelledby="telegram-setup"
      className="border-line bg-surface flex max-w-xl flex-col gap-3.5 rounded-2xl border p-5"
    >
      <div className="flex items-center gap-3">
        <PlatformMark platform="telegram" size={40} />
        <h3 id="telegram-setup" className="text-[17px] font-semibold">
          Connect Telegram
        </h3>
      </div>
      <ol className="text-ink-2 flex list-decimal flex-col gap-1 pl-5">
        <li>Open your channel or group in Telegram.</li>
        <li>
          Add{" "}
          <b className="text-ink font-semibold">
            @{state.step === "waiting" ? state.botUsername : "LateScheduleBot"}
          </b>{" "}
          (shown as “Social Media Connector”) as an admin.
        </li>
        <li>Send it this code in the channel:</li>
      </ol>

      {state.step === "loading" && <p className="text-ink-3">Getting a code…</p>}
      {state.step === "waiting" && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <span className="bg-subtle rounded-lg px-3.5 py-2 font-mono text-lg font-semibold tracking-wider">
              {state.code}
            </span>
            <Button
              type="button"
              variant="secondary"
              onClick={async () => {
                await navigator.clipboard.writeText(state.code);
                setCopied(true);
              }}
            >
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <p role="status" className="text-ink-2 flex items-center gap-2 text-sm">
            <span aria-hidden className="bg-honey size-2 animate-pulse rounded-full" />
            Waiting for the code… this page updates on its own.
          </p>
        </>
      )}
      {state.step === "expired" && (
        <div className="flex flex-wrap items-center gap-3">
          <p role="status" className="text-ink-2">
            This code expired (they last 15 minutes).
          </p>
          <Button type="button" variant="secondary" onClick={() => void getCode()}>
            Get a new code
          </Button>
        </div>
      )}
      {state.step === "error" && (
        <div className="flex flex-wrap items-center gap-3">
          <p role="alert" className="text-danger text-sm">
            {state.message}
          </p>
          <Button type="button" variant="secondary" onClick={() => void getCode()}>
            Try again
          </Button>
        </div>
      )}

      <span className="text-ink-3 text-xs">
        Waggle posts to that channel or group. Answering messages there comes in an update.
      </span>
      <Link
        href="/settings?section=accounts"
        className={`${buttonVariants({ variant: "ghost" })} self-start`}
      >
        Cancel
      </Link>
    </section>
  );
}
