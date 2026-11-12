"use client";

import Link from "next/link";
import { useActionState } from "react";
import { PlatformMark } from "@/components/app/platform-mark";
import { Button, buttonVariants } from "@/components/ui/button";
import { type BlueskyState, connectBluesky } from "./actions";

/** Settings → Accounts → Connect Bluesky, opened in place (design v3 "Platforms · Setup steps"). */
export function BlueskySetup() {
  const [state, action, pending] = useActionState<BlueskyState, FormData>(connectBluesky, {});
  return (
    <section
      id="setup"
      aria-labelledby="bluesky-setup"
      className="border-line bg-surface flex max-w-xl flex-col gap-3.5 rounded-2xl border p-5"
    >
      <div className="flex items-center gap-3">
        <PlatformMark platform="bluesky" size={40} />
        <h3 id="bluesky-setup" className="text-[17px] font-semibold">
          Connect Bluesky
        </h3>
      </div>
      <ol className="text-ink-2 flex list-decimal flex-col gap-1 pl-5">
        <li>In Bluesky, open Settings → Privacy and security → App passwords.</li>
        <li>Add one called “Waggle” and tick “Allow access to your direct messages”.</li>
        <li>Paste your handle and that app password here.</li>
      </ol>
      <form action={action} className="flex flex-col gap-3">
        <span className="flex flex-col gap-1.5">
          <label htmlFor="bluesky-handle" className="text-sm font-semibold">
            Handle
          </label>
          <input
            id="bluesky-handle"
            name="identifier"
            required
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="harbourbean.bsky.social"
            className="field"
          />
        </span>
        <span className="flex flex-col gap-1.5">
          <label htmlFor="bluesky-password" className="text-sm font-semibold">
            App password
          </label>
          <input
            id="bluesky-password"
            name="appPassword"
            type="password"
            required
            autoComplete="off"
            placeholder="xxxx-xxxx-xxxx-xxxx"
            className="field"
            aria-describedby="bluesky-password-hint"
          />
          <span id="bluesky-password-hint" className="text-ink-3 text-xs">
            Not your main password. You can revoke it in Bluesky any time.
          </span>
        </span>
        {state.error && (
          <p role="alert" className="text-danger text-sm">
            {state.error}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? "Connecting…" : "Connect Bluesky"}
          </Button>
          <Link href="/settings?section=accounts" className={buttonVariants({ variant: "ghost" })}>
            Cancel
          </Link>
        </div>
      </form>
    </section>
  );
}
