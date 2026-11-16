import type { ReactNode } from "react";
import { AuthWall } from "./auth-wall";

/**
 * Sign in and sign up (client redesign "0 · Sign in"): the moving wall on the left, the card on
 * the right. On a desktop it fills the screen exactly and the page never scrolls; if a very short
 * window can't fit the card, only the card's column scrolls. Phones get the card alone.
 */
export function AuthSplit({ kind, children }: { kind: "signin" | "signup"; children: ReactNode }) {
  return (
    <div className="grid flex-1 lg:h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(400px,520px)] lg:grid-rows-[minmax(0,1fr)] lg:overflow-hidden">
      <div className="relative hidden h-dvh overflow-hidden lg:block">
        <AuthWall kind={kind} />
      </div>
      <div className="flex min-h-0 flex-col items-center px-4 py-10 lg:h-dvh lg:overflow-y-auto lg:overscroll-contain lg:px-10 lg:py-6">
        <div className="my-auto flex w-full justify-center">{children}</div>
      </div>
    </div>
  );
}
