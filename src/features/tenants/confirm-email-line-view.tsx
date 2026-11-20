"use client";

import Link from "next/link";
import { useActionState } from "react";
import { settingsHref } from "@/lib/routes";
import { resendEmailConfirmation, type ResendState } from "./actions";

/** The quiet line on top until the email is confirmed (hotfix 21 Nov). Feedback in place. */
export function ConfirmEmailLineView({ email }: { email: string }) {
  const [state, action, pending] = useActionState<ResendState>(resendEmailConfirmation, {});
  return (
    <div
      role="status"
      className="border-honey-border bg-honey-tint flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-[13px]"
    >
      <span aria-hidden>✉️</span>
      <div className="min-w-0 flex-1">
        <b className="font-semibold">Confirm your email when you can.</b>{" "}
        <span className="text-ink-2">
          {state.sent ? "Sent again to " : "We sent a link to "}
          <b className="text-ink font-semibold break-all">{email}</b>.
        </span>{" "}
        {state.error && <span className="text-danger">{state.error} </span>}
        <form action={action} className="inline">
          <button
            type="submit"
            disabled={pending}
            className="font-semibold underline underline-offset-2 disabled:opacity-60"
          >
            {pending ? "Sending…" : "Send again"}
          </button>
        </form>
        {" · "}
        <Link href={settingsHref("account")} className="font-semibold">
          Wrong email?
        </Link>
      </div>
    </div>
  );
}
