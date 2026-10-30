"use server";

import { isOperatorEmail } from "@/features/billing";
import type { Json } from "@/lib/supabase/database.types";
import { getCurrentUser } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";
import { parseCaseForm, parseRunForm } from "./form";
import { loadTenantSnapshot, runVariant, type VariantRun } from "./run";

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
  return isOperatorEmail(user.email) ? user : null;
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
    tenant = await loadTenantSnapshot(db, request.tenantId);
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
