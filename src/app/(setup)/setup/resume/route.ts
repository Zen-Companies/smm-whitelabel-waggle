import { NextResponse } from "next/server";

/**
 * Retired with the setup gate (Walter's flow, 20 Nov): old links land on setup, which opens the
 * screen the owner left (or Connect when nothing is connected).
 */
export function GET(request: Request) {
  return NextResponse.redirect(new URL("/setup", request.url));
}
