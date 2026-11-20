import { ConversionTag, conversionEventId, matchKeys } from "@/features/ad-tracking";
import { getCurrentUser } from "@/lib/supabase/server";
import { loadTrialConversion } from "./trial-conversion";

/**
 * StartTrial or Subscribe for the ads (17 and 19 Nov): on Stripe's return from a first-time plan
 * checkout, only after Stripe confirms that checkout started this organization's trial or plan.
 */
export async function TrialConversionTag({
  sessionId,
  orgId,
}: {
  sessionId: unknown;
  orgId: string;
}) {
  const trial = await loadTrialConversion(sessionId, orgId);
  if (!trial) return null;
  const user = await getCurrentUser();
  const keys = matchKeys(user.id, user.email);
  return (
    <ConversionTag
      event={trial.kind === "trial" ? "StartTrial" : "Subscribe"}
      eventId={conversionEventId(
        trial.kind === "trial" ? "StartTrial" : "Subscribe",
        trial.sessionId,
      )}
      em={keys.em}
      externalId={keys.externalId}
      valueUsd={trial.valueUsd}
      plan={trial.plan}
    />
  );
}
