"use server";

import { z } from "zod";
import { hasPermission } from "@/features/staff";
import type { Json } from "@/lib/supabase/database.types";
import { getCurrentUser } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";
import { BATCH_CHUNK, type BatchRow } from "./batch";
import { parseCaseForm, parseRunForm } from "./form";
import { loadTenantSnapshot, runVariant, type VariantRun } from "./run";
import { loadSet } from "./sets";
import { variantSchema } from "./variants";

// Lab actions (T24). Operator only, checked here too: a Server Action is reachable without the
// page. Real AI calls happen because the operator pressed Run; they are recorded as `lab`.

export interface LabRun {
  id: string | null;
  tenantId: string;
  tenantName: string;
  kind: "comment" | "dm";
  text: string;
  a: VariantRun;
  b: VariantRun;
}

export type LabRunState = { run?: LabRun; error?: string };

async function operator() {
  const user = await getCurrentUser();
  return (await hasPermission("admin.lab.use")) ? user : null;
}

export async function runLab(_prev: LabRunState, formData: FormData): Promise<LabRunState> {
  const user = await operator();
  if (!user) return { error: "Not available." };
  const parsed = parseRunForm(formData);
  if ("error" in parsed) return { error: parsed.error };
  const { request } = parsed;

  const db = getServiceClient();
  let tenant;
  try {
    // Lab calls are the operator's cost (T32): the business's AI allowance doesn't stop them.
    tenant = { ...(await loadTenantSnapshot(db, request.tenantId)), aiCapReached: false };
  } catch {
    return { error: "That business wasn't found." };
  }
  const stopAfter = request.draft ? "policy" : "triage";
  const common = {
    tenant,
    text: request.text,
    kind: request.kind,
    source: "lab",
    stopAfter,
  } as const;
  const [a, b] = await Promise.all([
    runVariant(db, { ...common, variant: request.a }),
    runVariant(db, { ...common, variant: request.b }),
  ]);

  const { data: saved } = await db
    .from("lab_runs")
    .insert({
      tenant_id: tenant.id,
      created_by: user.id,
      kind: request.kind,
      text: request.text,
      results: { a, b } as unknown as Json,
    })
    .select("id")
    .single();

  return {
    run: {
      id: saved?.id ?? null,
      tenantId: tenant.id,
      tenantName: tenant.name,
      kind: request.kind,
      text: request.text,
      a,
      b,
    },
  };
}

export type LabCaseState = { saved?: { setName: string }; error?: string };

/** Saves a message with its correct category to a labeled set (the report's test cases). */
export async function saveLabCase(_prev: LabCaseState, formData: FormData): Promise<LabCaseState> {
  const user = await operator();
  if (!user) return { error: "Not available." };
  const parsed = parseCaseForm(formData);
  if ("error" in parsed) return { error: parsed.error };
  const { input } = parsed;
  const { error } = await getServiceClient().from("lab_cases").insert({
    tenant_id: input.tenantId,
    set_name: input.setName,
    kind: input.kind,
    text: input.text,
    expected_category: input.expectedCategory,
    origin: "operator",
    created_by: user.id,
  });
  if (error) return { error: "Couldn't save the case. Try again." };
  return { saved: { setName: input.setName } };
}

const batchSchema = z.object({
  tenantId: z.uuid(),
  setKey: z.string().min(1).max(200),
  start: z.number().int().min(0),
  a: variantSchema,
  b: variantSchema,
});

export type BatchChunkState = { rows?: BatchRow[]; total?: number; done?: boolean; error?: string };

/**
 * Batch compare (T28): classifies the next few messages of a labeled set with both setups
 * (classification only). The page calls it chunk by chunk, so a run can be stopped.
 */
export async function runBatchChunk(input: z.infer<typeof batchSchema>): Promise<BatchChunkState> {
  const user = await operator();
  if (!user) return { error: "Not available." };
  const parsed = batchSchema.safeParse(input);
  if (!parsed.success) return { error: "Check both setups." };
  const { tenantId, setKey, start, a, b } = parsed.data;

  const db = getServiceClient();
  const set = await loadSet(db, setKey);
  if (!set) return { error: "That set isn't available here." };
  let tenant;
  try {
    tenant = { ...(await loadTenantSnapshot(db, set.tenantId ?? tenantId)), aiCapReached: false };
  } catch {
    return { error: "That business wasn't found." };
  }
  // Fixture sets are written for their own business: classify with its name and profile.
  if (set.business) {
    tenant = { ...tenant, name: set.business.name, businessProfile: set.business.profile };
  }

  const chunk = set.messages.slice(start, start + BATCH_CHUNK);
  const rows = await Promise.all(
    chunk.map(async (m): Promise<BatchRow> => {
      const common = {
        tenant,
        text: m.text,
        kind: m.kind,
        source: "lab",
        stopAfter: "triage",
      } as const;
      const [ra, rb] = await Promise.all([
        runVariant(db, { ...common, variant: a }),
        runVariant(db, { ...common, variant: b }),
      ]);
      return {
        id: m.id,
        text: m.text,
        expected: m.expected,
        a: ra.result.classification?.category ?? null,
        b: rb.result.classification?.category ?? null,
        ...(ra.result.error ? { aError: ra.result.error.message } : {}),
        ...(rb.result.error ? { bError: rb.result.error.message } : {}),
      };
    }),
  );
  return {
    rows,
    total: set.messages.length,
    done: start + BATCH_CHUNK >= set.messages.length,
  };
}
