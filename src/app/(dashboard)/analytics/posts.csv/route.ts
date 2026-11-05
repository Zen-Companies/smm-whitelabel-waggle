import type { NextRequest } from "next/server";
import { postsCsvResponse } from "@/features/analytics";

// T50: the Analytics Posts table as a CSV, for the open brand only.
export async function GET(request: NextRequest): Promise<Response> {
  return postsCsvResponse(request.nextUrl.searchParams);
}
