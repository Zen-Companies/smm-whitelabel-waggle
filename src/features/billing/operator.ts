import "server-only";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/server";

/**
 * The operator (us, not a business owner) sees cross-tenant pages such as /admin/costs.
 * OPERATOR_EMAILS is a comma-separated list. Unset outside production = local demo: any
 * signed-in user. Unset in production = nobody.
 */
export function isOperatorEmail(
  email: string | undefined | null,
  env: Record<string, string | undefined> = process.env,
): boolean {
  const list = (env.OPERATOR_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (list.length === 0) return env.NODE_ENV !== "production" && env.VERCEL_ENV !== "production";
  return !!email && list.includes(email.toLowerCase());
}

/** 404 for anyone but the operator (the page's existence isn't advertised). */
export async function requireOperator() {
  const user = await getCurrentUser();
  if (!isOperatorEmail(user.email)) notFound();
  return user;
}
