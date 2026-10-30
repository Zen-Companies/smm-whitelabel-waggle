import { getCurrentUser } from "@/lib/supabase/server";

/**
 * Notifications (Settings). Pass 1: email alerts to the owner's login and the in-app bell.
 * Per-event channels, quiet hours and phone push are out of scope (docs/design.md §5).
 */
export async function NotificationSettings() {
  const user = await getCurrentUser();
  const emailOn = !!process.env.RESEND_API_KEY && !!process.env.ALERT_FROM_EMAIL;
  return (
    <section className="flex flex-col gap-4" aria-labelledby="notifications-heading">
      <div>
        <h2 id="notifications-heading" className="section-title">
          Notifications
        </h2>
        <p className="meta">How we tell you when something needs you.</p>
      </div>
      <ul className="card flex flex-col divide-y">
        <li className="flex flex-col px-5 py-4">
          <span className="font-medium">Email</span>
          <span className="text-wax-muted text-sm">
            {emailOn
              ? `Leads, messages that need you and account problems go to ${user.email}.`
              : `Leads, messages that need you and account problems will go to ${user.email} once email is set up for this app.`}
          </span>
        </li>
        <li className="flex flex-col px-5 py-4">
          <span className="font-medium">In the app</span>
          <span className="text-wax-muted text-sm">
            The bell shows the same alerts, plus replies sent automatically and post updates.
          </span>
        </li>
      </ul>
    </section>
  );
}
