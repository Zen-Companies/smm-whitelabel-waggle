import { describe, expect, it, vi } from "vitest";
import type { ServiceClient } from "@/lib/supabase/service";
import { writeAudit } from "./index";

function fakeDb(error: { message: string } | null = null) {
  const insert = vi.fn(async () => ({ error }));
  const from = vi.fn(() => ({ insert }));
  return { db: { from } as unknown as ServiceClient, from, insert };
}

describe("writeAudit", () => {
  it("inserts one audit_log row", async () => {
    const { db, from, insert } = fakeDb();

    await writeAudit(db, {
      tenantId: "tenant-1",
      itemId: "item-1",
      action: "classified",
      actor: "system",
      details: { category: "faq", confidence: 0.9 },
    });

    expect(from).toHaveBeenCalledWith("audit_log");
    expect(insert).toHaveBeenCalledWith({
      tenant_id: "tenant-1",
      item_id: "item-1",
      action: "classified",
      actor: "system",
      details: { category: "faq", confidence: 0.9 },
    });
  });

  it("defaults item_id to null and details to {}", async () => {
    const { db, insert } = fakeDb();
    await writeAudit(db, { tenantId: "tenant-1", action: "kb_entry_created", actor: "user-1" });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ item_id: null, details: {} }));
  });

  it("throws when the insert fails, so the step retries", async () => {
    const { db } = fakeDb({ message: "connection refused" });
    await expect(
      writeAudit(db, { tenantId: "t", action: "sent", actor: "system" }),
    ).rejects.toThrow("audit_log insert failed (sent): connection refused");
  });
});
