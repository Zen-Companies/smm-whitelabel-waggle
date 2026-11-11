"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PASSWORD_MIN } from "./password";
import {
  chooseNewPassword,
  requestPasswordReset,
  type NewPasswordState,
  type ResetRequestState,
} from "./password-actions";

/** Forgot password (design v3 "Sign-in and account", AuthForgot): ask, then "Check your email". */
export function ForgotPasswordForm({ expired }: { expired: boolean }) {
  const [state, action, pending] = useActionState<ResetRequestState, FormData>(
    requestPasswordReset,
    {},
  );
  if (state.sent) {
    return (
      <div className="card w-full max-w-md p-6 md:p-8">
        <div className="flex flex-col gap-3">
          <h1 className="display-title">Check your email</h1>
          <p className="text-ink-2">
            If {state.sent} has a Waggle login, a reset link is on its way. It works for 1 hour.
          </p>
          <p className="text-ink-2 text-sm">Nothing came? Check spam, or ask again in a minute.</p>
          <Link href="/login" className="text-sm font-medium">
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }
  return (
    <div className="card w-full max-w-md p-6 md:p-8">
      <div className="mb-6 flex flex-col gap-2">
        <h1 className="display-title">
          {expired ? "This link has expired" : "Reset your password"}
        </h1>
        <p className="text-ink-2">
          {expired
            ? "Reset links work for 1 hour and only once. Ask for a new one."
            : "We'll email you a link to choose a new one."}
        </p>
      </div>
      <form action={action} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="text-sm font-medium">
            Email
          </label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            defaultValue={state.email}
            required
            aria-invalid={state.error ? true : undefined}
          />
          {state.error && (
            <p role="alert" className="text-danger text-sm">
              {state.error}
            </p>
          )}
        </div>
        <Button type="submit" variant="primary" disabled={pending} className="w-full">
          {pending ? "Sending…" : expired ? "Send a new link" : "Send reset link"}
        </Button>
        <Link href="/login" className="text-center text-sm font-medium">
          Back to sign in
        </Link>
      </form>
    </div>
  );
}

/** "Choose a new password", opened from the reset email. */
export function NewPasswordForm({ email }: { email: string }) {
  const [state, action, pending] = useActionState<NewPasswordState, FormData>(
    chooseNewPassword,
    {},
  );
  return (
    <div className="card w-full max-w-md p-6 md:p-8">
      <div className="mb-6 flex flex-col gap-2">
        <h1 className="display-title">Choose a new password</h1>
        <p className="text-ink-2">For {email}.</p>
      </div>
      <form action={action} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="password" className="text-sm font-medium">
            New password
          </label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={PASSWORD_MIN}
            required
            aria-invalid={state.error ? true : undefined}
            aria-describedby="password-hint"
          />
          <p id="password-hint" className="text-ink-3 text-xs">
            At least {PASSWORD_MIN} characters.
          </p>
          {state.error && (
            <p role="alert" className="text-danger text-sm">
              {state.error}
            </p>
          )}
        </div>
        <Button type="submit" variant="primary" disabled={pending} className="w-full">
          {pending ? "Saving…" : "Save and sign in"}
        </Button>
        <p className="text-ink-3 text-xs">
          Other devices stay signed in. To sign them out, use Settings → Account → Sign out
          everywhere.
        </p>
      </form>
    </div>
  );
}
