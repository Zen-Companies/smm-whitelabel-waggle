import { createServerSupabase, getCurrentUser } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";
import { isFrequency, type Frequency } from "./digest";
import { saveMyEmailFrequency, saveSiteEmailFrequency } from "./email-frequency-actions";
import { EmailFrequencyForm } from "./email-frequency-form";

async function siteDefault(): Promise<Frequency> {
  const { data } = await getServiceClient()
    .from("email_settings")
    .select("default_frequency")
    .eq("id", true)
    .maybeSingle();
  return isFrequency(data?.default_frequency) ? data.default_frequency : "hourly";
}

/**
 * Notifications (Settings → Tell me when). Email alerts to the person's login, right away or as
 * a summary every hour or two (design "Waggle emails", approved 18 Nov), and the in-app bell.
 */
export async function NotificationSettings() {
  const user = await getCurrentUser();
  const emailOn = !!process.env.RESEND_API_KEY && !!process.env.ALERT_FROM_EMAIL;
  const supabase = await createServerSupabase();
  const [{ data: mine }, fallback] = await Promise.all([
    supabase
      .from("notification_prefs")
      .select("email_frequency")
      .eq("user_id", user.id)
      .maybeSingle(),
    siteDefault(),
  ]);
  const current = isFrequency(mine?.email_frequency) ? mine.email_frequency : fallback;
  return (
    <section className="flex flex-col gap-4" aria-labelledby="notifications-heading">
      <div>
        <h2 id="notifications-heading" className="section-title">
          Notifications
        </h2>
        <p className="meta">How we tell you when something needs you.</p>
      </div>
      <ul className="card flex flex-col divide-y">
        <li className="flex flex-col gap-3 px-5 py-4">
          <span className="flex flex-col">
            <span className="font-medium">How often Waggle emails you</span>
            <span className="text-ink-2 text-sm">
              {emailOn
                ? `Leads, messages that need you and account problems go to ${user.email}.`
                : `Leads, messages that need you and account problems will go to ${user.email} once email is set up for this app.`}
            </span>
          </span>
          <EmailFrequencyForm
            initial={current}
            action={saveMyEmailFrequency}
            note="An account that stopped connecting always emails right away. A summary is one email per business, grouped by person; nothing new, no email."
          />
        </li>
        <li className="flex flex-col px-5 py-4">
          <span className="font-medium">In the app</span>
          <span className="text-ink-2 text-sm">
            The bell shows the same alerts right away, plus replies sent automatically and post
            updates.
          </span>
        </li>
      </ul>
    </section>
  );
}

/** Staff → Switches: the default for everyone who hasn't picked their own. */
export async function EmailDefaultSwitch() {
  const current = await siteDefault();
  return (
    <section className="card flex flex-col gap-3 px-5 py-4" aria-labelledby="email-default-heading">
      <div className="flex flex-col">
        <h2 id="email-default-heading" className="section-title">
          Email summaries: default for every business
        </h2>
        <p className="meta">How often Waggle emails people who haven&apos;t picked their own.</p>
      </div>
      <EmailFrequencyForm
        initial={current}
        action={saveSiteEmailFrequency}
        withLines={false}
        note="Applies to everyone who hasn't picked in Settings → Notifications. Changes are kept with who made them."
      />
    </section>
  );
}
