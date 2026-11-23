"use client";

import Link from "next/link";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

// Setup's way out (Finish later) can be held by a screen while leaving would lose something: the
// batch screen holds it during "Sending… Undo", so the send isn't dropped by a click away.

const WayOutContext = createContext<{ held: boolean; hold: (on: boolean) => void } | null>(null);

export function WayOutProvider({ children }: { children: ReactNode }) {
  const [held, hold] = useState(false);
  return <WayOutContext.Provider value={{ held, hold }}>{children}</WayOutContext.Provider>;
}

/** Hides Finish later while `on` (and gives it back when the screen goes). */
export function useHoldWayOut(on: boolean): void {
  const hold = useContext(WayOutContext)?.hold;
  useEffect(() => {
    if (!hold) return;
    hold(on);
    return () => hold(false);
  }, [hold, on]);
}

export function FinishLater() {
  if (useContext(WayOutContext)?.held) return null;
  return (
    <Link href="/today" className="text-ink-3 hover:text-ink text-[12.5px] no-underline">
      Finish later
    </Link>
  );
}
