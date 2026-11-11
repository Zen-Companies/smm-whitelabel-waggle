// GoHighLevel (design v3 "Beta access and feedback"): Waggle posts beta and feedback events to the
// same kind of Inbound Webhook the gowaggle.ai waitlist uses (FEEDBACK_WEBHOOK_URL), as flat JSON
// so each field maps onto a GHL custom field; the workflow branches on `event` and matches the
// contact by email. A failed call never blocks the person: it's logged (ids only) and reported.

export type GhlEvent =
  | {
      event: "beta_joined";
      email: string;
      name: string;
      code: string;
      codeLabel: string;
      via: "code" | "invite";
      invitedBy: string;
      joinedAt: string;
    }
  | {
      event: "feedback";
      email: string;
      name: string;
      type: string;
      message: string;
      followUp: string;
      contactOk: boolean;
      page: string;
      organization: string;
      brand: string;
      role: string;
      betaCode: string;
      submittedAt: string;
    }
  | {
      event: "page_rating";
      email: string;
      name: string;
      page: string;
      rating: "good" | "not_good";
      reason: string;
      organization: string;
      brand: string;
      ratedAt: string;
    };

export async function sendGhlEvent(
  payload: GhlEvent,
  env: Record<string, string | undefined> = process.env,
  doFetch: typeof fetch = fetch,
): Promise<"sent" | "skipped" | "failed"> {
  const url = env.FEEDBACK_WEBHOOK_URL;
  if (!url || env.VITEST) {
    console.info(`[ghl] FEEDBACK_WEBHOOK_URL not set: ${payload.event} not sent`);
    return "skipped";
  }
  try {
    const res = await doFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.error(`[ghl] ${payload.event}: webhook answered ${res.status}`);
      return "failed";
    }
    return "sent";
  } catch (err) {
    console.error(
      `[ghl] ${payload.event}: webhook unreachable (${err instanceof Error ? err.name : "error"})`,
    );
    return "failed";
  }
}
