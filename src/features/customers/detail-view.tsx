import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { z } from "zod";
import { Chip } from "@/components/app/chip";
import { requirePermission } from "@/features/staff";
import { writeAudit } from "@/lib/audit";
import { ghlConfig } from "@/lib/ghl/client";
import { getServiceClient } from "@/lib/supabase/service";
import {
  ago,
  browserLabel,
  CHAT_QUESTIONS,
  countKinds,
  customerGates,
  isOutcome,
  isTimelineKind,
  OUTCOME_LABEL,
  platformName,
  SOURCE_LABEL,
  STAFF_AUDIT,
  STAGE_LABEL,
  TIMELINE_KINDS,
  TIMELINE_LABEL,
  type TimelineKind,
} from "./derive";
import { type AttemptRow, type CustomerDetail, loadCustomerDetail } from "./load";
import { CopyEmail, LoggedLink, ResendConfirm } from "./staff-actions";

const paramsSchema = z.object({ tenantId: z.uuid() });

const TIMELINE_SHOWN = 60;

const dateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
const time = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "UTC",
  });

/** Staff → Customers, one business (the trace). Every look writes audit_log. */
export async function CustomerDetailView({
  params,
  searchParams,
}: {
  params: Promise<{ tenantId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const access = await requirePermission("customers.view");
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) notFound();
  const sp = await searchParams;
  const rawType = Array.isArray(sp.type) ? sp.type[0] : sp.type;
  const type: TimelineKind | null = isTimelineKind(rawType) ? rawType : null;
  const showAll = sp.all === "1";
  const db = getServiceClient();
  const now = new Date();

  // Logged before it's read, like every staff look (board §3).
  const { data: exists } = await db
    .from("tenants")
    .select("id")
    .eq("id", parsed.data.tenantId)
    .is("purged_at", null)
    .maybeSingle();
  if (!exists) notFound();
  await writeAudit(db, {
    tenantId: parsed.data.tenantId,
    action: STAFF_AUDIT.viewed,
    actor: access.userId,
    details: { role: access.role },
  });
  const d = await loadCustomerDetail(db, parsed.data.tenantId, now);
  if (!d) notFound();
  const gates = customerGates(access.permissions, d.tenant.offboardedAt !== null);
  const lastBrowser = browserLabel(d.row.browser);

  return (
    <div className="flex flex-col gap-5">
      <Link
        href="/admin/customers"
        className="text-ink-2 hover:text-ink inline-flex min-h-10 items-center gap-1 self-start text-sm"
      >
        <ChevronLeft className="size-4" aria-hidden /> Customers
      </Link>
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="page-title">{d.tenant.name}</h1>
          {d.tenant.offboardedAt ? (
            <Chip>Offboarded {dateTime(d.tenant.offboardedAt)}</Chip>
          ) : (
            <Chip tone={d.row.stage === "active" ? "green" : "red"}>
              {d.row.stage === "active" ? "Active" : `Stuck at ${STAGE_LABEL[d.row.stage]}`}
            </Chip>
          )}
          {d.row.flags
            .filter((f) => f.key !== "offboarded")
            .map((f) => (
              <Chip key={f.key} tone={f.tone}>
                {f.label}
              </Chip>
            ))}
        </div>
        <p className="text-ink-2">
          {d.row.lastActivityAt ? `Last seen ${ago(d.row.lastActivityAt, now)}` : "Not seen yet"}
          {lastBrowser ? ` · last connect try in ${lastBrowser}` : ""}
          {d.tenant.offboardedAt ? " · Read only; restore lives in Brands." : ""}
        </p>
      </header>

      <Facts d={d} now={now} />
      <Funnel d={d} />
      <Attempts attempts={d.attempts} profileId={d.tenant.zernioProfileId} />
      <Timeline d={d} type={type} showAll={showAll} />
      <div className="grid gap-4 md:grid-cols-2">
        <Setup d={d} />
        <Accounts d={d} />
        <Billing d={d} />
        <StaffActions d={d} gates={gates} />
      </div>
    </div>
  );
}

function Card({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-line bg-surface flex flex-col gap-3 rounded-2xl border p-4 md:p-5">
      <div>
        <h2 className="section-title">{title}</h2>
        {sub && <p className="meta">{sub}</p>}
      </div>
      {children}
    </section>
  );
}

function Pair({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="meta text-xs">{k}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Facts({ d, now }: { d: CustomerDetail; now: Date }) {
  const conf = d.owner.emailConfirm;
  const provider =
    d.owner.provider === "google"
      ? "Google"
      : d.owner.provider === "email"
        ? "email"
        : d.owner.provider;
  return (
    <dl className="border-line bg-surface grid gap-4 rounded-2xl border p-4 sm:grid-cols-2 md:p-5 lg:grid-cols-3">
      <Pair k="Owner">
        {d.owner.name && <span className="block font-semibold">{d.owner.name}</span>}
        <span className="block">{d.owner.email ?? "No owner login"}</span>
        {conf &&
          (conf.confirmedAt ? (
            <Chip tone="green">Confirmed</Chip>
          ) : (
            <Chip tone="honey">Not confirmed · sent {ago(conf.sentAt, now)}</Chip>
          ))}
      </Pair>
      <Pair k="Organization">
        {d.org.name ?? "–"}
        <span className="meta block">
          {d.org.own ? "own organization" : "team organization"} · {d.org.members} member
          {d.org.members === 1 ? "" : "s"}
        </span>
      </Pair>
      <Pair k="Brands">
        {d.org.brands.length} · {d.org.brands.map((b) => b.name).join(", ")}
      </Pair>
      <Pair k="Zernio profile">
        {d.tenant.zernioProfileId ? (
          <span className="font-mono text-[13px] select-all">{d.tenant.zernioProfileId}</span>
        ) : (
          "Not made yet"
        )}
        <span className="meta block">
          Search this in Zernio for this brand&apos;s profile and its connects.
        </span>
      </Pair>
      <Pair k="Plan">{d.billing.planLabel}</Pair>
      <Pair k="Signed up">
        {dateTime(d.tenant.createdAt)} UTC ({ago(d.tenant.createdAt, now)})
        <span className="meta block">
          {provider ? `with ${provider}` : "sign-in method unknown"} · beta code{" "}
          {d.owner.betaCode ?? (d.owner.betaVia ? `none (${d.owner.betaVia})` : "none")}
        </span>
      </Pair>
      <Pair k="Source">
        {SOURCE_LABEL[d.source.kind]}
        {d.source.kind === "unknown" ? (
          <span className="meta block">
            No sign-up record with a campaign (before 18 Nov, or not sent).
          </span>
        ) : (
          <span className="meta block">
            {Object.entries(d.source.utm)
              .map(([k, v]) => `${k} ${v}`)
              .join(" · ") || d.source.label}
          </span>
        )}
      </Pair>
    </dl>
  );
}

function Funnel({ d }: { d: CustomerDetail }) {
  const steps: [string, string | null, boolean][] = [
    ["Signed up", d.funnel.signedUp, true],
    ["Connected", d.funnel.connected, !!d.funnel.connected],
    ["Read 30 days", d.funnel.readDone, !!d.funnel.readDone],
    ["Step 3 done", d.funnel.setupDone, !!d.funnel.setupDone],
    ["Paid", d.funnel.paid?.at ?? null, !!d.funnel.paid],
  ];
  const connectTries = d.attempts.length;
  return (
    <Card title="Where they are" sub="Times in UTC">
      <ol className="grid gap-2 sm:grid-cols-5">
        {steps.map(([label, at, done], i) => {
          const blocked = !done && steps.slice(0, i).every((s) => s[2]);
          return (
            <li
              key={label}
              className={`flex flex-col gap-0.5 rounded-xl border p-3 ${
                done
                  ? "border-success/30 bg-success-soft"
                  : blocked
                    ? "border-danger/40 bg-danger-soft"
                    : "border-line"
              }`}
            >
              <b className="font-semibold">
                {done ? "✓ " : blocked ? "! " : ""}
                {label}
              </b>
              <span className="text-ink-2 text-[13px]">
                {at
                  ? dateTime(at)
                  : done
                    ? "time not logged"
                    : blocked && label === "Connected" && connectTries
                      ? `Not yet · ${connectTries} ${connectTries === 1 ? "try" : "tries"}`
                      : blocked
                        ? "Not yet"
                        : "–"}
              </span>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

function Attempts({
  attempts,
  profileId,
}: {
  attempts: AttemptRow[];
  /** The brand's Zernio profile, for tries that never came back (they don't store one). */
  profileId: string | null;
}) {
  const connected = attempts.filter((a) => a.outcome === "connected").length;
  const classes = [...new Set(attempts.map((a) => a.userAgentClass))];
  const allInApp = attempts.length > 0 && classes.length === 1 && classes[0]?.startsWith("in_app_");
  return (
    <Card
      title="Connect attempts"
      sub={
        attempts.length
          ? `${attempts.length} ${attempts.length === 1 ? "try" : "tries"} · ${connected} connected${
              allInApp ? ` · all inside ${browserLabel(classes[0] ?? null)}` : ""
            }`
          : undefined
      }
    >
      {attempts.length === 0 ? (
        <p className="text-ink-2">No connect tries yet. They haven&apos;t tried to connect.</p>
      ) : (
        <div className="flex flex-col">
          <div className="meta hidden grid-cols-[90px_100px_140px_150px_1fr_90px_120px] gap-2 border-b px-2 pb-2 text-xs md:grid">
            <span>Time</span>
            <span>Platform</span>
            <span>Browser</span>
            <span>Outcome</span>
            <span>Error</span>
            <span>User can fix?</span>
            <span>Stage</span>
          </div>
          {attempts.map((a) => (
            <AttemptLine key={a.id} a={a} profileId={profileId} />
          ))}
          <p className="meta mt-2">
            One row per try, newest first. Abandoned: no return within 2 hours.
          </p>
        </div>
      )}
    </Card>
  );
}

function AttemptLine({ a, profileId }: { a: AttemptRow; profileId: string | null }) {
  const outcome = isOutcome(a.outcome) ? OUTCOME_LABEL[a.outcome] : "Open";
  const tone =
    a.outcome === "connected"
      ? "green"
      : a.outcome === null
        ? "grey"
        : a.outcome === "abandoned"
          ? "grey"
          : "red";
  const secs = a.returnedAt
    ? Math.round((Date.parse(a.returnedAt) - Date.parse(a.startedAt)) / 1000)
    : null;
  const kv = (k: string, v: string | null | boolean) =>
    v === null || v === "" ? null : (
      <div key={k} className="flex gap-2">
        <dt className="meta w-36 shrink-0">{k}</dt>
        <dd className="font-mono text-xs break-all">{String(v)}</dd>
      </div>
    );
  return (
    <details className="border-subtle group border-b">
      <summary className="grid cursor-pointer list-none grid-cols-2 gap-2 px-2 py-2.5 text-[13px] md:grid-cols-[90px_100px_140px_150px_1fr_90px_120px]">
        <span>{dateTime(a.startedAt).split(", ").pop()}</span>
        <span>{platformName(a.platform)}</span>
        <span>{browserLabel(a.userAgentClass) ?? "–"}</span>
        <span>
          <Chip tone={tone}>{outcome}</Chip>
        </span>
        <span className="font-mono text-xs break-all">
          {[a.error, a.errorReason].filter(Boolean).join(" · ") || "–"}
        </span>
        <span>{a.isUserFixable === null ? "–" : a.isUserFixable ? "Yes" : "No"}</span>
        <span>
          {[a.stage, a.step].filter(Boolean).join(" · ") || "–"}{" "}
          <span className="text-ink-2 group-open:hidden" aria-hidden>
            ▸
          </span>
          <span className="text-ink-2 hidden group-open:inline" aria-hidden>
            ▾
          </span>
        </span>
      </summary>
      <div className="bg-subtle mx-2 mb-3 flex flex-col gap-1.5 rounded-xl p-3 text-[13px]">
        <p>
          Started {time(a.startedAt)} UTC
          {a.returnedAt ? ` · came back ${time(a.returnedAt)} (${secs} s)` : " · never came back"}
          {a.mode
            ? ` · opened ${a.mode === "here" ? "in this tab" : a.mode === "tab" ? "in a new tab" : "from the form"}`
            : ""}
        </p>
        <dl className="flex flex-col gap-1">
          {kv("error", a.error)}
          {kv("error_reason", a.errorReason)}
          {kv("error_message", a.errorMessage)}
          {kv("platform_error", a.platformError)}
          {kv("is_user_fixable", a.isUserFixable)}
          {kv("stage / step", [a.stage, a.step].filter(Boolean).join(" / ") || null)}
          {kv("browser class", a.userAgentClass)}
          {kv("user agent", a.userAgent)}
          {kv("attempt id", a.id)}
          {kv("Zernio request", a.zernioRequestId)}
          {kv("Zernio profile", a.zernioProfileId ?? profileId)}
          {kv("Zernio account", a.zernioAccountId)}
        </dl>
        <p className="meta">
          Error text is Zernio&apos;s or Meta&apos;s, never anything the customer typed.
        </p>
      </div>
    </details>
  );
}

function Timeline({
  d,
  type,
  showAll,
}: {
  d: CustomerDetail;
  type: TimelineKind | null;
  showAll: boolean;
}) {
  const counts = countKinds(d.timeline);
  const events = type ? d.timeline.filter((e) => e.kind === type) : d.timeline;
  const shown = showAll ? events : events.slice(0, TIMELINE_SHOWN);
  const base = `/admin/customers/${d.tenant.id}`;
  const href = (t: TimelineKind | null, all = false) => {
    const qs = new URLSearchParams();
    if (t) qs.set("type", t);
    if (all) qs.set("all", "1");
    const s = qs.toString();
    return s ? `${base}?${s}` : base;
  };
  const pill = (active: boolean) =>
    `inline-flex min-h-9 items-center rounded-full border px-3 text-[13px] ${
      active ? "bg-ink text-surface border-ink" : "border-line-strong hover:bg-subtle"
    }`;
  return (
    <Card
      title="Timeline"
      sub="Audit log, connect tries, GoHighLevel, emails and checkouts in one list (UTC)"
    >
      <nav aria-label="Show" className="flex flex-wrap gap-1.5">
        <Link href={href(null)} className={pill(!type)} aria-current={!type ? "page" : undefined}>
          All {d.timeline.length}
        </Link>
        {TIMELINE_KINDS.map((k) => (
          <Link
            key={k}
            href={href(k)}
            className={pill(type === k)}
            aria-current={type === k ? "page" : undefined}
          >
            {TIMELINE_LABEL[k]} {counts[k]}
          </Link>
        ))}
      </nav>
      {shown.length === 0 ? (
        <p className="text-ink-2">Nothing here yet.</p>
      ) : (
        <ol className="flex flex-col">
          {shown.map((e) => (
            <li
              key={e.id}
              className="border-subtle grid grid-cols-[110px_1fr] gap-3 border-b py-2 text-[13px]"
            >
              <span className="text-ink-2 whitespace-nowrap">{dateTime(e.at)}</span>
              <span>
                <b className="font-medium">{e.title}</b>{" "}
                <span className="meta">· {TIMELINE_LABEL[e.kind]}</span>
                {e.detail && <span className="text-ink-2 block">{e.detail}</span>}
              </span>
            </li>
          ))}
        </ol>
      )}
      {!showAll && events.length > TIMELINE_SHOWN && (
        <Link
          href={href(type, true)}
          className="text-ink-2 hover:text-ink self-start text-[13px] underline underline-offset-4"
        >
          Show {events.length - TIMELINE_SHOWN} older
        </Link>
      )}
    </Card>
  );
}

const SCREEN_STEP: Record<string, string> = {
  name: "Step 2 · see what you missed",
  missed: "Step 2 · see what you missed",
  wanted: "Step 2 · see what you missed",
  replies: "Step 2 · see what you missed",
  money: "Step 3 · check Waggle's answers",
  quick: "Step 3 · check Waggle's answers",
  waiting: "Step 3 · check Waggle's answers",
  how: "Step 3 · check Waggle's answers",
  chat: "Step 3 · check Waggle's answers",
};

function Setup({ d }: { d: CustomerDetail }) {
  const done = d.tenant.setupDoneAt ?? d.tenant.setupPassedAt;
  const where = done
    ? `Done ${dateTime(done)}${d.tenant.setupPassedAt && !d.tenant.setupDoneAt ? " (passed)" : ""}`
    : d.row.stage === "connect"
      ? "Step 1 · Connect"
      : (SCREEN_STEP[d.tenant.setupScreen ?? ""] ?? "Step 2 · see what you missed");
  return (
    <Card title="Setup" sub="Counts and choices only; never their messages or answers in full.">
      <dl className="grid grid-cols-2 gap-3">
        <Pair k="Where">{where}</Pair>
        <Pair k="Business type">{d.row.kind ?? "Not chosen"}</Pair>
        <Pair k="Step 3 questions">
          {d.tenant.setupChatAnswered} of {CHAT_QUESTIONS.length} answered
        </Pair>
        <Pair k="Facts confirmed">
          {d.facts.confirmed} of {d.facts.found} found
        </Pair>
      </dl>
    </Card>
  );
}

function Accounts({ d }: { d: CustomerDetail }) {
  return (
    <Card title="Accounts">
      {d.accounts.length === 0 && d.triesByPlatformNotConnected.length === 0 ? (
        <p className="text-ink-2">No accounts connected and no tries yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {d.accounts.map((a) => (
            <li
              key={`${a.platform}-${a.connectedAt}`}
              className="flex flex-wrap items-center gap-2"
            >
              <b className="font-semibold">{platformName(a.platform)}</b>
              {a.username && <span>@{a.username.replace(/^@/, "")}</span>}
              <Chip tone={a.released ? "grey" : a.status === "active" ? "green" : "red"}>
                {a.released
                  ? "Released"
                  : a.status === "active"
                    ? "OK"
                    : a.status === "error"
                      ? "Broken"
                      : "Disconnected"}
              </Chip>
              <span className="meta">
                since {dateTime(a.connectedAt)} · {a.tries} {a.tries === 1 ? "try" : "tries"}
              </span>
            </li>
          ))}
          {d.triesByPlatformNotConnected.map((t) => (
            <li key={t.platform} className="flex flex-wrap items-center gap-2">
              <b className="font-semibold">{platformName(t.platform)}</b>
              <Chip tone="red">Not connected</Chip>
              <span className="meta">
                {t.tries} {t.tries === 1 ? "try" : "tries"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Billing({ d }: { d: CustomerDetail }) {
  const ai = d.billing.aiSpend;
  return (
    <Card title="Billing">
      <dl className="grid grid-cols-2 gap-3">
        <Pair k="Stripe customer">{d.billing.stripeCustomerId ?? "Not created yet"}</Pair>
        <Pair k="Subscription">
          {d.billing.subscriptionStatus ?? "None"} · {d.billing.planLabel}
        </Pair>
        <Pair k="Checkouts">
          {d.billing.checkoutsStarted} started · {d.billing.checkoutsReturned} came back
        </Pair>
        <Pair k="AI use this month">
          {ai ? `$${ai.spentUsd.toFixed(2)} of $${ai.capUsd.toFixed(2)} cap` : "–"}
        </Pair>
      </dl>
    </Card>
  );
}

function stripeHref(customerId: string): string {
  const test = (process.env.STRIPE_SECRET_KEY ?? "").startsWith("sk_test");
  return `https://dashboard.stripe.com/${test ? "test/" : ""}customers/${encodeURIComponent(customerId)}`;
}

function ghlHref(contactId: string | null): string | null {
  const loc = ghlConfig()?.locationId ?? process.env.GHL_LOCATION_ID?.trim();
  if (!loc) return null;
  const base = `https://app.gohighlevel.com/v2/location/${encodeURIComponent(loc)}/contacts`;
  return contactId ? `${base}/detail/${encodeURIComponent(contactId)}` : `${base}/smart_list/All`;
}

function StaffActions({
  d,
  gates,
}: {
  d: CustomerDetail;
  gates: ReturnType<typeof customerGates>;
}) {
  if (!gates.links) {
    return (
      <Card title="Staff actions">
        <p className="text-ink-2">
          Read only: this business is offboarded. Restore lives in Brands.
        </p>
      </Card>
    );
  }
  const ghl = ghlHref(d.ghlContactId);
  const conf = d.owner.emailConfirm;
  return (
    <Card title="Staff actions" sub="Each one is logged">
      <div className="flex flex-wrap gap-2">
        {d.owner.email && <CopyEmail tenantId={d.tenant.id} email={d.owner.email} />}
        {d.billing.stripeCustomerId ? (
          <LoggedLink
            tenantId={d.tenant.id}
            action="opened_stripe"
            href={stripeHref(d.billing.stripeCustomerId)}
          >
            Open in Stripe
          </LoggedLink>
        ) : (
          <span className="meta flex min-h-10 items-center">No Stripe customer yet</span>
        )}
        {ghl && (
          <LoggedLink tenantId={d.tenant.id} action="opened_ghl" href={ghl}>
            {d.ghlContactId ? "Open GoHighLevel contact" : "Find in GoHighLevel"}
          </LoggedLink>
        )}
      </div>
      {!d.ghlContactId && ghl && (
        <p className="meta">
          No contact id stored yet: search GoHighLevel for the owner&apos;s email.
        </p>
      )}
      {gates.act && conf && !conf.confirmedAt && d.owner.email && (
        <ResendConfirm tenantId={d.tenant.id} email={d.owner.email} lastSentAt={conf.sentAt} />
      )}
    </Card>
  );
}
