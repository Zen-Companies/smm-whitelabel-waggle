"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Brand } from "@/components/app/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { signIn, signUp, type AuthFormState } from "./actions";
import { GoogleButton, InAppGoogleGate, OrDivider } from "@/features/auth";
import { PASSWORD_MIN } from "./password";
import { PasswordInput } from "./password-input";

type FormState = AuthFormState & { values?: { fullName: string; email: string } };

const MISMATCH = "The passwords don't match";

/** Messages for `?error=` on the sign-in page (Google and email links come back with these). */
const LINK_ERRORS: Record<string, string> = {
  google_cancelled: "Google sign-in didn't finish. Try again, or use your email and password.",
  google: "We couldn't sign you in with Google just now. Try again in a minute.",
  confirm: "That confirmation link didn't work. It may be old or already used. Try signing in.",
};

/**
 * Sign in and sign up (design v3 "Sign-in and account", AuthLogin): Google first, then email and
 * password. The same email is the same login either way.
 */
export function AuthForm({
  mode,
  next,
  error,
}: {
  mode: "signup" | "login";
  next?: string;
  error?: string;
}) {
  // A failed submit resets the form (React 19), so the name and email come back as its defaults.
  // Passwords never travel back; a mismatch is caught here before submitting, so nothing clears.
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    async (prev, formData) => {
      const result = await (mode === "signup" ? signUp : signIn)(prev, formData);
      return result.error
        ? {
            ...result,
            values: {
              fullName: String(formData.get("fullName") ?? ""),
              email: String(formData.get("email") ?? ""),
            },
          }
        : result;
    },
    {},
  );
  const [mismatch, setMismatch] = useState(false);
  // The last submit's error goes once the form changes after it (it's about what was sent), and
  // comes back with the next submit's answer.
  const [edited, setEdited] = useState(false);
  const isSignup = mode === "signup";
  const formError = mismatch ? MISMATCH : edited ? undefined : state.error;

  return (
    <div className="card w-full max-w-[420px] rounded-3xl px-6 pt-8 pb-6 shadow-[0_24px_60px_rgba(60,40,0,0.12)] md:px-[34px] md:pt-9">
      <Brand />
      <div className="mt-6 mb-6 flex flex-col gap-2">
        <h1 className="display-title">
          {isSignup ? "Answer every message in about a minute, in your words" : "Welcome back"}
        </h1>
        <p className="text-ink-2">
          {isSignup
            ? "AI-assisted. You write the answers, you set the rules. Waggle gets them out fast."
            : "Your socials, handled. Sign in to see what Waggle answered while you were away."}
        </p>
      </div>
      {error && LINK_ERRORS[error] && (
        <p role="alert" className="danger-box mb-4">
          {LINK_ERRORS[error]}
        </p>
      )}
      <div className="mb-4 flex flex-col gap-4">
        {/* Inside TikTok's or Instagram's own browser Google blocks sign-in: say so instead (20 Nov). */}
        <InAppGoogleGate>
          <GoogleButton
            label={isSignup ? "Sign up with Google" : "Continue with Google"}
            next={next}
          />
          <OrDivider />
        </InAppGoogleGate>
      </div>
      <form
        action={formAction}
        onSubmit={(e) => {
          setEdited(false);
          if (!isSignup) return;
          const fd = new FormData(e.currentTarget);
          if (fd.get("password") !== fd.get("confirmPassword")) {
            e.preventDefault();
            setMismatch(true);
          }
        }}
        onChange={() => {
          if (mismatch) setMismatch(false);
          if (state.error) setEdited(true);
        }}
        className="flex flex-col gap-4"
      >
        {next && <input type="hidden" name="next" value={next} />}
        {isSignup && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="fullName" className="text-sm font-medium">
              Your name
            </label>
            <Input
              id="fullName"
              name="fullName"
              autoComplete="name"
              required
              maxLength={100}
              defaultValue={state.values?.fullName}
            />
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="text-sm font-medium">
            Email
          </label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            defaultValue={state.values?.email}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="flex items-baseline justify-between">
            <label htmlFor="password" className="text-sm font-medium">
              Password
            </label>
            {!isSignup && (
              <Link href="/forgot" className="text-sm font-medium">
                Forgot password?
              </Link>
            )}
          </span>
          <PasswordInput
            id="password"
            name="password"
            autoComplete={isSignup ? "new-password" : "current-password"}
            minLength={isSignup ? PASSWORD_MIN : undefined}
            aria-invalid={formError ? true : undefined}
            aria-describedby={isSignup ? "password-hint" : undefined}
            required
          />
          {isSignup && (
            <p id="password-hint" className="text-ink-3 text-xs">
              At least {PASSWORD_MIN} characters.
            </p>
          )}
          {isSignup && (
            <>
              <label htmlFor="confirmPassword" className="mt-2 text-sm font-medium">
                Confirm your password
              </label>
              <PasswordInput
                id="confirmPassword"
                name="confirmPassword"
                autoComplete="new-password"
                aria-invalid={formError ? true : undefined}
                required
              />
            </>
          )}
          {formError && (
            <p role="alert" className="text-danger text-sm">
              {formError}
            </p>
          )}
          {formError && !isSignup && (
            <p className="text-ink-3 text-xs">
              Signed up with Google? Use Continue with Google, or set a password with Forgot
              password.
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
        {isSignup && (
          <ol className="bg-subtle text-ink-2 flex flex-col gap-2 rounded-2xl px-4 py-3.5 text-[13px]">
            {[
              "Connect where customers message you",
              "Write your top 3 answers",
              "Choose Ask me first or Reply on its own",
            ].map((s, i) => (
              <li key={s} className="flex items-center gap-2.5">
                <b className="bg-honey inline-flex size-[22px] flex-none items-center justify-center rounded-full text-xs text-[#17140f]">
                  {i + 1}
                </b>
                {s}
              </li>
            ))}
          </ol>
        )}
        <p className="text-ink-3 text-center text-xs">
          By continuing you agree to the{" "}
          <a href="https://gowaggle.ai/terms" className="link-inline">
            Terms
          </a>{" "}
          and{" "}
          <a href="https://gowaggle.ai/privacy" className="link-inline">
            Privacy Policy
          </a>
          .
        </p>
        <p className="text-ink-2 text-center text-sm">
          {isSignup ? (
            <>
              Already have an account?{" "}
              <Link href="/login" className="link-inline">
                Sign in
              </Link>
            </>
          ) : (
            <>
              New to Waggle?{" "}
              <Link href="/signup" className="link-inline">
                Create an account
              </Link>
            </>
          )}
        </p>
      </form>
    </div>
  );
}
