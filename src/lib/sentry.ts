import type { ErrorEvent } from "@sentry/nextjs";

// Shared by server, edge and client init. Customer message text must never reach
// Sentry (CLAUDE.md rule 10), so request bodies are dropped and PII is off.
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  if (event.request) {
    delete event.request.data;
    delete event.request.cookies;
  }
  return event;
}

export const sentryOptions = {
  sendDefaultPii: false,
  tracesSampleRate: 0.1,
  beforeSend: scrubEvent,
};
