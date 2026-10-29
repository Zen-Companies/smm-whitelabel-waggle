import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { MOCK_MEDIA_DIR, resolveSocialProviderMode } from "@/lib/social";

// SOCIAL_PROVIDER_MODE=mock only: serves post images the mock provider stored, so the posts page
// shows them in local demos. 404 in every other mode.
const TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

export async function GET(_request: Request, ctx: RouteContext<"/api/mock-media/[name]">) {
  if (resolveSocialProviderMode(process.env) !== "mock") return new Response(null, { status: 404 });
  const { name } = await ctx.params;
  const match = name.match(/^[0-9a-f]{24}\.(jpg|png|webp|gif)$/);
  if (!match) return new Response(null, { status: 404 });
  try {
    const bytes = await readFile(join(MOCK_MEDIA_DIR, name));
    return new Response(bytes, {
      headers: { "Content-Type": TYPES[match[1]], "Cache-Control": "public, max-age=3600" },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}
