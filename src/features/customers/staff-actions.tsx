"use client";

import { Check, ExternalLink } from "lucide-react";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { logCustomerAction, resendConfirmEmail, type ResendState } from "./actions";

// Staff → Customers, "Staff actions" (each one logged). Feedback in place, no toasts (design §4).

export function CopyEmail({ tenantId, email }: { tenantId: string; email: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(email);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        void logCustomerAction({ tenantId, action: "copied_email" });
      }}
    >
      {copied ? (
        <>
          <Check className="text-success size-4" strokeWidth={2.5} aria-hidden /> Copied
        </>
      ) : (
        "Copy owner email"
      )}
    </Button>
  );
}

export function LoggedLink({
  tenantId,
  action,
  href,
  children,
}: {
  tenantId: string;
  action: "opened_stripe" | "opened_ghl";
  href: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => void logCustomerAction({ tenantId, action })}
      className="border-line-strong bg-surface text-ink hover:bg-subtle inline-flex min-h-10 items-center gap-2 rounded-md border px-3.5 text-sm font-medium"
    >
      {children}
      <ExternalLink className="size-3.5" aria-hidden />
    </a>
  );
}

export function ResendConfirm({
  tenantId,
  email,
  lastSentAt,
}: {
  tenantId: string;
  email: string;
  lastSentAt: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ResendState, FormData>(resendConfirmEmail, {});
  const time = (iso: string) =>
    new Date(iso).toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "UTC",
    }) + " UTC";

  if (state.sentAt) {
    return (
      <p
        role="status"
        className="border-line bg-success-soft flex items-start gap-2 rounded-xl border p-3"
      >
        <Check className="text-success mt-0.5 size-4 shrink-0" strokeWidth={2.5} aria-hidden />
        <span>
          <b className="font-semibold">Sent {time(state.sentAt)}</b>
          <br />
          <span className="text-ink-2">Confirm email sent again. Logged with your name.</span>
        </span>
      </p>
    );
  }
  if (!open) {
    return (
      <Button type="button" onClick={() => setOpen(true)} className="self-start">
        Resend confirm email
      </Button>
    );
  }
  return (
    <form action={action} className="border-line-strong flex flex-col gap-3 rounded-xl border p-4">
      <input type="hidden" name="tenantId" value={tenantId} />
      <p>
        Send the confirm email again to <b className="font-semibold">{email}</b>?
        <br />
        <span className="text-ink-2">Last one went out {time(lastSentAt)}.</span>
      </p>
      {state.error && (
        <p role="alert" className="text-danger">
          {state.error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" variant="ink" disabled={pending}>
          {pending ? "Sending…" : "Send it"}
        </Button>
        <Button type="button" variant="quiet" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
