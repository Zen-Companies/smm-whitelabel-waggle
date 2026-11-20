import { NextResponse, type NextRequest } from "next/server";
import { draftPulledItem } from "@/features/catch-up";

// First connect (20 Nov), draft on open: the Inbox asks for a draft when the owner opens a pulled
// item that is still waiting for one (status awaiting_draft). A route, so the Inbox (approvals)
// doesn't import the catch-up feature, which imports approvals. Permission is checked inside.
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { itemId?: unknown } | null;
  const itemId = typeof body?.itemId === "string" ? body.itemId : "";
  const result = await draftPulledItem(itemId);
  const status = result.outcome === "not_allowed" ? 403 : 200;
  return NextResponse.json(result, { status, headers: { "Cache-Control": "no-store" } });
}
