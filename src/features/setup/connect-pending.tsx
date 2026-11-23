"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { cn } from "cn";
import { BeeBody } from "@/components/app/bee";

// Setup step 1 (board "Setup, start to finish", approved 23 Nov): after a tap, the tile or button
// shows the bee and "Opening Instagram…" until the browser leaves for the sign-in.

function Opening({ platform }: { platform: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="bee-bob inline-block" aria-hidden>
        <svg width="22" height="15" viewBox="0 0 24 16">
          <BeeBody />
        </svg>
      </span>
      Opening {platform}…
    </span>
  );
}

/** A Connect tile's submit button: its contents, or the bee and "Opening …" while it goes. */
export function ConnectTileSubmit({
  platform,
  className,
  children,
}: {
  platform: string;
  className?: string;
  children: ReactNode;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      aria-label={`Connect ${platform}`}
      aria-busy={pending || undefined}
      disabled={pending}
      className={cn(className, pending && "border-honey bg-honey-tint justify-center")}
    >
      {pending ? (
        <span className="text-[15px] font-semibold" role="status">
          <Opening platform={platform} />
        </span>
      ) : (
        children
      )}
    </button>
  );
}

/** A primary button ("Continue to Instagram", "Try again") that shows the bee while it goes. */
export function ConnectSubmit({
  platform,
  className,
  children,
}: {
  platform: string;
  className?: string;
  children: ReactNode;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending || undefined}
      className={cn(className, "disabled:opacity-100")}
    >
      {pending ? <Opening platform={platform} /> : children}
    </button>
  );
}
