"use server";

import * as Sentry from "@sentry/nextjs";
import { z } from "zod";
import { getTenantFor } from "@/features/tenants";
import { getServiceClient } from "@/lib/supabase/service";
import { viewerTimeZone } from "@/lib/time/viewer-zone";
import {
  checkingLabel,
  couldntReadLine,
  justCheckedLine,
  readingLine,
  usedTodayLine,
} from "./copy";
import { loadRunResult } from "./data";
import { requestCheckNow } from "./job";
import { kickWeeklyCheck } from "./kick";

// Today's Check now (board "Your week", approved 26 Nov). Answers are what the button shows, in
// place (no toasts): checking with progress, checked just now and what it found, or used today.

export type CheckNowView =
  | { kind: "idle" }
  | { kind: "checking"; runId: string; label: string; note: string | null }
  | { kind: "checked"; line: string; couldntRead: string | null }
  | { kind: "used"; line: string }
  | { kind: "error"; line: string };

const FAILED: CheckNowView = { kind: "error", line: "Couldn't check right now. Try again soon." };

export async function checkNowAction(): Promise<CheckNowView> {
  const tenant = await getTenantFor("replies.approve");
  if (!tenant) return { kind: "error", line: "Only people who answer messages can check." };
  try {
    const db = getServiceClient();
    const result = await requestCheckNow(db, { tenantId: tenant.id, userId: tenant.userId });
    if (result.outcome === "used") {
      return { kind: "used", line: usedTodayLine(new Date(result.at), await viewerTimeZone()) };
    }
    if (!result.runId) return { kind: "checking", runId: "", label: "Checking…", note: null };
    kickWeeklyCheck(tenant.id);
    return weeklyProgressAction(result.runId);
  } catch (error) {
    Sentry.captureException(error, { extra: { tenantId: tenant.id } });
    return FAILED;
  }
}

/** Polled while a check-up runs: progress, then what it found. */
export async function weeklyProgressAction(runId: string): Promise<CheckNowView> {
  const parsed = z.uuid().safeParse(runId);
  if (!parsed.success) return FAILED;
  const tenant = await getTenantFor("inbox.read");
  if (!tenant) return FAILED;
  try {
    const result = await loadRunResult(getServiceClient(), tenant.id, parsed.data);
    if (!result || result.status === "failed") return FAILED;
    if (result.status === "checking") {
      const p = result.progress;
      return {
        kind: "checking",
        runId: p.runId,
        label: p.total ? checkingLabel(p.done, p.total) : "Checking…",
        note: readingLine(p.reading),
      };
    }
    return {
      kind: "checked",
      line: justCheckedLine(result.found),
      couldntRead: result.failed.length ? couldntReadLine(result.failed) : null,
    };
  } catch (error) {
    Sentry.captureException(error, { extra: { tenantId: tenant.id } });
    return FAILED;
  }
}
