import "server-only";
import type { User } from "@supabase/supabase-js";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/server";

/**
 * The operator (us, not a business owner) sees cross-tenant pages such as /admin/costs and
 * /admin/lab (T34). The role lives in the login's app_metadata, which only the server can set
 * (`pnpm local:operator`), so an owner can't give it to themselves. Nobody has it by default.
 */
export const OPERATOR_ROLE = "operator";

export function isOperator(user: Pick<User, "app_metadata"> | null | undefined): boolean {
  return user?.app_metadata?.role === OPERATOR_ROLE;
}

/** 404 for anyone but the operator (the page's existence isn't advertised). */
export async function requireOperator() {
  const user = await getCurrentUser();
  if (!isOperator(user)) notFound();
  return user;
}
