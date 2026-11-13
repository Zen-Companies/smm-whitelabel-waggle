import { randomUUID } from "node:crypto";
import * as Sentry from "@sentry/nextjs";
import { Check } from "lucide-react";
import { can } from "@/features/orgs";
import { getCurrentTenant, ReadOnlyNote } from "@/features/tenants";
import { getSocialProvider } from "@/lib/social";
import type { RcsAgentView } from "@/lib/social/types";
import { cn } from "cn";
import { launchDefaults, launchDue } from "./launch";
import { LaunchForm, TestPhones } from "./launch-forms";
import { RcsRequestForm } from "./rcs-forms";
import { canFix, currentAgent, filedDefaults, isClosed, RCS_PRICES, rcsSteps } from "./rcs";

const usd = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

const STATUS_CHIP: Record<RcsAgentView["status"], string> = {
  requested: "Request sent",
  changes_requested: "Needs a fix",
  brand_vetting: "In carrier review",
  agent_review: "In carrier review",
  testing: "Ready to test",
  launch_review: "In launch review",
  launching: "In carrier review",
  live: "Live",
  rejected: "Not approved",
  deactivated: "Turned off",
};

function Prices() {
  const rows = [
    ["Setup", `${usd(RCS_PRICES.setupCents)} once`],
    ["When carriers approve (US)", `${usd(RCS_PRICES.usApprovalCents)} once`],
    [
      "Every month",
      `${usd(RCS_PRICES.monthlyUsCents)} (US) · ${usd(RCS_PRICES.monthlyElsewhereCents)} elsewhere`,
    ],
    ["Per message", "from about 1¢ text, 2.4¢ with media"],
  ];
  return (
    <dl className="bg-subtle grid gap-x-6 gap-y-1.5 rounded-lg p-4 text-sm sm:grid-cols-[auto_1fr]">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-ink-3">{k}</dt>
          <dd className="font-medium tabular-nums">{v}</dd>
        </div>
      ))}
      <p className="meta sm:col-span-2">
        Nothing is charged until the request passes review. Monthly fees start the day you go live.
      </p>
    </dl>
  );
}

function Steps({ agent }: { agent: RcsAgentView }) {
  const steps = rcsSteps(agent.country, agent.status);
  return (
    <ol className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-4">
      {steps.map((s) => (
        <li
          key={s.label}
          aria-current={s.state === "now" ? "step" : undefined}
          className={cn(
            "flex items-center gap-2 text-sm",
            s.state === "next" ? "text-ink-4" : "text-ink",
            s.state === "now" && "font-semibold",
          )}
        >
          <span
            className={cn(
              "flex size-5 items-center justify-center rounded-full border",
              s.state === "done" && "border-success bg-success text-surface",
              s.state === "now" && "border-honey",
              s.state === "next" && "border-line-strong",
            )}
            aria-hidden
          >
            {s.state === "done" && <Check className="size-3" strokeWidth={3} />}
          </span>
          {s.label}
        </li>
      ))}
    </ol>
  );
}

function RcsCard({
  agent,
  mayEdit,
  businessName,
}: {
  agent: RcsAgentView | null;
  mayEdit: boolean;
  businessName: string;
}) {
  const open = agent && !isClosed(agent) ? agent : null;
  return (
    <div className="card flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold">Branded texts (RCS)</h3>
        {open && (
          <span className="bg-subtle text-ink-2 rounded-full px-2.5 py-0.5 text-xs font-medium">
            {STATUS_CHIP[open.status]}
          </span>
        )}
      </div>
      <p className="meta">
        Texts from your name, logo and a verified tick, with buttons customers can tap. Phones
        without it get a plain text.
      </p>
      {open ? (
        <>
          <Steps agent={open} />
          {open.country === "US" && open.status !== "live" && (
            <p className="meta">US carrier review usually takes 4–6 weeks.</p>
          )}
          {canFix(open) && (
            <div className="flex flex-col gap-4">
              <p className="danger-box">
                Notes on your request: &ldquo;{open.reviewNote ?? "Some details need a fix."}
                &rdquo; Fix it and send again.
              </p>
              {mayEdit && <RcsRequestForm agentId={open.id} defaults={filedDefaults(open)} />}
            </div>
          )}
          {mayEdit && open.status === "testing" && open.country === "US" && (
            <TestPhones agentId={open.id} devices={open.testDevices} />
          )}
          {mayEdit && launchDue(open) && (
            <LaunchForm
              agentId={open.id}
              us={open.country === "US"}
              defaults={launchDefaults(businessName)}
            />
          )}
          {open.launchSent && open.status === "testing" && (
            <p className="meta">
              The launch details came back. Check the email we sent, then send them again.
            </p>
          )}
          {open.status === "live" && (
            <p className="text-sm">Live. Replies to your branded texts arrive in the inbox.</p>
          )}
        </>
      ) : (
        <>
          {agent?.status === "rejected" && (
            <p className="danger-box">
              Carriers didn&apos;t approve the last request
              {agent.declineReason ? `: “${agent.declineReason}”` : "."} You can send a new one.
            </p>
          )}
          <Prices />
          {mayEdit && (
            <RcsRequestForm
              requestKey={randomUUID()}
              defaults={agent ? filedDefaults(agent) : {}}
            />
          )}
        </>
      )}
    </div>
  );
}

/** Settings → Messaging (T83, design "Settings · Messaging"): branded texts and iMessage. */
export async function MessagingSection() {
  const tenant = await getCurrentTenant();
  const mayEdit = can(tenant.role, "brand.settings");
  let agents: RcsAgentView[] = [];
  let failed = false;
  if (tenant.zernioProfileId) {
    try {
      agents = await getSocialProvider().listRcsAgents({
        profileId: tenant.zernioProfileId,
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      Sentry.captureException(error, { extra: { tenantId: tenant.id, step: "messagingSection" } });
      failed = true;
    }
  }
  return (
    <section className="flex flex-col gap-4" aria-labelledby="messaging-heading">
      <div>
        <h2 id="messaging-heading" className="section-title">
          Messaging
        </h2>
        <p className="meta">Branded texts and iMessage, answered in the inbox.</p>
      </div>
      {!mayEdit && <ReadOnlyNote role={tenant.role} what="messaging" />}
      {failed ? (
        <p className="danger-box">
          Messaging couldn&apos;t be loaded right now. Try again in a moment.
        </p>
      ) : (
        <RcsCard agent={currentAgent(agents)} mayEdit={mayEdit} businessName={tenant.name} />
      )}
    </section>
  );
}
