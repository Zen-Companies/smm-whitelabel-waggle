import "server-only";
import { getMailer } from "@/lib/email/mailer";
import { hashConfirmToken, newConfirmToken } from "@/lib/email/confirmations";
import { brandedEmail, honeyButton, paragraph } from "@/lib/email/frame";
import type { ServiceClient } from "@/lib/supabase/service";

// Confirm later (hotfix, approved 21 Nov, canvas "Sign up without waiting for the email"): the
// email Waggle sends after an email signup, "Send again", and opening the link.

/** "Send again" works once a minute. */
export const RESEND_AFTER_MS = 60 * 1000;

/** Pure: the confirm email. */
export function confirmEmail(input: { name: string | null; link: string }): {
  subject: string;
  text: string;
  html: string;
} {
  const hi = input.name ? `Hi ${input.name.split(" ")[0]},` : "Hi,";
  const lead = "Tap the button to confirm this is your email. You can keep using Waggle meanwhile.";
  const why = "Until it's confirmed, team invites and Waggle's emails to you wait.";
  const fine = "Didn't sign up for Waggle? Ignore this email.";
  return {
    subject: "Confirm your email for Waggle",
    text: [hi, "", lead, why, "", `Confirm my email: ${input.link}`, "", fine].join("\n"),
    html: brandedEmail({
      eyebrow: { text: "One quick thing", tone: "honey" },
      title: "Confirm your email",
      bodyHtml:
        paragraph(`${hi} ${lead}`) +
        paragraph(why) +
        `<div style="margin:0 0 16px">${honeyButton(input.link, "Confirm my email")}</div>` +
        paragraph(fine, { muted: true }),
      because: "signed up for Waggle",
      preheader: lead,
    }),
  };
}

/** Stores a new link for this person and emails it (signup, "Send again", a changed email). */
export async function sendEmailConfirmation(
  db: ServiceClient,
  user: { id: string; email: string; name: string | null },
): Promise<void> {
  const { token, hash } = newConfirmToken();
  const { error } = await db.from("email_confirmations").upsert({
    user_id: user.id,
    email: user.email,
    token_hash: hash,
    sent_at: new Date().toISOString(),
    confirmed_at: null,
  });
  if (error) throw new Error(`email confirmation save failed: ${error.message}`);
  const link = `${process.env.APP_URL ?? ""}/auth/email-confirmed?token=${encodeURIComponent(token)}`;
  await getMailer().send({
    ...confirmEmail({ name: user.name, link }),
    to: [user.email],
    idempotencyKey: `email-confirm-${hash.slice(0, 24)}`,
  });
}

/** Whether this person still has to confirm, and the address the link went to. */
export async function emailConfirmState(
  db: ServiceClient,
  userId: string,
): Promise<{ pending: boolean; email: string | null; sentAt: string | null }> {
  const { data } = await db
    .from("email_confirmations")
    .select("email, sent_at, confirmed_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data || data.confirmed_at) return { pending: false, email: null, sentAt: null };
  return { pending: true, email: data.email, sentAt: data.sent_at };
}

/** Opening the link: confirms when the token is current. Works without being signed in. */
export async function confirmEmailToken(
  db: ServiceClient,
  token: string,
): Promise<"confirmed" | "already" | "invalid"> {
  if (!token || token.length > 200) return "invalid";
  const { data } = await db
    .from("email_confirmations")
    .select("user_id, confirmed_at")
    .eq("token_hash", hashConfirmToken(token))
    .maybeSingle();
  if (!data) return "invalid";
  if (data.confirmed_at) return "already";
  const { error } = await db
    .from("email_confirmations")
    .update({ confirmed_at: new Date().toISOString() })
    .eq("user_id", data.user_id)
    .is("confirmed_at", null);
  if (error) throw new Error(`email confirm failed: ${error.message}`);
  return "confirmed";
}
