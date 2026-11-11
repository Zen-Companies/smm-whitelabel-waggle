import type { NextRequest } from "next/server";

// Redirects go to the address the link was opened on. Behind a tunnel (ngrok) the dev server sees
// itself as https://localhost:3000, so request.url would send the browser to a dead address; the
// forwarded host and protocol name the real one.
export function siteUrl(request: NextRequest, path: string): URL {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const proto =
    request.headers.get("x-forwarded-proto") ?? new URL(request.url).protocol.replace(":", "");
  return new URL(path, host ? `${proto}://${host}` : request.url);
}
