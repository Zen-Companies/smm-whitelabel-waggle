import { describe, expect, it } from "vitest";
import { resolveBrand, type ToolContext } from "./context";

// A stand-in for the two lookups: tenant_members rows [tenant_id, user_id], and the brands with
// AI assistants switched on (feature_flags).
function fakeDb(members: [string, string][], on: string[], role = "owner") {
  return {
    from: (table: string) => {
      const f: Record<string, string> = {};
      const q = {
        select: () => q,
        eq: (col: string, val: string) => {
          f[col] = val;
          return q;
        },
        in: (_col: string, ids: string[]) => ({
          // `.is("tenants.offboarded_at", null)`: none of these brands is offboarded.
          is: async () => ({
            data:
              table === "feature_flags"
                ? ids.filter((id) => on.includes(id)).map((tenant_id) => ({ tenant_id }))
                : [],
            error: null,
          }),
        }),
        maybeSingle: async () => ({
          data: members.some(([t, u]) => t === f.tenant_id && u === f.user_id)
            ? { tenant_id: f.tenant_id, role }
            : null,
        }),
      };
      return q;
    },
  };
}

const ctx = (brandIds: string[], members: [string, string][], on = ["b1", "b2"]) =>
  ({
    db: fakeDb(members, on),
    social: () => {
      throw new Error("unused");
    },
    principal: { userId: "u1", clientId: "c1", clientName: "Claude", brandIds },
  }) as unknown as ToolContext;

describe("resolveBrand", () => {
  it("a ticked brand the user still owns", async () => {
    await expect(resolveBrand(ctx(["b1", "b2"], [["b1", "u1"]]), "b1")).resolves.toBe("b1");
  });
  it("one ticked brand may be left out", async () => {
    await expect(resolveBrand(ctx(["b1"], [["b1", "u1"]]), undefined)).resolves.toBe("b1");
  });
  it("several ticked: brand_id required", async () => {
    await expect(resolveBrand(ctx(["b1", "b2"], []), undefined)).rejects.toMatchObject({
      code: "brand_required",
    });
  });
  it("a brand the user owns but didn't tick is refused", async () => {
    const owned: [string, string][] = [
      ["b1", "u1"],
      ["b2", "u1"],
    ];
    await expect(resolveBrand(ctx(["b1"], owned), "b2")).rejects.toMatchObject({
      code: "brand_not_allowed",
    });
  });
  it("a ticked brand the user no longer owns is refused", async () => {
    await expect(resolveBrand(ctx(["b1"], [["b1", "other"]]), "b1")).rejects.toMatchObject({
      code: "brand_not_allowed",
    });
  });
  it("a brand with AI assistants switched off is refused", async () => {
    await expect(resolveBrand(ctx(["b1"], [["b1", "u1"]], []), "b1")).rejects.toMatchObject({
      code: "brand_not_allowed",
      message: "AI assistants aren't turned on for this brand yet.",
    });
  });

  it("lets an act tool through only when the role can do it (T58)", async () => {
    const as = (role: string, requires: ToolContext["requires"]) =>
      ({
        ...ctx(["b1"], [["b1", "u1"]]),
        db: fakeDb([["b1", "u1"]], ["b1"], role),
        requires,
      }) as unknown as ToolContext;
    await expect(resolveBrand(as("member", "replies.approve"), "b1")).resolves.toBe("b1");
    await expect(resolveBrand(as("viewer", "replies.approve"), "b1")).rejects.toMatchObject({
      code: "role_not_allowed",
    });
    await expect(resolveBrand(as("viewer", "posts.write"), "b1")).rejects.toMatchObject({
      code: "role_not_allowed",
    });
    await expect(resolveBrand(as("viewer", undefined), "b1")).resolves.toBe("b1");
  });
});
