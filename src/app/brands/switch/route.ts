import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { openBrandFromLink } from "@/features/tenants";

// T47: an alert email or notification for another brand opens that brand, then the item.
export async function GET(request: NextRequest): Promise<never> {
  const params = request.nextUrl.searchParams;
  redirect(await openBrandFromLink(params.get("to"), params.get("next")));
}
