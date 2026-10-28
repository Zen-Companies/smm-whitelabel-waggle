import { execSync } from "node:child_process";
import type { TestProject } from "vitest/node";

// Reads URL and keys from the running local stack, so no secrets live in the repo.
export default function setup(project: TestProject) {
  let output: string;
  try {
    output = execSync("supabase status -o env", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    throw new Error("Local Supabase is not running: run `supabase start` first.");
  }
  const env = Object.fromEntries(
    output
      .split(/\r?\n/)
      .map((line) => line.match(/^([A-Z_]+)="?(.*?)"?$/))
      .filter((m): m is RegExpMatchArray => m !== null)
      .map((m) => [m[1], m[2]]),
  );
  project.provide("supabaseUrl", env.API_URL);
  project.provide("supabaseAnonKey", env.ANON_KEY);
  project.provide("supabaseServiceKey", env.SERVICE_ROLE_KEY);
}

declare module "vitest" {
  export interface ProvidedContext {
    supabaseUrl: string;
    supabaseAnonKey: string;
    supabaseServiceKey: string;
  }
}
