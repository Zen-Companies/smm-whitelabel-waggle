import * as Sentry from "@sentry/nextjs";
import { getSocialProvider } from "@/lib/social";
import type { CalendarEventSummary } from "@/lib/social/types";
import { getServiceClient } from "@/lib/supabase/service";
import { localParts } from "./busy";
import { calendarAccount } from "./data";

const DAY_MS = 24 * 60 * 60 * 1000;

/** "Your calendar · today" (design "Settings · Email and calendar"), when one is connected. */
export async function CalendarToday({ tenantId }: { tenantId: string }) {
  const account = await calendarAccount(getServiceClient(), tenantId);
  if (!account) return null;
  const now = new Date();
  let events: CalendarEventSummary[] = [];
  let failed = false;
  try {
    events = await getSocialProvider().listCalendarEvents({
      accountId: account.zernioAccountId,
      from: new Date(now.getTime() - 12 * 60 * 60 * 1000).toISOString(),
      to: new Date(now.getTime() + DAY_MS).toISOString(),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    Sentry.captureException(error, { extra: { tenantId, step: "calendarToday" } });
    failed = true;
  }
  // "Today" in the calendar's own offset.
  const offset = events[0] && !events[0].allDay ? localParts(events[0].start).offset : "+00:00";
  const sign = offset.startsWith("-") ? -1 : 1;
  const [h, m] = offset.slice(1).split(":").map(Number);
  const today = new Date(now.getTime() + sign * (h * 60 + m) * 60_000).toISOString().slice(0, 10);
  const todays = events.filter((e) => localParts(e.start).date === today);
  return (
    <section className="card flex flex-col gap-2 p-5" aria-labelledby="calendar-today">
      <h4 id="calendar-today" className="font-semibold">
        Your calendar · today
      </h4>
      <p className="meta">
        {account.platform === "google" ? "Google Calendar" : "Outlook calendar"}
      </p>
      {failed ? (
        <p className="text-ink-2 text-sm">Your calendar couldn&apos;t be read right now.</p>
      ) : todays.length ? (
        <ul className="flex flex-col gap-1 text-sm">
          {todays.map((e) => (
            <li key={e.id}>
              <span className="tabular-nums">
                {e.allDay ? "All day" : localParts(e.start).time}
              </span>{" "}
              · {e.title}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-ink-2 text-sm">Nothing booked today.</p>
      )}
      <p className="meta">
        Waggle checks your busy times when someone asks to book, and you add the booking once you
        confirm it.
      </p>
    </section>
  );
}
