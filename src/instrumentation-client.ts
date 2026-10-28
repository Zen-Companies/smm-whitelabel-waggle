import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "@/lib/sentry";

// NEXT_PUBLIC_SENTRY_DSN is mapped from SENTRY_DSN in next.config.ts.
Sentry.init({ dsn: process.env.NEXT_PUBLIC_SENTRY_DSN, ...sentryOptions });

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
