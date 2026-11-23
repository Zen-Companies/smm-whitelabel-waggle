"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { BeeBody } from "@/components/app/bee";
import { Mark } from "@/components/app/brand";
import { Button } from "@/components/ui/button";
import { ScreenTitle } from "./setup-frame";

// Setup step 1, back from the sign-in (board "Setup, start to finish", approved 23 Nov): the bee
// flies from the platform to Waggle while the account arrives. It checks by itself (every 3 s and
// when the tab comes back) and opens step 2 once connected. After a minute it says so, with Check
// again; it stops asking after 10 minutes until Check again. A sign-in that ended says so with
// Reload; three failed checks in a row say Waggle can't check, with Check again. Once connected it
// stops asking and opens step 2 once.

const EVERY_MS = 3_000;
const SLOW_MS = 60_000;
const STOP_MS = 10 * 60_000;
/** After this long the check may ask Zernio directly, in case the webhook got lost. */
const RECONCILE_AFTER_MS = 20_000;
const RECONCILE_EVERY_MS = 15_000;
/** Failed checks in a row (server error or offline) before the screen says so. */
const FAIL_LIMIT = 3;

type Trouble = null | "signedOut" | "offline";

const FLIGHT = "M0,20 L160,20";

export function ConnectingScreen({ label, mark }: { label: string; mark: ReactNode }) {
  const router = useRouter();
  const [slow, setSlow] = useState(false);
  const [round, setRound] = useState(0);
  const [trouble, setTrouble] = useState<Trouble>(null);
  const started = useRef(0);
  const reconciled = useRef(0);
  const busy = useRef(false);
  const failures = useRef(0);
  const done = useRef(false);
  const timer = useRef<number | null>(null);

  const stopAsking = useCallback(() => {
    if (timer.current !== null) window.clearInterval(timer.current);
    timer.current = null;
  }, []);

  const check = useCallback(async () => {
    if (busy.current || done.current) return;
    busy.current = true;
    try {
      const now = Date.now();
      const reconcile =
        now - started.current >= RECONCILE_AFTER_MS &&
        now - reconciled.current >= RECONCILE_EVERY_MS;
      if (reconcile) reconciled.current = now;
      const res = await fetch(`/api/setup/connected${reconcile ? "?reconcile=1" : ""}`, {
        cache: "no-store",
      });
      if (res.status === 401 || res.status === 403) {
        done.current = true;
        stopAsking();
        setTrouble("signedOut");
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      failures.current = 0;
      const body: unknown = await res.json();
      if (typeof body === "object" && body && "connected" in body && body.connected === true) {
        done.current = true;
        stopAsking();
        router.replace("/setup");
      }
    } catch {
      // A server error or offline: the next tick asks again, and after a few in a row it says so.
      failures.current += 1;
      if (failures.current >= FAIL_LIMIT) {
        stopAsking();
        setTrouble("offline");
      }
    } finally {
      busy.current = false;
    }
  }, [router, stopAsking]);

  useEffect(() => {
    if (!started.current) started.current = Date.now();
    if (done.current) return;
    const id = window.setInterval(check, EVERY_MS);
    timer.current = id;
    const onFocus = () => void check();
    window.addEventListener("focus", onFocus);
    const slowTimer = window.setTimeout(
      () => setSlow(true),
      Math.max(0, SLOW_MS - (Date.now() - started.current)),
    );
    const stop = window.setTimeout(() => window.clearInterval(id), STOP_MS);
    return () => {
      window.clearInterval(id);
      if (timer.current === id) timer.current = null;
      window.removeEventListener("focus", onFocus);
      window.clearTimeout(slowTimer);
      window.clearTimeout(stop);
    };
  }, [check, round]);

  const again = () => {
    failures.current = 0;
    setTrouble(null);
    void check();
    // Starts the 10 minutes of checking over.
    setRound((r) => r + 1);
  };

  return (
    <div className="flex flex-col gap-4" role="status" aria-live="polite">
      <div className="flex h-[132px] items-center justify-center gap-4" aria-hidden>
        <span className="shrink-0">{mark}</span>
        <span className="relative block h-10 w-[160px] shrink-0">
          <svg width="160" height="40" viewBox="0 0 160 40" className="absolute inset-0">
            <path
              d={FLIGHT}
              fill="none"
              stroke="var(--line-strong)"
              strokeWidth="2"
              strokeDasharray="4 5"
            />
          </svg>
          <span
            className="bee-carry"
            style={{
              width: 30,
              height: 20,
              margin: "-18px 0 0 -15px",
              offsetPath: `path("${FLIGHT}")`,
              animationDuration: "2.4s",
            }}
          >
            <svg width="30" height="20" viewBox="0 0 24 16">
              <BeeBody />
            </svg>
          </span>
        </span>
        <span className="bg-ink inline-flex size-[44px] shrink-0 items-center justify-center rounded-xl">
          <Mark size={30} />
        </span>
      </div>
      {trouble === "signedOut" ? (
        <>
          <ScreenTitle title="Your sign-in ended. Reload to keep going." />
          <Button
            type="button"
            variant="secondary"
            onClick={() => window.location.reload()}
            className="self-start"
          >
            Reload
          </Button>
        </>
      ) : trouble === "offline" ? (
        <>
          <ScreenTitle
            title="Waggle can’t check right now."
            sub={`Your ${label} account may already be connected. Nothing is lost.`}
          />
          <Button type="button" variant="secondary" onClick={again} className="self-start">
            Check again
          </Button>
        </>
      ) : slow ? (
        <>
          <ScreenTitle
            title="Still connecting"
            sub={`${label} can be slow. You can wait here or come back.`}
          />
          <Button type="button" variant="secondary" onClick={again} className="self-start">
            Check again
          </Button>
        </>
      ) : (
        <ScreenTitle title={`Connecting ${label}…`} sub="Usually a few seconds." />
      )}
    </div>
  );
}
