import { NextResponse, type NextRequest } from "next/server";

// A checkout started from the old plan step (before the Free plan, 19 Nov) still returns here:
// send it to Your plan, which reads the session the same way.
export function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("session_id") ?? "";
  const q = /^cs_[A-Za-z0-9_]+$/.test(sessionId)
    ? `?upgrade=nudge&checkout=done&session_id=${encodeURIComponent(sessionId)}`
    : "";
  return NextResponse.redirect(new URL(`/plan${q}`, request.url));
}
