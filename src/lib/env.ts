import type { z } from "zod";

type Env = Record<string, string | undefined>;

/**
 * Validates env vars with zod. Empty values (`KEY=` in .env files) count as unset, so defaults
 * apply. The error names the bad keys only, never their values.
 */
export function parseEnv<T extends z.ZodType>(schema: T, env: Env, label: string): z.infer<T> {
  const set = Object.fromEntries(Object.entries(env).filter(([, value]) => value !== ""));
  const parsed = schema.safeParse(set);
  if (!parsed.success) {
    const keys = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Invalid ${label} config: ${keys}`);
  }
  return parsed.data;
}
