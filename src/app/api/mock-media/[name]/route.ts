import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { MOCK_MEDIA_DIR, resolveSocialProviderMode } from "@/lib/social";

// SOCIAL_PROVIDER_MODE=mock only: serves post images and videos the mock provider stored, so the
// posts page shows them in local demos, and takes the browser's PUT of a video (the mock's
// stand-in for Zernio's presigned storage). 404 in every other mode.
const TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  m4v: "video/x-m4v",
};

const NAME = /^[0-9a-f]{24}\.(jpg|png|webp|gif|mp4|mov|webm|m4v)$/;

/** The mock's presigned upload: the browser PUTs the file here (local demos only). */
export async function PUT(request: Request, ctx: RouteContext<"/api/mock-media/[name]">) {
  if (resolveSocialProviderMode(process.env) !== "mock") return new Response(null, { status: 404 });
  const { name } = await ctx.params;
  if (!NAME.test(name)) return new Response(null, { status: 404 });
  await mkdir(MOCK_MEDIA_DIR, { recursive: true });
  await writeFile(join(MOCK_MEDIA_DIR, name), new Uint8Array(await request.arrayBuffer()));
  return new Response(null, { status: 200 });
}

export async function GET(_request: Request, ctx: RouteContext<"/api/mock-media/[name]">) {
  if (resolveSocialProviderMode(process.env) !== "mock") return new Response(null, { status: 404 });
  const { name } = await ctx.params;
  const match = name.match(NAME);
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
