import { ConversionTag, conversionEventId, matchKeys } from "@/features/ad-tracking";
import { getCurrentUser } from "@/lib/supabase/server";
import { loadTrialConversion } from "./trial-conversion";

/**
 * StartTrial for the ads (17 Nov): on Stripe's return from a first-time plan checkout, only
 * after Stripe confirms that checkout started this organization's trial.
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
      event="StartTrial"
      eventId={conversionEventId("StartTrial", trial.sessionId)}
      em={keys.em}
      externalId={keys.externalId}
      valueUsd={trial.valueUsd}
      plan={trial.plan}
    />
  );
}
