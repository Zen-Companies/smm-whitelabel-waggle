import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  loadActivity,
  loadPlaygroundTargets,
  loadSwitches,
  parseActivityFilters,
  runPlayground,
  setBrandDailyCap,
  setBrandSwitch,
  setGlobalSwitch,
  TOOLS,
} from "@/features/mcp";
import { addStaffMember, changeStaffRole, listStaff, removeStaffMember } from "@/features/staff";
import { MockSocialProvider } from "@/lib/social/mock";
import { emailsOf, userIdByEmail } from "@/lib/supabase/users";
import { anonClient, serviceClient, uniqueEmail } from "./helpers";

// MCP Phase 4 (docs/mcp/PLAN.md §7): what the staff pages read and change, against the local
// database. The pages themselves only add the permission check (Server Actions) on top.

const db = serviceClient();
const social = new MockSocialProvider();
const deps = { db, social: () => social };
const users: Record<string, { id: string; email: string }> = {};
const tenantIds: string[] = [];
let testBrand: string;
let realBrand: string;

async function signUp(who: string) {
  const email = uniqueEmail();
  const { data } = await anonClient().auth.signUp({ email, password: "password123" });
  users[who] = { id: data.user!.id, email };
}

beforeAll(async () => {
  process.env.MCP_ENABLED = "true";
  for (const who of ["admin", "dev", "owner", "other", "outsider"]) await signUp(who);
  await db.from("staff_members").insert([
    { user_id: users.admin.id, role: "admin" },
    { user_id: users.dev.id, role: "developer" },
  ]);
  const { data: a } = await db.rpc("create_owner_tenant", {
    p_user_id: users.owner.id,
    p_name: "Playground Test Café",
  });
  testBrand = a![0].tenant_id;
  const { data: b } = await db.rpc("create_owner_tenant", {
    p_user_id: users.other.id,
    p_name: "Real Customer Bakery",
  });
  realBrand = b![0].tenant_id;
  tenantIds.push(testBrand, realBrand);
  await db.from("tenants").update({ is_test: true }).eq("id", testBrand);
});

afterAll(async () => {
  await db.from("feature_flags").delete().eq("key", "mcp").is("tenant_id", null);
  for (const id of tenantIds) await db.from("tenants").delete().eq("id", id);
  for (const u of Object.values(users)) await db.auth.admin.deleteUser(u.id);
});

it("logins by email and emails by login (server-only functions)", async () => {
  expect(await userIdByEmail(db, users.owner.email.toUpperCase())).toBe(users.owner.id);
  expect(await userIdByEmail(db, "nobody@example.invalid")).toBeNull();
  const map = await emailsOf(db, [users.owner.id, users.dev.id]);
  expect(map.get(users.dev.id)).toBe(users.dev.email);
});

describe("staff and roles", () => {
  it("adds by email, refuses unknown emails and people already staff", async () => {
    expect(await addStaffMember(db, users.admin.id, users.outsider.email, "support")).toEqual({
      ok: true,
    });
    expect(await addStaffMember(db, users.admin.id, users.outsider.email, "viewer")).toHaveProperty(
      "error",
    );
    expect(await addStaffMember(db, users.admin.id, "nobody@example.invalid", "viewer")).toEqual({
      error: "No Waggle login uses that email. They need to sign up first.",
    });
    const row = (await listStaff(db)).find((m) => m.userId === users.outsider.id);
    expect(row).toMatchObject({ email: users.outsider.email, role: "support" });
  });

  it("changes and removes others, never yourself", async () => {
    expect(await changeStaffRole(db, users.admin.id, users.outsider.id, "viewer")).toEqual({
      ok: true,
    });
    expect(await changeStaffRole(db, users.admin.id, users.admin.id, "viewer")).toHaveProperty(
      "error",
    );
    expect(await removeStaffMember(db, users.admin.id, users.admin.id)).toHaveProperty("error");
    expect(await removeStaffMember(db, users.admin.id, users.outsider.id)).toEqual({ ok: true });
    expect((await listStaff(db)).some((m) => m.userId === users.outsider.id)).toBe(false);
    expect((await listStaff(db)).find((m) => m.userId === users.admin.id)?.role).toBe("admin");
  });
});

describe("switches", () => {
  it("a brand switch and daily limit save, with an audit row each", async () => {
    expect(await setBrandSwitch(db, users.admin.id, testBrand, true)).toBe(true);
    expect(await setBrandSwitch(db, users.admin.id, testBrand, true)).toBe(true); // no duplicate row
    expect(await setBrandDailyCap(db, users.admin.id, testBrand, 250)).toBe(true);
    const { count } = await db
      .from("feature_flags")
      .select("id", { count: "exact", head: true })
      .eq("key", "mcp")
      .eq("tenant_id", testBrand);
    expect(count).toBe(1);
    const { data: audit } = await db
      .from("audit_log")
      .select("action, actor, details")
      .eq("tenant_id", testBrand)
      .in("action", ["ai_assistants_switched_on", "ai_daily_limit_changed"]);
    expect(audit?.map((a) => a.action).sort()).toEqual([
      "ai_assistants_switched_on",
      "ai_assistants_switched_on",
      "ai_daily_limit_changed",
    ]);
    expect(audit?.find((a) => a.action === "ai_daily_limit_changed")?.details).toEqual({
      from: null,
      to: 250,
    });
    expect(
      await setBrandSwitch(db, users.admin.id, "00000000-0000-4000-8000-000000000000", true),
    ).toBe(false);
  });

  it("the Switches list shows each brand's state, owner and limit; search narrows it", async () => {
    const { rows } = await loadSwitches(db, "Playground Test", new Date());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: testBrand,
      isTest: true,
      on: true,
      owner: users.owner.email,
      dailyCap: 250,
      connected: 0,
    });
    const real = (await loadSwitches(db, "Real Customer", new Date())).rows[0];
    expect(real).toMatchObject({ on: false, isTest: false });
  });
});

