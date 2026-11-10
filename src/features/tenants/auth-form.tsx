"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { signIn, signUp, type AuthFormState } from "./actions";
import { PASSWORD_MIN } from "./password";

export function AuthForm({ mode, next }: { mode: "signup" | "login"; next?: string }) {
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(
    mode === "signup" ? signUp : signIn,
    {},
  );
  const isSignup = mode === "signup";

  return (
    <div className="card w-full max-w-md p-6 md:p-8">
      <div className="mb-6 flex flex-col gap-2">
        <h1 className="display-title">{isSignup ? "Create your Waggle login" : "Welcome back"}</h1>
        <p className="text-ink-2">
          {isSignup
            ? "Just you for now. You'll add your business, or join a team, next."
            : "Sign in to see what's waiting for you."}
        </p>
      </div>
      <form action={formAction} className="flex flex-col gap-4">
        {next && <input type="hidden" name="next" value={next} />}
        {isSignup && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="fullName" className="text-sm font-medium">
              Your name
            </label>
            <Input id="fullName" name="fullName" autoComplete="name" required maxLength={100} />
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="text-sm font-medium">
            Email
          </label>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="password" className="text-sm font-medium">
            Password
          </label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete={isSignup ? "new-password" : "current-password"}
            minLength={isSignup ? PASSWORD_MIN : undefined}
            aria-invalid={state.error ? true : undefined}
            aria-describedby={isSignup ? "password-hint" : undefined}
            required
          />
          {isSignup && (
            <p id="password-hint" className="text-ink-3 text-xs">
              At least {PASSWORD_MIN} characters.
            </p>
          )}
          {state.error && (
            <p role="alert" className="text-danger text-sm">
              {state.error}
            </p>
          )}
        </div>
        {state.message && (
          <p role="status" className="text-ink-2 text-sm">
            {state.message}
          </p>
        )}
        <Button type="submit" variant="primary" disabled={pending} className="w-full">
          {pending ? "Please wait…" : isSignup ? "Create login" : "Sign in"}
        </Button>
        <p className="text-ink-2 text-center text-sm">
          {isSignup ? (
            <>
              Already have an account?{" "}
              <Link href="/login" className="text-ink font-medium underline underline-offset-4">
                Sign in
              </Link>
            </>
          ) : (
            <>
              New here?{" "}
              <Link href="/signup" className="text-ink font-medium underline underline-offset-4">
                Create an account
              </Link>
            </>
          )}
        </p>
      </form>
    </div>
  );
}
