import { z } from "zod";

// Owner emails (PRD F11/F12) go through Resend's REST API: POST https://api.resend.com/emails
// { from, to, subject, text, html } with an Idempotency-Key (24 h) → { id }.
// Without RESEND_API_KEY + ALERT_FROM_EMAIL, and always under Vitest, alerts are logged instead
// (or, locally with MAILPIT_URL, caught by Mailpit).

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

const mailpitSentSchema = z.object({ ID: z.string().min(1) });

/**
 * Local development only: Mailpit (bundled with `supabase start`, http://127.0.0.1:55324)
 * catches the email through its send API, `POST /api/v1/send`, so invites and alerts can be
 * opened and clicked in its inbox. Nothing leaves the machine.
 */
export function createMailpitMailer(opts: {
  url: string;
  from: string;
  fetch?: typeof fetch;
}): Mailer {
  const doFetch = opts.fetch ?? fetch;
  return {
    async send(email, options) {
      const res = await doFetch(`${opts.url.replace(/\/$/, "")}/api/v1/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          From: { Email: opts.from },
          To: email.to.map((Email) => ({ Email })),
          Subject: email.subject,
          Text: email.text,
          HTML: email.html,
          Headers: { "X-Idempotency-Key": email.idempotencyKey },
        }),
        signal: options?.signal ?? AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new MailerError(`Mailpit send failed (${res.status})`, res.status);
      const parsed = mailpitSentSchema.safeParse(await res.json().catch(() => null));
      if (!parsed.success) throw new MailerError("Mailpit send: unexpected response shape");
      return { providerId: parsed.data.ID, mode: "sent" };
    },
  };
}

/**
 * Resend when it's configured; else Mailpit when MAILPIT_URL is set (local only, never on a
 * Vercel deployment); else log. Always log under Vitest.
 */
export function getMailer(env: Record<string, string | undefined> = process.env): Mailer {
  if (env.VITEST) return logMailer;
  if (env.RESEND_API_KEY && env.ALERT_FROM_EMAIL) {
    return createResendMailer({ apiKey: env.RESEND_API_KEY, from: env.ALERT_FROM_EMAIL });
  }
  if (env.MAILPIT_URL && !env.VERCEL) {
    return createMailpitMailer({
      url: env.MAILPIT_URL,
      from: env.ALERT_FROM_EMAIL || "waggle@localhost",
    });
  }
  return logMailer;
}
