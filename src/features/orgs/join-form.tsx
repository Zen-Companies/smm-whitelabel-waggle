"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { signUpAndJoin, type JoinSignUpState } from "./join-actions";

/** "Create your login to join" (design OrgInviteJoin): the invited email is shown, locked. */
export function JoinSignUpForm({ token, email }: { token: string; email: string }) {
  const [state, action, pending] = useActionState<JoinSignUpState, FormData>(signUpAndJoin, {});
  if (state.message) {
    return (
      <p role="status" className="text-ink-2">
        {state.message}
      </p>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="join-name" className="text-sm font-semibold">
          Your name
        </label>
        <input
          id="join-name"
          name="fullName"
          required
          maxLength={100}
          autoComplete="name"
          defaultValue={state.fullName}
          className="field"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="join-email" className="text-sm font-semibold">
          Email
        </label>
        <span className="relative flex">
          <input
            id="join-email"
            value={email}
            readOnly
            aria-readonly
            aria-describedby="join-email-hint"
            className="field bg-subtle/60 text-ink-2 pr-9"
          />
          <Lock
            className="text-ink-3 absolute top-1/2 right-3 size-3.5 -translate-y-1/2"
            aria-hidden
          />
        </span>
        <span id="join-email-hint" className="meta">
          The invite is for this address. Need a different one? Ask whoever invited you.
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="join-password" className="text-sm font-semibold">
          Password
        </label>
        <input
          id="join-password"
          name="password"
          type="password"
          required
          minLength={10}
          autoComplete="new-password"
          aria-invalid={state.error ? true : undefined}
          className="field"
        />
        <span className="meta">At least 10 characters.</span>
      </div>
      {state.error && (
        <p role="alert" className="text-danger text-sm">
          {state.error}
        </p>
      )}
      <Button type="submit" variant="primary" disabled={pending} data-busy={pending || undefined}>
        {pending ? "Creating…" : "Create login and join"}
      </Button>
      <span className="text-ink-2 text-sm">
        Already have a Waggle login with this email?{" "}
        <Link
          href={`/login?next=${encodeURIComponent(`/invite/${token}`)}`}
          className="font-medium"
        >
          Sign in to join
        </Link>
      </span>
    </form>
  );
}
