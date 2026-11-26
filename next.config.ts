import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

const nextConfig: NextConfig = {
  // AGENTS.md only points to CLAUDE.md; stop `next dev` from writing its own block into it.
  agentRules: false,
  // Local live tests run through an ngrok tunnel (skill local-live): without this, `next dev`
  // blocks its dev scripts for that host and the page never becomes interactive. Dev only.
  allowedDevOrigins: ["*.ngrok-free.app", "*.trycloudflare.com"],
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
  // The app is never listed by search engines, production included: gowaggle.ai is the public
  // site (hotfix 26 Nov). Belt and braces with robots.txt and the root layout's robots metadata.
  async headers() {
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
