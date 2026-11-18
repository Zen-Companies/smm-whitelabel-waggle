import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

const nextConfig: NextConfig = {
  // AGENTS.md only points to CLAUDE.md; stop `next dev` from writing its own block into it.
  agentRules: false,
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    agentUpgrade: "security",
    // Post images (up to 5 MB, T14) go through the compose Server Action.
    serverActions: { bodySizeLimit: "6mb" },
  },
  env: {
    NEXT_PUBLIC_SENTRY_DSN: process.env.SENTRY_DSN ?? "",
  },
  // Staging (hive-….gowaggle.ai) and previews are never listed by search engines; only the
  // production build (VERCEL_ENV=production) may be.
  async headers() {
    if (process.env.VERCEL_ENV === "production") return [];
    return [{ source: "/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] }];
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
