import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import type { TestProject } from "vitest/node";

const CRON_JOB = "process-inbound-items";

/** Runs SQL in the local Supabase database container (local dev only). */
function sql(query: string): void {
  const projectId = readFileSync("supabase/config.toml", "utf8").match(
    /^project_id\s*=\s*"([^"]+)"/m,
  )?.[1];
  if (!projectId) throw new Error("project_id not found in supabase/config.toml");
  execSync(`docker exec supabase_db_${projectId} psql -U postgres -qtc "${query}"`, {
    stdio: ["ignore", "ignore", "pipe"],
  });
}

const setCron = (active: boolean) =>
  sql(
    `select cron.alter_job(jobid, active := ${active}) from cron.job where jobname = '${CRON_JOB}'`,
  );

// Reads URL and keys from the running local stack, so no secrets live in the repo.
// Pauses the local pg_cron job for the run: its ticks call the dev server's job route, which
// would process the tests' items mid-test. It's switched back on afterwards.
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

  setCron(false);
  return () => setCron(true);
}

declare module "vitest" {
  export interface ProvidedContext {
    supabaseUrl: string;
    supabaseAnonKey: string;
    supabaseServiceKey: string;
  }
}
