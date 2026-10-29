import { CircleCheck, Clock3 } from "lucide-react";
import Link from "next/link";
import { Avatar } from "@/components/app/avatar";
import { IllustratedEmpty } from "@/components/app/illustrated-empty";
import { platformName, shortTime } from "@/components/app/time";
import { buttonVariants } from "@/components/ui/button";
import { getCurrentTenant } from "@/features/tenants";
import { createServerSupabase } from "@/lib/supabase/server";
import { cn } from "cn";
import { CopyButton } from "./copy-button";
import { leadReplied, leadStatusText, phoneHref } from "./lead-status";

// Leads the receptionist captured (PRD F12), design v2: a table, because leads are compared,
// and the selected lead on the right with contact actions. Coral = a lead (docs/design.md §1).

type Filter = "all" | "open";
type Lead = {
  id: string;
  created_at: string;
  name: string | null;
  contact: string | null;
  request: string | null;
  item_id: string;
  inbound_items: {
    kind: "comment" | "dm";
    status: string;
    text: string;
    author_name: string | null;
    social_accounts: { platform: string } | null;
  } | null;
};

function href(filter: Filter, lead?: string) {
  const q = new URLSearchParams();
  if (filter === "open") q.set("filter", "open");
  if (lead) q.set("lead", lead);
  const s = q.toString();
  return s ? `/leads?${s}` : "/leads";
}

const source = (l: Lead) =>
  `${platformName(l.inbound_items?.social_accounts?.platform)} ${l.inbound_items?.kind === "dm" ? "DM" : "comment"}`;

const leadName = (l: Lead) => l.name ?? l.inbound_items?.author_name ?? "No name given";

function Status({ status }: { status: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      {leadReplied(status) ? (
        <CircleCheck className="text-success size-4" strokeWidth={1.75} aria-hidden />
      ) : (
        <Clock3 className="size-4" strokeWidth={1.75} aria-hidden />
      )}
      {leadStatusText(status)}
    </span>
  );
}

function LeadDetail({ lead }: { lead: Lead }) {
  const tel = phoneHref(lead.contact);
  return (
    <aside aria-label="Lead details" className="card flex flex-col gap-4 p-5">
      <div className="flex items-center gap-3">
        <Avatar size={44} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-semibold">{leadName(lead)}</span>
          <span className="meta">{source(lead)}</span>
        </span>
        <span className="chip-lead">Lead</span>
      </div>
      <section className="flex flex-col gap-2">
        <h2 className="meta">Contact</h2>
        <p>{lead.contact ?? "Not given"}</p>
        {lead.contact && (
          <div className="flex flex-wrap gap-2">
            <CopyButton text={lead.contact} label={tel ? "Copy number" : "Copy contact"} />
            {tel && (
              <a href={tel} className={buttonVariants({ variant: "secondary" })}>
                Call
              </a>
            )}
          </div>
        )}
      </section>
      <section className="flex flex-col gap-1.5">
        <h2 className="meta">Wants</h2>
        <p>{lead.request ?? "No request captured"}</p>
      </section>
      {lead.inbound_items && (
        <section className="flex flex-col gap-1.5">
          <h2 className="meta">Latest message</h2>
          <p className="rounded-xl bg-gray-50 px-3.5 py-2.5 whitespace-pre-wrap">
            {lead.inbound_items.text || "(no text)"}
          </p>
          <span className="meta">
            <Status status={lead.inbound_items.status} />
          </span>
        </section>
      )}
      <Link
        href={`/inbox/items/${lead.item_id}`}
        className={buttonVariants({ variant: "primary" })}
      >
        Open in inbox
      </Link>
    </aside>
  );
}

export async function LeadsList({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const filter: Filter = params.filter === "open" ? "open" : "all";
  const leadParam = typeof params.lead === "string" ? params.lead : undefined;
  const tenant = await getCurrentTenant();
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("leads")
    .select(
      "id, created_at, name, contact, request, item_id, " +
        "inbound_items (kind, status, text, author_name, social_accounts (platform))",
    )
    .eq("tenant_id", tenant.id)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(`leads load failed: ${error.message}`);
  const all = (data ?? []) as unknown as Lead[];
  const open = all.filter((l) => !leadReplied(l.inbound_items?.status ?? ""));
  const leads = filter === "open" ? open : all;
  const selected = leads.find((l) => l.id === leadParam) ?? leads[0];

  const header = (
    <header className="flex flex-wrap items-center gap-x-6 gap-y-3">
      <h1 className="page-title">Leads</h1>
      {all.length > 0 && (
        <nav aria-label="Lead filters" className="segmented max-w-full overflow-x-auto">
          <Link href={href("all")} data-active={filter === "all" || undefined}>
            All<span className="meta ml-2 tabular-nums">{all.length}</span>
          </Link>
          <Link href={href("open")} data-active={filter === "open" || undefined}>
            Not replied yet<span className="meta ml-2 tabular-nums">{open.length}</span>
          </Link>
        </nav>
      )}
    </header>
  );

  if (all.length === 0) {
    return (
      <>
        {header}
        <IllustratedEmpty
          illustration="new-lead"
          title="Your first lead is on its way"
          tint="coral"
        >
          When someone asks to book, order or get a quote, their details land here and in your
          email.
        </IllustratedEmpty>
      </>
    );
  }

  return (
    <>
      {header}
      {leads.length === 0 ? (
        <p className="meta py-6">Everyone has been replied to.</p>
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
          <div className={cn("card overflow-x-auto", leadParam && "hidden lg:block")}>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b text-left text-[13px] text-gray-600">
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Wants</th>
                  <th className="hidden px-4 py-3 font-medium md:table-cell">Contact</th>
                  <th className="hidden px-4 py-3 font-medium xl:table-cell">From</th>
                  <th className="hidden px-4 py-3 font-medium sm:table-cell">Status</th>
                  <th className="px-4 py-3 text-right font-medium">Received</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((l) => (
                  <tr
                    key={l.id}
                    className={cn(
                      "relative border-b transition-colors duration-150 last:border-b-0",
                      l.id === selected?.id ? "bg-lavender" : "hover:bg-gray-50",
                    )}
                  >
                    <td className="px-4 py-3.5 font-semibold">
                      <Link
                        href={href(filter, l.id)}
                        aria-current={l.id === selected?.id ? "true" : undefined}
                        className="after:absolute after:inset-0"
                      >
                        {leadName(l)}
                      </Link>
                    </td>
                    <td className="px-4 py-3.5">{l.request ?? "No request captured"}</td>
                    <td className="hidden px-4 py-3.5 text-gray-700 md:table-cell">
                      {l.contact ?? "Not given"}
                    </td>
                    <td className="hidden px-4 py-3.5 text-gray-600 xl:table-cell">{source(l)}</td>
                    <td className="hidden px-4 py-3.5 sm:table-cell">
                      <Status status={l.inbound_items?.status ?? ""} />
                    </td>
                    <td className="px-4 py-3.5 text-right whitespace-nowrap text-gray-600">
                      <time dateTime={l.created_at}>{shortTime(l.created_at)}</time>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {selected && (
            <div className={cn("flex flex-col gap-3", !leadParam && "hidden lg:flex")}>
              {leadParam && (
                <Link href={href(filter)} className="text-sm text-gray-700 lg:hidden">
                  ← All leads
                </Link>
              )}
              <LeadDetail lead={selected} />
            </div>
          )}
        </div>
      )}
    </>
  );
}
