import { randomUUID } from "node:crypto";
import * as Sentry from "@sentry/nextjs";
import { CircleCheck, Clock3 } from "lucide-react";
import { can } from "@/features/orgs";
import { getCurrentTenant, ReadOnlyNote } from "@/features/tenants";
import { getSocialProvider } from "@/lib/social";
import type { OwnedNumber } from "@/lib/social/types";
import { getServiceClient } from "@/lib/supabase/service";
import { phoneBrands } from "./flags";
import { displayNumber, monthly, numberOptions, typeLabel, type NumberOption } from "./numbers";
import { NumberPicker, PhoneSwitchForm, PhoneSwitchOn, ReleaseNumber } from "./phone-forms";

/** Settings → Phone (T82a, design "Settings · Phone"): the brand's number, or getting one. */
export async function PhoneSection() {
  const tenant = await getCurrentTenant();
  const mayEdit = can(tenant.role, "brand.settings");
  let owned: OwnedNumber[] = [];
  let options: NumberOption[] = [];
  let failed = false;
  if (tenant.zernioProfileId) {
    try {
      const social = getSocialProvider();
      owned = await social.listOwnedNumbers({
        profileId: tenant.zernioProfileId,
        signal: AbortSignal.timeout(15_000),
      });
      if (!owned.length && mayEdit) {
        options = numberOptions(
          await social.listPhoneCountries({ signal: AbortSignal.timeout(15_000) }),
        );
      }
    } catch (error) {
      Sentry.captureException(error, { extra: { tenantId: tenant.id, step: "phoneSection" } });
      failed = true;
    }
  }
  const number = owned[0];
  return (
    <section className="flex flex-col gap-4" aria-labelledby="phone-heading">
      <div>
        <h2 id="phone-heading" className="section-title">
          Phone
        </h2>
        <p className="meta">
          A business number for calls, and texts where your country allows them.
        </p>
      </div>
      {failed ? (
        <p className="danger-box">
          Phone couldn&apos;t be loaded right now. Try again in a moment.
        </p>
      ) : number ? (
        <div className="card flex flex-wrap items-center gap-3 p-5">
          <span className="flex min-w-0 flex-1 flex-col">
            <b className="text-lg font-semibold tabular-nums">
              {displayNumber(number.phoneNumber)}
            </b>
            <span className="meta">
              {[
                typeLabel(number.numberType ?? ""),
                number.monthlyCents != null ? monthly(number.monthlyCents) : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
            {number.status === "active" ? (
              <span className="text-ink-2 inline-flex items-center gap-1.5 text-sm">
                <CircleCheck className="text-success size-4" strokeWidth={1.75} aria-hidden />
                Ready
              </span>
            ) : (
              <span className="text-honey-text inline-flex items-center gap-1.5 text-sm">
                <Clock3 className="size-4" strokeWidth={1.75} aria-hidden />
                Setting up
              </span>
            )}
          </span>
          {mayEdit && <ReleaseNumber id={number.id} label={displayNumber(number.phoneNumber)} />}
        </div>
      ) : mayEdit ? (
        <div className="card flex flex-col gap-4 p-5">
          <h3 className="font-semibold">Get a business number</h3>
          <NumberPicker options={options} purchaseIntentId={randomUUID()} />
          <p className="meta">
            Countries that ask for ID before a number turns on come later. Bringing the number you
            already have comes next.
          </p>
        </div>
      ) : (
        <ReadOnlyNote role={tenant.role} what="the phone number" />
      )}
      {number && (
        <p className="meta">Calls, voicemail and texts on this number come into Waggle next.</p>
      )}
    </section>
  );
}

/** Staff: Phone is switched on brand by brand until billing is built (Feature switches). */
export async function PhoneSwitches() {
  const db = getServiceClient();
  const [on, { data: brands }] = await Promise.all([
    phoneBrands(db),
    db.from("tenants").select("id, name").is("offboarded_at", null).order("name").limit(500),
  ]);
  const onIds = new Set(on.map((b) => b.id));
  return (
    <section className="card flex flex-col gap-3 p-5" aria-labelledby="phone-switches">
      <h2 id="phone-switches" className="section-title">
        Phone
      </h2>
      <p className="text-ink-2 text-sm">
        Numbers, calls and texts are billed to our account until billing is built, so Phone is on
        only for the brands listed here.
      </p>
      {on.length ? (
        <ul className="divide-line flex flex-col divide-y">
          {on.map((b) => (
            <li key={b.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span>{b.name}</span>
              <PhoneSwitchForm tenantId={b.id} on={false} label="Turn off" />
            </li>
          ))}
        </ul>
      ) : (
        <p className="meta">No brand has Phone yet.</p>
      )}
      <PhoneSwitchOn brands={(brands ?? []).filter((b) => !onIds.has(b.id))} />
    </section>
  );
}
