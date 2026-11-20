import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { loadSetupResume } from "@/features/setup";

/**
 * Setup first, then free (approved 20 Nov): where the gate sends an owner whose brand hasn't been
 * through setup. Remembers the page they asked for (same-site, checked), for this brand only,
 * then opens setup at the first step not done with "Welcome back".
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const { href, cookie } = await loadSetupResume(searchParams.get("next"));
  const store = await cookies();
  if (cookie) store.set(cookie.name, cookie.value, cookie.options);
  redirect(href);
}
