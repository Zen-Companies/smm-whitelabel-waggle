import { afterAll, beforeAll, expect, it } from "vitest";
import { staffAccess } from "@/features/staff";
import { anonClient, serviceClient, uniqueEmail } from "./helpers";

// MCP Phase 3 (docs/mcp/PLAN.md §7): staff roles read from the database replace the `operator`
// app_metadata role. Owners have none; each role gets the approved permissions.
const db = serviceClient();
const ids: Record<string, string> = {};

beforeAll(async () => {
  for (const who of ["admin", "viewer", "owner"]) {
    const { data } = await anonClient().auth.signUp({
      email: uniqueEmail(),
      password: "password123",
    });
    ids[who] = data.user!.id;
  }
  await db.from("staff_members").insert([
    { user_id: ids.admin, role: "admin" },
    { user_id: ids.viewer, role: "viewer" },
  ]);
});

afterAll(async () => {
  for (const id of Object.values(ids)) await db.auth.admin.deleteUser(id);
});

it("an admin can do everything, including caps, switches and staff", async () => {
  const a = await staffAccess(db, ids.admin);
  expect(a.role).toBe("admin");
  for (const p of [
    "admin.caps.manage",
    "flags.manage",
    "staff.manage",
    "mcp.playground.run",
  ] as const) {
    expect(a.permissions.has(p)).toBe(true);
  }
});

it("a viewer sees costs and activity but changes nothing", async () => {
  const v = await staffAccess(db, ids.viewer);
  expect([...v.permissions].sort()).toEqual([
    "admin.costs.view",
    "mcp.audit.view",
    "mcp.docs.view",
  ]);
});

it("a business owner has no staff access, whatever their app_metadata says", async () => {
  await db.auth.admin.updateUserById(ids.owner, { app_metadata: { role: "operator" } });
  const o = await staffAccess(db, ids.owner);
  expect(o).toEqual({ role: null, permissions: new Set() });
});
