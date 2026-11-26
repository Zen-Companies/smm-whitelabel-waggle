import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { z } from "zod";
import { Chip } from "@/components/app/chip";
import { requirePermission } from "@/features/staff";
import { getServiceClient } from "@/lib/supabase/service";
import { connectStatusLabel } from "./connect-story";
import { Card, dateTime, Pair, Timeline } from "./detail-view";
import { ago, isTimelineKind, SOURCE_LABEL, STAFF_AUDIT, type TimelineKind } from "./derive";
import { loadSignupDetail, type SignupDetail, signupTarget } from "./load";
import { signInMethod, signupHref } from "./signups";

const paramsSchema = z.object({ userId: z.uuid() });

/**
 * Staff → Customers, a sign-up with no business (26 Nov): someone who signed up and never tapped
 * a platform on setup's Connect step, so no business exists yet. Every look writes
 * organization_audit (there's no business for audit_log). Once they have a business, this page
 * goes to the business's page.
 */
export async function SignupDetailView({
  params,
  searchParams,
}: {
  params: Promise<{ userId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const access = await requirePermission("customers.view");
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) notFound();
  const userId = parsed.data.userId;
  const sp = await searchParams;
  const rawType = Array.isArray(sp.type) ? sp.type[0] : sp.type;
  const type: TimelineKind | null = isTimelineKind(rawType) ? rawType : null;
  const showAll = sp.all === "1";
  const db = getServiceClient();
  const now = new Date();

  const target = await signupTarget(db, userId);
  if (!target) notFound();
  if (target.kind === "business") redirect(`/admin/customers/${target.tenantId}`);
  // Logged before it's read, like the business page (there, audit_log; here, the organization's).
  const { error } = await db.from("organization_audit").insert({
    organization_id: target.orgId,
    action: STAFF_AUDIT.viewed,
    actor: access.userId,
    details: { role: access.role, userId },
  });
  if (error) throw new Error(`organization_audit insert failed: ${error.message}`);
  const d = await loadSignupDetail(db, userId, target.orgId, now);
  if (!d) notFound();
  const status = connectStatusLabel({
    stage: d.row.stage,
    stageLabel: "No business yet",
    lastTry: null,
    now,
  });

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
          <h1 className="page-title">{d.owner.name ?? d.owner.email ?? "Sign-up"}</h1>
          <Chip>{status.label}</Chip>
          {d.row.flags.map((f) => (
            <Chip key={f.key} tone={f.tone}>
              {f.label}
            </Chip>
          ))}
        </div>
        <p className="text-ink-2">
          No business yet: a business is made when they tap a platform on setup&apos;s Connect step,
          and they never did.{" "}
          {d.row.lastActivityAt ? `Last seen ${ago(d.row.lastActivityAt, now)}.` : "Not seen yet."}
        </p>
      </header>

      <Facts d={d} now={now} />
      <Funnel d={d} />
      <Card title="Connect attempts">
        <p className="text-ink-2">Never tapped Connect, so there are no tries to show.</p>
      </Card>
      <Timeline
        events={d.timeline}
        base={signupHref(userId)}
        type={type}
        showAll={showAll}
        sub="Organization audit, GoHighLevel and emails in one list (UTC). No business, so no business audit or connect tries."
      />
      <Card title="Staff notes" sub="Nothing to act on here yet">
        <p className="text-ink-2">
          Copy the email from the top to reach them.
          {d.ghlContactId ? (
            <>
              {" "}
              GoHighLevel contact{" "}
              <span className="font-mono text-[13px] select-all">{d.ghlContactId}</span>.
            </>
          ) : (
            " No GoHighLevel contact id stored yet: search GoHighLevel for their email."
          )}
        </p>
      </Card>
    </div>
  );
}

function Facts({ d, now }: { d: SignupDetail; now: Date }) {
  const conf = d.owner.emailConfirm;
  const method = signInMethod(d.owner.provider);
  return (
    <dl className="border-line bg-surface grid gap-4 rounded-2xl border p-4 sm:grid-cols-2 md:p-5 lg:grid-cols-3">
      <Pair k="Owner">
        {d.owner.name && <span className="block font-semibold">{d.owner.name}</span>}
        <span className="block select-all">{d.owner.email ?? "No email"}</span>
        {conf ? (
          conf.confirmedAt ? (
            <Chip tone="green">Confirmed</Chip>
          ) : (
            <Chip tone="honey">Not confirmed · sent {ago(conf.sentAt, now)}</Chip>
          )
        ) : d.owner.confirmedAt ? (
          <Chip tone="green">Confirmed{method === "Google" ? " (Google)" : ""}</Chip>
        ) : (
          <Chip tone="honey">Not confirmed</Chip>
        )}
      </Pair>
      <Pair k="Organization">
        {d.org.name ?? "–"}
        <span className="meta block">
          {d.org.own ? "own organization" : "team organization"} · {d.org.members} member
          {d.org.members === 1 ? "" : "s"}
          {d.org.others ? ` · in ${d.org.others} more, none with a business` : ""}
        </span>
      </Pair>
      <Pair k="Business">
        No business yet
        <span className="meta block">Made when they tap a platform on setup&apos;s Connect.</span>
      </Pair>
      <Pair k="Plan">{d.row.planLabel}</Pair>
      <Pair k="Signed up">
        {dateTime(d.row.signedUpAt)} UTC ({ago(d.row.signedUpAt, now)})
        <span className="meta block">
          {method ? `with ${method}` : "sign-in method unknown"} · beta code{" "}
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

function Funnel({ d }: { d: SignupDetail }) {
  const steps: [string, string][] = [
    ["Connected", "Never tapped Connect"],
    ["Read 30 days", "–"],
    ["Step 3 done", "–"],
    ["Paid", "–"],
  ];
  return (
    <Card title="Where they are" sub="Times in UTC">
      <ol className="grid gap-2 sm:grid-cols-5">
        <li className="border-success/30 bg-success-soft flex flex-col gap-0.5 rounded-xl border p-3">
          <b className="font-semibold">✓ Signed up</b>
          <span className="text-ink-2 text-[13px]">{dateTime(d.row.signedUpAt)}</span>
        </li>
        {steps.map(([label, note], i) => (
          <li
            key={label}
            className={`flex flex-col gap-0.5 rounded-xl border p-3 ${
              i === 0 ? "border-danger/40 bg-danger-soft" : "border-line"
            }`}
          >
            <b className="font-semibold">
              {i === 0 ? "! " : ""}
              {label}
            </b>
            <span className="text-ink-2 text-[13px]">{note}</span>
          </li>
        ))}
      </ol>
    </Card>
  );
}
