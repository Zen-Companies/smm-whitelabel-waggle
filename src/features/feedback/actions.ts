"use server";

import { z } from "zod";
import { sendGhlEvent } from "@/lib/ghl";
import { getCurrentUser } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";
import { FEEDBACK_TYPES, FOLLOW_UP_MAX, MESSAGE_MAX, NUDGES, REASON_MAX, pageInfo } from "./pages";
import { feedbackContext, loadEarlier, type EarlierNote } from "./server";

// Help & feedback (design v3 "Beta access and feedback"). Every note and page rating is kept
// (Your requests) and sent to GHL; a GHL failure never loses the note.

const nameOf = (meta: Record<string, unknown> | undefined, email: string | undefined) =>
  typeof meta?.full_name === "string" && meta.full_name.trim()
    ? meta.full_name.trim()
    : (email ?? "");

const idOrNull = (v: FormDataEntryValue | null) => {
  const r = z.uuid().safeParse(v);
  return r.success ? r.data : null;
};

export type SendState = { error?: string; sentAt?: number; earlier?: EarlierNote[] };

/** Send a note: the message, an optional type and the answer to its one open question. */
export async function sendFeedback(_prev: SendState, formData: FormData): Promise<SendState> {
  const message = String(formData.get("message") ?? "").trim();
  if (!message) return { error: "Write a few words first." };
  if (message.length > MESSAGE_MAX)
    return { error: "That's a lot. Keep it under 4,000 characters." };
  const typeParsed = z.enum(FEEDBACK_TYPES).safeParse(formData.get("type"));
  const type = typeParsed.success ? typeParsed.data : null;
  const followUp = String(formData.get("followUp") ?? "")
    .trim()
    .slice(0, FOLLOW_UP_MAX);
  const contactOk = formData.get("contactOk") === "on";
  const page = pageInfo(String(formData.get("path") ?? "/")).page;

  const user = await getCurrentUser();
  const db = getServiceClient();
  const ctx = await feedbackContext(
    db,
    user.id,
    idOrNull(formData.get("orgId")),
    idOrNull(formData.get("tenantId")),
  );
  const { data: row, error } = await db
    .from("feedback")
    .insert({
      user_id: user.id,
      kind: "note",
      type,
      message,
      follow_up: followUp,
      contact_ok: contactOk,
      page,
      organization_id: ctx.organizationId,
      tenant_id: ctx.tenantId,
    })
    .select("id, created_at")
    .single();
  if (error || !row) return { error: "Couldn't send it. Try again in a moment." };

  const sent = await sendGhlEvent({
    event: "feedback",
    email: user.email ?? "",
    name: nameOf(user.user_metadata, user.email),
    type: type ?? "",
    message,
    followUp,
    contactOk,
    page,
    organization: ctx.organization,
    brand: ctx.brand,
    role: ctx.role,
    betaCode: ctx.betaCode,
    submittedAt: row.created_at,
  });
  if (sent === "sent") {
    await db.from("feedback").update({ sent_to_ghl_at: new Date().toISOString() }).eq("id", row.id);
  }
  return { sentAt: Date.now(), earlier: await loadEarlier(db, user.id) };
}

/** "How's this page?" 👍 / 👎, with an optional reason sent along (or added a moment later). */
export async function ratePage(formData: FormData): Promise<{ ok: boolean; id?: string }> {
  const rating = z.enum(["good", "not_good"]).safeParse(formData.get("rating"));
  if (!rating.success) return { ok: false };
  const reason = String(formData.get("reason") ?? "")
    .trim()
    .slice(0, REASON_MAX);
  const page = pageInfo(String(formData.get("path") ?? "/")).page;
  const user = await getCurrentUser();
  const db = getServiceClient();
  const ctx = await feedbackContext(
    db,
    user.id,
    idOrNull(formData.get("orgId")),
    idOrNull(formData.get("tenantId")),
  );
  const { data: row, error } = await db
    .from("feedback")
    .insert({
      user_id: user.id,
      kind: "rating",
      rating: rating.data,
      reason,
      page,
      organization_id: ctx.organizationId,
      tenant_id: ctx.tenantId,
    })
    .select("id, created_at")
    .single();
  if (error || !row) return { ok: false };
  const sent = await sendGhlEvent({
    event: "page_rating",
    email: user.email ?? "",
    name: nameOf(user.user_metadata, user.email),
    page,
    rating: rating.data,
    reason,
    organization: ctx.organization,
    brand: ctx.brand,
    ratedAt: row.created_at,
  });
  if (sent === "sent") {
    await db.from("feedback").update({ sent_to_ghl_at: new Date().toISOString() }).eq("id", row.id);
  }
  return { ok: true, id: row.id };
}

/** The optional "what made it good or not good?" after a tap: saved on that rating, sent again. */
export async function addRatingReason(formData: FormData): Promise<{ ok: boolean }> {
  const id = idOrNull(formData.get("id"));
  const reason = String(formData.get("reason") ?? "")
    .trim()
    .slice(0, REASON_MAX);
  if (!id || !reason) return { ok: false };
  const user = await getCurrentUser();
  const db = getServiceClient();
  const { data: row } = await db
    .from("feedback")
    .update({ reason })
    .eq("id", id)
    .eq("user_id", user.id)
    .eq("kind", "rating")
    .select("page, rating, organization_id, tenant_id, created_at")
    .maybeSingle();
  if (!row || !row.rating) return { ok: false };
  const ctx = await feedbackContext(db, user.id, row.organization_id, row.tenant_id);
  await sendGhlEvent({
    event: "page_rating",
    email: user.email ?? "",
    name: nameOf(user.user_metadata, user.email),
    page: row.page,
    rating: row.rating === "good" ? "good" : "not_good",
    reason,
    organization: ctx.organization,
    brand: ctx.brand,
    ratedAt: row.created_at,
  });
  return { ok: true };
}

/** A nudge was shown, opened ("Tell us") or dismissed ("Not now"). Each key once per person. */
export async function markNudge(
  key: string,
  outcome: "shown" | "opened" | "dismissed",
): Promise<void> {
  if (!(key in NUDGES)) return;
  const user = await getCurrentUser();
  const db = getServiceClient();
  if (outcome === "shown") {
    await db.from("feedback_nudges").upsert({ user_id: user.id, key }, { ignoreDuplicates: true });
    return;
  }
  await db.from("feedback_nudges").update({ outcome }).eq("user_id", user.id).eq("key", key);
}
