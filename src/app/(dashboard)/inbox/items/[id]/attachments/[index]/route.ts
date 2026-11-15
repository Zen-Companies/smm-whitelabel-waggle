import { NextResponse } from "next/server";
import { attachmentPreviewUrl } from "@/features/approvals";

// T72: the photo a customer sent, fetched fresh (platform links expire), for the inbox preview.
export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string; index: string }> },
) {
  const { id, index } = await ctx.params;
  const url = await attachmentPreviewUrl({ itemId: id, index });
  if (!url) return new NextResponse(null, { status: 404 });
  const res = NextResponse.redirect(url, 302);
  res.headers.set("Cache-Control", "private, no-store");
  return res;
}
