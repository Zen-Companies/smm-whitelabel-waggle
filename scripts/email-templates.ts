/**
 * Writes Supabase's sign-in email templates (supabase/templates) in the same frame as every
 * Waggle email (design "Waggle emails", approved 18 Nov). Run after changing the frame:
 *   pnpm tsx scripts/email-templates.ts
 * Production: paste each file into Supabase → Authentication → Email templates.
 */
import { writeFileSync } from "node:fs";
import { brandedEmail, honeyButton, paragraph } from "../src/lib/email/frame";

const confirm = (type: string) =>
  `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=${type}`;

const templates: Record<string, Parameters<typeof brandedEmail>[0]> = {
  confirmation: {
    title: "Confirm your email",
    bodyHtml:
      paragraph("One click and your Waggle login is ready.") +
      `<div style="margin:0 0 16px">${honeyButton(confirm("signup"), "Confirm my email")}</div>` +
      paragraph("This link works for 1 hour. Didn't sign up for Waggle? Ignore this email.", {
        muted: true,
      }),
    because: "signing up for Waggle",
  },
  recovery: {
    title: "Choose a new password",
    bodyHtml:
      paragraph("Someone (hopefully you) asked to reset the password for {{ .Email }}.") +
      `<div style="margin:0 0 16px">${honeyButton(confirm("recovery"), "Choose a new password")}</div>` +
      paragraph(
        "This link works for 1 hour and only once. Didn't ask? Ignore this email; your password stays the same.",
        { muted: true },
      ),
    because: "using Waggle",
  },
  email_change: {
    title: "Confirm your new email",
    bodyHtml:
      paragraph("Confirm that {{ .NewEmail }} should be the email for your Waggle login.") +
      `<div style="margin:0 0 16px">${honeyButton(confirm("email_change"), "Confirm new email")}</div>` +
      paragraph("Didn't ask for this? Ignore this email; nothing changes.", { muted: true }),
    because: "using Waggle",
  },
};

for (const [name, input] of Object.entries(templates)) {
  // Supabase fills {{ … }}: keep the link's & as is inside the template tags.
  const html = brandedEmail(input).replaceAll("&amp;type=", "&type=");
  writeFileSync(`supabase/templates/${name}.html`, html + "\n");
  console.log(`supabase/templates/${name}.html`);
}
