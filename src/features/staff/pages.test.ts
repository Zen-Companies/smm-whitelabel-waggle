import { expect, it } from "vitest";
import { firstStaffPage, PERMISSION_LABELS, staffPagesFor } from "./pages";
import { PERMISSIONS, type Permission } from "./permissions";

const set = (...p: Permission[]) => new Set<Permission>(p);

it("a role sees only the tabs it may open, in order", () => {
  // Support (approved matrix): MCP docs and activity only.
  expect(staffPagesFor(set("mcp.docs.view", "mcp.audit.view")).map((p) => p.label)).toEqual([
    "MCP tools",
    "MCP activity",
  ]);
  expect(staffPagesFor(set(...PERMISSIONS))).toHaveLength(8);
});

it("the top bar's Staff link goes to the first page, or nowhere for owners", () => {
  expect(firstStaffPage(set("mcp.audit.view"))).toBe("/admin/mcp-activity");
  expect(firstStaffPage(set("admin.costs.view", "mcp.audit.view"))).toBe("/admin/costs");
  expect(firstStaffPage(set())).toBeNull();
});

it("every permission has a plain label for the matrix", () => {
  for (const p of PERMISSIONS) expect(PERMISSION_LABELS[p]).toBeTruthy();
});