describe("Try it (playground)", () => {
  const run = (over: Partial<Parameters<typeof runPlayground>[1]> = {}) =>
    runPlayground(deps, {
      staffId: users.dev.id,
      staffEmail: users.dev.email,
      userId: users.owner.id,
      tenantId: testBrand,
      tool: "list_brands",
      input: "{}",
      ...over,
    });

  it("offers the owners of test brands only", async () => {
    const targets = await loadPlaygroundTargets(db);
    const mine = targets.find((t) => t.userId === users.owner.id);
    expect(mine?.brands).toEqual([{ id: testBrand, name: "Playground Test Café", on: true }]);
    expect(targets.some((t) => t.userId === users.other.id)).toBe(false);
  });

  it("refuses real brands, other logins and bad input", async () => {
    expect(await run({ tenantId: realBrand, userId: users.other.id })).toEqual({
      refused: "Try it runs on test brands only.",
    });
    expect(await run({ userId: users.other.id })).toEqual({
      refused: "That login doesn't own this brand.",
    });
    expect(await run({ input: "{not json" })).toEqual({ refused: "Input isn't valid JSON." });
    expect(await run({ input: "[1]" })).toEqual({ refused: "Input must be a JSON object." });
    expect(await run({ tool: "drop_everything" })).toEqual({ refused: "That tool doesn't exist." });
  });

  it("runs through callTool as the owner, on the picked brand whatever the input says", async () => {
    const out = await run();
    expect(out).toMatchObject({ ok: true });
    expect(
      JSON.parse((out as { body: string }).body).brands.map(
        (b: { brand_id: string }) => b.brand_id,
      ),
    ).toEqual([testBrand]);
    // brand_id in the input is replaced by the picked test brand.
    const forced = await run({
      tool: "list_posts",
      input: JSON.stringify({ brand_id: realBrand }),
    });
    expect(forced).toMatchObject({ ok: true });

    const { data: logged } = await db
      .from("mcp_calls")
      .select("tool, tenant_id, playground, client_id, client_name, user_id, status")
      .eq("user_id", users.owner.id)
      .order("at");
    expect(logged).toEqual([
      expect.objectContaining({
        tool: "list_brands",
        playground: true,
        client_id: "playground",
        status: "ok",
      }),
      expect.objectContaining({ tool: "list_posts", tenant_id: testBrand, playground: true }),
    ]);
    expect(logged![0].client_name).toBe(`Playground · ${users.dev.email}`);
    const { count } = await db
      .from("audit_log")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", testBrand)
      .eq("action", "mcp_playground_run")
      .eq("actor", users.dev.id);
    expect(count).toBe(2);
  });

  it("an error comes back with its code", async () => {
    const out = await run({ tool: "get_conversation", input: JSON.stringify({ item_id: "nope" }) });
    expect(out).toMatchObject({ ok: false, code: "invalid_input" });
  });

  it("the global switch pauses the playground too", async () => {
    await setGlobalSwitch(db, users.admin.id, false);
    expect(await run()).toMatchObject({ ok: false, code: "unavailable" });
    await setGlobalSwitch(db, users.admin.id, true);
  });
});

describe("activity", () => {
  it("lists calls with brand and login, filters by brand, playground and errors", async () => {
    const tools = TOOLS.map((t) => t.name);
    const now = new Date(Date.now() + 1000);
    const all = await loadActivity(db, parseActivityFilters({ brand: testBrand }, tools), now);
    expect(all.rows.length).toBe(3); // list_brands, list_posts, get_conversation
    expect(all.rows[0]).toMatchObject({
      brand: "Playground Test Café (test)",
      user: users.owner.email,
      playground: true,
    });
    expect(all.summary.calls).toBeGreaterThanOrEqual(all.rows.length);

    const errors = await loadActivity(
      db,
      parseActivityFilters({ brand: testBrand, errors: "1" }, tools),
      now,
    );
    // A paused call is refused before it is logged; the bad input is logged as an error.
    expect(errors.rows.map((r) => r.errorCode)).toEqual(["invalid_input"]);

    const claude = await loadActivity(
      db,
      parseActivityFilters({ brand: testBrand, assistant: "Claude" }, tools),
      now,
    );
    expect(claude.rows).toEqual([]);
  });
});
