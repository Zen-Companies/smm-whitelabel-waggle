import * as Sentry from "@sentry/nextjs";
import { CircleCheck, CircleDot, Clock3, TriangleAlert } from "lucide-react";
import { getSocialProvider } from "@/lib/social";
import type { OwnedNumber, SmsRegistration } from "@/lib/social/types";
import { getServiceClient } from "@/lib/supabase/service";
import { EnableTexting, RegistrationCode, RegistrationForm } from "./texting-forms";

/** Texting (T82c, design "Texting (US)"): turn it on, then the US carriers' review. */
export async function TextingCard({
  tenantId,
  businessName,
  number,
}: {
  tenantId: string;
  businessName: string;
  number: OwnedNumber;
}) {
  const { data: sms } = await getServiceClient()
    .from("social_accounts")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("platform", "sms")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  const us = number.phoneNumber.startsWith("+1") && number.country === "US";
  let registrations: SmsRegistration[] = [];
  let failed = false;
  if (sms && us) {
    try {
      registrations = await getSocialProvider().listSmsRegistrations({
        phoneNumber: number.phoneNumber,
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      Sentry.captureException(error, { extra: { tenantId, step: "smsRegistrations" } });
      failed = true;
    }
  }
  const reg = registrations.find((r) => r.status !== "deactivated");
  const step = (done: boolean, label: string) => (
    <li className="flex items-center gap-2 text-sm">
      {done ? (
        <CircleCheck className="text-success size-4" strokeWidth={2} aria-hidden />
      ) : (
        <CircleDot className="text-ink-3 size-4" strokeWidth={2} aria-hidden />
      )}
      {label}
    </li>
  );

  return (
    <section className="card flex flex-col gap-3 p-5" aria-labelledby="texting-title">
      <h3 id="texting-title" className="font-semibold">
        Texting{us ? " (US)" : ""}
      </h3>
      {!sms ? (
        <>
          <p className="text-ink-2 text-sm">
            Texts to this number come into the inbox and are answered like any message.
          </p>
          <EnableTexting numberId={number.id} />
        </>
      ) : !us ? (
        <p className="text-ink-2 inline-flex items-center gap-1.5 text-sm">
          <CircleCheck className="text-success size-4" strokeWidth={1.75} aria-hidden />
          Texting is on. Texts reach people in this number&apos;s country.
        </p>
      ) : failed ? (
        <p className="danger-box">The carriers&apos; review couldn&apos;t be loaded right now.</p>
      ) : !reg || reg.status === "rejected" ? (
        <>
          <p className="text-ink-2 text-sm">
            US carriers must approve your business before you can send texts. You can receive texts
            now.
          </p>
          {reg?.status === "rejected" && (
            <p className="danger-box">
              The carriers turned it down{reg.declineReason ? `: ${reg.declineReason}` : "."} Fix
              the details and send it again.
            </p>
          )}
          <RegistrationForm numberId={number.id} businessName={businessName} />
        </>
      ) : (
        <>
          <ol className="flex flex-col gap-1.5">
            {step(true, "Your business details")}
            {step(true, "What you'll text about")}
            {reg.type === "sole_prop_10dlc" &&
              step(!reg.awaitingOtp, "The code texted to your mobile")}
            <li className="flex items-center gap-2 text-sm">
              {reg.status === "approved" ? (
                <CircleCheck className="text-success size-4" strokeWidth={2} aria-hidden />
              ) : reg.status === "changes_requested" ? (
                <TriangleAlert className="text-honey-text size-4" strokeWidth={2} aria-hidden />
              ) : (
                <Clock3 className="text-honey-text size-4" strokeWidth={2} aria-hidden />
              )}
              Carrier review ·{" "}
              {reg.status === "approved"
                ? "Approved"
                : reg.status === "changes_requested"
                  ? "Changes asked for"
                  : "In review"}
            </li>
          </ol>
          {reg.awaitingOtp && <RegistrationCode numberId={number.id} />}
          <p className="meta">
            {reg.status === "approved"
              ? "Your number can send texts. Carriers can pause a registration later; we'll show it here."
              : reg.status === "changes_requested"
                ? "The carriers asked for changes. Contact us and we'll sort it out with you."
                : "Carriers are reviewing. You can receive texts now; sending starts once they approve."}
          </p>
        </>
      )}
    </section>
  );
}
