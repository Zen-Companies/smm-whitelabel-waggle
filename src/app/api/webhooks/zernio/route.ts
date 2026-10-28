import * as Sentry from "@sentry/nextjs";
import { handleAccountConnected, handleAccountDisconnected } from "@/features/accounts";
import { InvalidWebhookError, receiveZernioEvent, verifyZernioSignature } from "@/features/inbox";
import { getServiceClient } from "@/lib/supabase/service";

// Verify, dedupe, store (CLAUDE.md rules 3-4). DB writes only, so it answers well within
// Zernio's 5 s; any non-2xx makes Zernio retry (up to 7 attempts).
export async function POST(request: Request): Promise<Response> {
  const secret = process.env.ZERNIO_WEBHOOK_SECRET;
  if (!secret) {
    Sentry.captureMessage("ZERNIO_WEBHOOK_SECRET is not set");
    return Response.json({ error: "not configured" }, { status: 500 });
  }

  const rawBody = await request.text();
  if (!verifyZernioSignature(rawBody, request.headers.get("x-zernio-signature"), secret)) {
    return Response.json({ error: "invalid signature" }, { status: 400 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }

  try {
    const result = await receiveZernioEvent(
      {
        db: getServiceClient(),
        accounts: { connected: handleAccountConnected, disconnected: handleAccountDisconnected },
      },
      payload,
    );
    return Response.json(result);
  } catch (error) {
    if (error instanceof InvalidWebhookError) {
      return Response.json({ error: "invalid event" }, { status: 400 });
    }
    Sentry.captureException(error, {
      extra: { eventId: request.headers.get("x-zernio-event-id") },
    });
    return Response.json({ error: "processing failed" }, { status: 500 });
  }
}
