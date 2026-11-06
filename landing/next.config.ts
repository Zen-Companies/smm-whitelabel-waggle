import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The dev badge covers Sign out and the Today tab in the logged-in prototype
  devIndicators: false,
  /* config options here */
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    // Nested in the product app's repo: without this, Turbopack takes the repo root as the project
    // and picks up the app's src/instrumentation.ts.
    root: __dirname,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
