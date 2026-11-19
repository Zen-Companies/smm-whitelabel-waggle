import { PlatformMark } from "@/components/app/platform-mark";
import { getCurrentTenant } from "@/features/tenants";
import { platformLabel } from "@/lib/social/platforms";
import { createServerSupabase } from "@/lib/supabase/server";
import { loadMissedMessages } from "./data";
import { messageAge } from "./rules";

/**
 * Inbox → messages too old to answer (approved 19 Nov). Read only: no draft, no send. The owner
 * answers them in the app itself, if at all.
 */
export async function MissedList() {
  const tenant = await getCurrentTenant();
  const supabase = await createServerSupabase();
  const messages = await loadMissedMessages(supabase, tenant.id);
  const now = new Date();
  const platforms = [...new Set(messages.map((m) => platformLabel(m.platform)))];
  const where = platforms.length ? platforms.join(" or ") : "Instagram";

  return (
    <section className="card p-6" aria-labelledby="missed-title">
      <h1 id="missed-title" className="section-title">
        {messages.length === 1
          ? "1 message too old to answer"
          : `${messages.length} messages too old to answer`}
      </h1>
      <p className="text-ink-3 mt-1 text-sm">
        Customers wrote these more than 24 hours before Waggle was connected.
      </p>

      {messages.length === 0 ? (
        <p className="text-ink-2 mt-4 text-sm">Nothing here. Waggle caught everything in time.</p>
      ) : (
        <ul className="mt-3 flex flex-col">
          {messages.map((m) => (
            <li
              key={m.id}
              className="border-line flex items-center gap-3.5 border-b py-3.5 last:border-b-0"
            >
              <PlatformMark platform={m.platform} size={32} />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-1.5 text-[15px] font-semibold">
                  {m.senderName ?? "Someone"}
                  <span className="bg-subtle text-ink-2 rounded-full px-2.5 py-0.5 text-xs font-semibold">
                    Too old to answer
                  </span>
                </span>
                <span className="text-ink-2 mt-1 block truncate text-sm">
                  {m.text.trim() ? `"${m.text}"` : "Sent something without words"}
                </span>
              </span>
              <span className="text-ink-3 shrink-0 text-[13px] tabular-nums">
                {messageAge(m.receivedAt, now)}
              </span>
            </li>
          ))}
        </ul>
      )}

      <p className="meta border-line mt-3 border-t pt-3">
        Read only. Open one in {where} to answer it yourself.
      </p>
    </section>
  );
}
