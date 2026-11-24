"use client";

import { Mail } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";
import { settingsHref } from "@/lib/routes";
import { resendEmailConfirmation, type ResendState } from "./actions";

/**
 * The line on top until the email is confirmed (hotfix 21 Nov; restyled 24 Nov as the app's
 * standard banner: icon, message, actions on the right). Feedback in place, no toasts.
 */
export function ConfirmEmailLineView({ email }: { email: string }) {
  const [state, action, pending] = useActionState<ResendState>(resendEmailConfirmation, {});
  return (
    <div role="status" className="banner text-[13.5px]">
      <Mail className="size-[18px] shrink-0" strokeWidth={1.75} aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <b className="font-semibold">Confirm your email</b>
        <span className="text-ink-2">
          {state.sent ? "We sent a new link to " : "We sent a link to "}
          <b className="text-ink font-semibold break-all">{email}</b>. Open it to keep getting
          Waggle&apos;s emails.
        </span>
        {state.error && <span className="text-danger text-[12.5px]">{state.error}</span>}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <form action={action}>
          <button
            type="submit"
            disabled={pending || state.sent}
            className="border-line bg-surface hover:border-honey inline-flex min-h-9 items-center rounded-lg border px-3 text-[13px] font-semibold disabled:opacity-60"
          >
            {pending ? "Sending…" : state.sent ? "Sent" : "Send again"}
          </button>
        </form>
        <Link href={settingsHref("account")} className="text-ink-2 text-[13px] font-semibold">
          Change email
        </Link>
      </div>
    </div>
  );
}
