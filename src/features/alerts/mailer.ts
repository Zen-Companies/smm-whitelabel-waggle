import { z } from "zod";

// Owner emails (PRD F11/F12) go through Resend's REST API: POST https://api.resend.com/emails
// { from, to, subject, text, html } with an Idempotency-Key (24 h) → { id }.
// Without RESEND_API_KEY + ALERT_FROM_EMAIL, and always under Vitest, alerts are logged instead.

export interface Email {
  to: string[];
  subject: string;
  text: string;
  html: string;
  /** The alert id: a retry after a lost response doesn't send twice. */
  idempotencyKey: string;
}

export interface Mailer {
  /** "logged" when nothing was sent (no Resend configured). */
  send(
    email: Email,
    options?: { signal?: AbortSignal },
  ): Promise<{ providerId: string | null; mode: "sent" | "logged" }>;
}

export class MailerError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "MailerError";
  }
}

const RESEND_URL = "https://api.resend.com/emails";
const sentSchema = z.object({ id: z.string().min(1) });

export function createResendMailer(opts: {
  apiKey: string;
  from: string;
  fetch?: typeof fetch;
}): Mailer {
  const doFetch = opts.fetch ?? fetch;
  return {
    async send(email, options) {
      const res = await doFetch(RESEND_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${opts.apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": email.idempotencyKey,
        },
        body: JSON.stringify({
          from: opts.from,
          to: email.to,
          subject: email.subject,
          text: email.text,
          html: email.html,
        }),
        signal: options?.signal ?? AbortSignal.timeout(20_000),
      });
      // Status only: the body may echo addresses.
      if (!res.ok) throw new MailerError(`Resend send failed (${res.status})`, res.status);
      const parsed = sentSchema.safeParse(await res.json().catch(() => null));
      if (!parsed.success) throw new MailerError("Resend send: unexpected response shape");
      return { providerId: parsed.data.id, mode: "sent" };
    },
  };
}

/** Logs that an alert would have gone out: ids and counts only, no addresses or content. */
export const logMailer: Mailer = {
  async send(email) {
    console.info(
      `[alerts] RESEND_API_KEY not set: alert ${email.idempotencyKey} logged, not emailed (${email.to.length} recipient(s))`,
    );
    return { providerId: null, mode: "logged" };
  },
};

export function getMailer(env: Record<string, string | undefined> = process.env): Mailer {
  if (env.VITEST || !env.RESEND_API_KEY || !env.ALERT_FROM_EMAIL) return logMailer;
  return createResendMailer({ apiKey: env.RESEND_API_KEY, from: env.ALERT_FROM_EMAIL });
}
