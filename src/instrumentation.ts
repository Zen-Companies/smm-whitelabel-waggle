import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "@/lib/sentry";

export function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" || process.env.NEXT_RUNTIME === "edge") {
    Sentry.init({ dsn: process.env.SENTRY_DSN, ...sentryOptions });
  }
}

export const onRequestError = Sentry.captureRequestError;
