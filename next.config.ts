import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

const nextConfig: NextConfig = {
  // AGENTS.md only points to CLAUDE.md; stop `next dev` from writing its own block into it.
  agentRules: false,
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // Post images (up to 5 MB, T14) go through the compose Server Action.
    serverActions: { bodySizeLimit: "6mb" },
  },
  env: {
    NEXT_PUBLIC_SENTRY_DSN: process.env.SENTRY_DSN ?? "",
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default withSentryConfig(nextConfig, { silent: !process.env.CI });
