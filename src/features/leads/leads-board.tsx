import Link from "next/link";
import { PlatformMark } from "@/components/app/platform-mark";
import { shortTime } from "@/components/app/time";
import { buttonVariants } from "@/components/ui/button";
import { can } from "@/features/orgs";
import { getCurrentTenant } from "@/features/tenants";
import { createServerSupabase } from "@/lib/supabase/server";
import { loadBoardLeads } from "./data";
import { LEAD_STAGES, moveLabel, nextLine, nextStage } from "./lead-stage";
import { MoveLeadButton } from "./move-lead-button";

/**
 * Leads (T74d, design "4 · Leads"): everyone who asked to book or buy, on a board: New, Talking,
 * Booked, Done. Each card: who, when, what they want, their words, what's next, Open chat and one
 * move. Download list; Send to my CRM is held (HubSpot can't be whitelabeled yet).
 */
export async function LeadsBoard() {
  const tenant = await getCurrentTenant();
  const supabase = await createServerSupabase();
  const leads = await loadBoardLeads(supabase, tenant.id);
  const canMove = can(tenant.role, "replies.approve");

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">Leads</h1>
          <p className="text-ink-2 mt-1">
            Everyone who asked to book, buy or sell. Each one is also emailed to you.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {leads.length > 0 && (
            <a href="/leads/export" className={buttonVariants({ variant: "secondary" })} download>
              Download list
            </a>
          )}
          <span className="text-ink-3 flex min-h-11 items-center px-2 text-sm">
            Send to my CRM · Coming soon
          </span>
        </div>
      </header>
      {leads.length === 0 ? (
        <p className="card text-ink-2 p-6">
          No leads yet. When someone asks to book or buy, Waggle saves them here and emails you.
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {LEAD_STAGES.map((col) => {
            const list = leads.filter((l) => l.stage === col.key);
            return (
              <section
                key={col.key}
                aria-labelledby={`col-${col.key}`}
                className="bg-subtle flex min-w-0 flex-col gap-3 rounded-2xl p-3"
              >
                <div className="px-1">
                  <h2 id={`col-${col.key}`} className="flex items-center gap-2 font-semibold">
                    {col.title}
                    <span className="bg-surface text-ink-2 rounded-full px-2 text-xs">
                      {list.length}
                    </span>
                  </h2>
                  <p className="text-ink-3 text-[13px]">{col.hint}</p>
                </div>
                {list.map((l) => {
                  const next = nextLine(l.itemStatus);
                  return (
                    <article key={l.id} className="card flex flex-col gap-2 p-3.5">
                      <div className="flex items-center gap-2">
                        {l.platform && <PlatformMark platform={l.platform} size={22} />}
                        <b className="min-w-0 flex-1 truncate font-semibold">{l.name}</b>
                        <span className="text-ink-3 shrink-0 text-xs">
                          {shortTime(l.createdAt)}
                        </span>
                      </div>
                      {l.wants && <p className="text-sm font-medium">{l.wants}</p>}
                      {l.quote.trim() && (
                        <p className="text-ink-2 line-clamp-2 text-sm">&ldquo;{l.quote}&rdquo;</p>
                      )}
                      {next && <p className="text-honey-text text-[13px] font-medium">{next}</p>}
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <Link
                          href={`/inbox/items/${l.itemId}`}
                          className="text-ink text-sm font-medium underline"
                        >
                          Open chat
                        </Link>
                        {canMove && (
                          <MoveLeadButton
                            leadId={l.id}
                            stage={nextStage(l.stage)}
                            label={moveLabel(l.stage)}
                          />
                        )}
                      </div>
                    </article>
                  );
                })}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
