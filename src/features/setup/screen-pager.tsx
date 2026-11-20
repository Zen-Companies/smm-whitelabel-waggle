"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { goToSetupScreen, saveSetupScreen } from "./actions";
import { isSetupScreen, type SetupScreen } from "./flow";

// Next and Back in setup (21 Nov, "each Next takes 6–10 s"). Step 2's screens (what you missed,
// what they wanted, Waggle's replies) only show data the page already loaded, so they all render
// at once and the pager switches between them in place: instant, the URL follows, the screen is
// saved in the background. Any other move (into step 3, inside it) goes to the server as before,
// and its button says "Loading…" until the next screen opens.

type Pager = { has: (s: SetupScreen) => boolean; go: (s: SetupScreen) => void };
const PagerContext = createContext<Pager | null>(null);

const screenInUrl = (): string | null =>
  new URLSearchParams(window.location.search).get("screen");

export function ScreenPager({
  initial,
  panels,
}: {
  initial: SetupScreen;
  panels: { screen: SetupScreen; node: ReactNode }[];
}) {
  const [current, setCurrent] = useState(initial);
  const has = (s: SetupScreen) => panels.some((p) => p.screen === s);

  // The phone's back button walks the screens too.
  useEffect(() => {
    const onPop = () => {
      const s = screenInUrl();
      if (isSetupScreen(s) && panels.some((p) => p.screen === s)) setCurrent(s);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [panels]);

  const go = (s: SetupScreen) => {
    setCurrent(s);
    window.history.pushState(null, "", `/setup?screen=${s}`);
    window.scrollTo({ top: 0 });
    // Remembered for "reopen where I left off"; nothing on screen waits for it.
    void saveSetupScreen(s).catch(() => undefined);
  };

  return (
    <PagerContext.Provider value={{ has, go }}>
      {panels.find((p) => p.screen === current)?.node}
    </PagerContext.Provider>
  );
}

function MoveButton({ className, children }: { className: string; children: ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending} aria-busy={pending}>
      {pending ? "Loading…" : children}
    </button>
  );
}

/**
 * A setup move (Next, Back). Inside the pager it switches in place; otherwise it's a form that
 * remembers the screen and opens it (no prefetch can move anyone), saying "Loading…" meanwhile.
 */
export function ScreenButton({
  to,
  className,
  children,
}: {
  to: SetupScreen;
  className: string;
  children: ReactNode;
}) {
  const pager = useContext(PagerContext);
  if (pager?.has(to)) {
    return (
      <button type="button" className={className} onClick={() => pager.go(to)}>
        {children}
      </button>
    );
  }
  return (
    <form action={goToSetupScreen} className="contents">
      <input type="hidden" name="screen" value={to} />
      <MoveButton className={className}>{children}</MoveButton>
    </form>
  );
}
