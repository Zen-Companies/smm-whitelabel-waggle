import { describe, expect, it } from "vitest";
import type { ServiceClient } from "@/lib/supabase/service";
import { setTestBusiness } from "./test-business";

const ID = "00000000-0000-4000-8000-000000000001";

/** A tiny stand-in for the tenants and audit_log tables. */
function fakeDb(row: { is_test: boolean } | null) {
  const updates: unknown[] = [];
  const audits: Record<string, unknown>[] = [];
  const db = {
    from(table: string) {
      if (table === "audit_log") {
        return {
          insert: async (r: Record<string, unknown>) => {
            audits.push(r);
            return { error: null };
          },
        };
      }
      return {
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: row }) }),
        }),
        update: (u: unknown) => ({
          eq: async () => {
            updates.push(u);
            return { error: null };
          },
        }),
      };
    },
  } as unknown as ServiceClient;
  return { db, updates, audits };
}

describe("setTestBusiness", () => {
  it("saves the switch and writes the audit row", async () => {
    const f = fakeDb({ is_test: false });
    expect(await setTestBusiness(f.db, { tenantId: ID, actorId: "staff-1", on: true })).toBe(true);
    expect(f.updates).toEqual([{ is_test: true }]);
    expect(f.audits).toEqual([
      expect.objectContaining({
        tenant_id: ID,
        action: "test_business_changed",
        actor: "staff-1",
        details: { from: false, to: true },
      }),
    ]);
  });

  it("does nothing when the value is already set", async () => {
    const f = fakeDb({ is_test: true });
    expect(await setTestBusiness(f.db, { tenantId: ID, actorId: "staff-1", on: true })).toBe(true);
    expect(f.updates).toEqual([]);
    expect(f.audits).toEqual([]);
  });

  it("refuses a business that doesn't exist", async () => {
    const f = fakeDb(null);
    expect(await setTestBusiness(f.db, { tenantId: ID, actorId: "staff-1", on: true })).toBe(false);
  });
});
