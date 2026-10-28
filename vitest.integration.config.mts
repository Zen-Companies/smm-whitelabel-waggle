import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Integration tests run against local Supabase (`supabase start`). External APIs (Zernio, Jev,
// OpenRouter) are still faked.
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: [
      {
        find: /^server-only$/,
        replacement: fileURLToPath(new URL("./node_modules/server-only/empty.js", import.meta.url)),
      },
    ],
  },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    globalSetup: ["tests/integration/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
