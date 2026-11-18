import { NextResponse, type NextRequest } from "next/server";
import { CHECKOUT_OK_COOKIE, getStripe } from "@/features/billing";
import { getCurrentUser } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";

// Back from Stripe after the plan step (plan before setup, 18 Nov). Stripe's webhook stores the
// plan a few seconds later, so a finished checkout opens the gate for 10 minutes (a cookie for
// this organization) and setup starts right away. The webhook stays the source of truth.
export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("session_id") ?? "";
  const back = (path: string) => NextResponse.redirect(new URL(path, request.url));
  const stripe = getStripe();
  if (!stripe || !/^cs_[A-Za-z0-9_]+$/.test(sessionId)) return back("/start");

  const user = await getCurrentUser();
  let orgId: string | null = null;
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.status === "complete") orgId = session.client_reference_id;
  } catch {
    return back("/start");
  }
  if (!orgId) return back("/start");
  const { data: owner } = await getServiceClient()
    .from("organization_members")
    .select("role")
    .eq("organization_id", orgId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (owner?.role !== "owner") return back("/start");

  const res = back(`/welcome?trial=started&session_id=${encodeURIComponent(sessionId)}`);
  res.cookies.set(CHECKOUT_OK_COOKIE, orgId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
    path: "/",
  });
  return res;
}
