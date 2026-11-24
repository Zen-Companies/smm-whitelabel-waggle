import { describe, expect, it, vi } from "vitest";
import type { ServiceClient } from "@/lib/supabase/service";
import { createSigninLink, redeemSigninLink } from "./signin-link-server";

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

const USER = "11111111-1111-4111-8111-111111111111";
const ORG = "22222222-2222-4222-8222-222222222222";
const LINK = "33333333-3333-4333-8333-333333333333";
const HASH = "f".repeat(56);
const now = new Date("2026-11-25T10:00:00Z");

/** A fake query chain: every filter returns itself; awaiting it or .single() gives `result`. */
function chain(result: unknown, calls: unknown[][] = []) {
  const c: Record<string, unknown> = {};
  for (const m of ["select", "eq", "gte", "gt", "is", "insert", "update"]) {
    c[m] = (...args: unknown[]) => {
      calls.push([m, ...args]);
      return c;
    };
  }
  c.single = async () => result;
  c.maybeSingle = async () => result;
  c.then = (resolve: (v: unknown) => unknown) => resolve(result);
  return c;
}

function fakeDb(opts: {
  recent?: number;
  linkUser?: string;
  linkError?: boolean;
  redeemRow?: { user_id: string; organization_id: string | null; next: string } | null;
}) {
  const inserts: { table: string; row: unknown }[] = [];
  const generateLink = vi.fn(async () =>
    opts.linkError
      ? { data: { user: null, properties: null }, error: new Error("nope") }
      : {
          data: { user: { id: opts.linkUser ?? USER }, properties: { hashed_token: HASH } },
          error: null,
        },
  );
  const db = {
    auth: { admin: { generateLink } },
    from: (table: string) => {
      if (table === "signin_links") {
        const base = chain({ count: opts.recent ?? 0, data: null, error: null });
        return {
          ...base,
          select: () => chain({ count: opts.recent ?? 0 }),
          insert: (row: unknown) => {
            inserts.push({ table, row });
            return chain({ data: { id: LINK }, error: null });
          },
          update: () => chain({ data: opts.redeemRow ?? null, error: null }),
        };
      }
      return {
        insert: async (row: unknown) => {
          inserts.push({ table, row });
          return { error: null };
        },
      };
    },
  } as unknown as ServiceClient;
  return { db, inserts, generateLink };
}

const base = {
  userId: USER,
  email: "owner@cafe.test",
  emailConfirmed: true,
  organizationId: ORG,
  next: "/welcome?before=instagram",
  origin: "https://app.waggle.test",
  now,
};

describe("createSigninLink", () => {
  it("makes a 10-minute link to the same setup screen and audits it without the token", async () => {
    const { db, inserts } = fakeDb({});
    const link = await createSigninLink(db, base);
    expect(link?.expiresAt).toBe("2026-11-25T10:10:00.000Z");
    expect(link?.url).toBe(`https://app.waggle.test/auth/handoff?id=${LINK}&token_hash=${HASH}`);
    const row = inserts.find((i) => i.table === "signin_links")?.row as Record<string, unknown>;
    expect(row).toMatchObject({ user_id: USER, next: "/welcome?before=instagram" });
    expect(JSON.stringify(row)).not.toContain(HASH);
    const audit = inserts.find((i) => i.table === "organization_audit")?.row;
    expect(audit).toMatchObject({ action: "signin_link_created", actor: USER });
    expect(JSON.stringify(audit)).not.toContain(HASH);
  });
  it("makes none for an unconfirmed email", async () => {
    const { db, generateLink } = fakeDb({});
    expect(await createSigninLink(db, { ...base, emailConfirmed: false })).toBeNull();
    expect(generateLink).not.toHaveBeenCalled();
  });
  it("makes none past the limit", async () => {
    const { db, generateLink } = fakeDb({ recent: 12 });
    expect(await createSigninLink(db, base)).toBeNull();
    expect(generateLink).not.toHaveBeenCalled();
  });
  it("makes none when Supabase's token is for someone else or fails", async () => {
    expect(await createSigninLink(fakeDb({ linkUser: "someone-else" }).db, base)).toBeNull();
    expect(await createSigninLink(fakeDb({ linkError: true }).db, base)).toBeNull();
  });
});

describe("redeemSigninLink", () => {
  const row = { user_id: USER, organization_id: ORG, next: "/welcome?all=1" };
  it("signs in once and lands on the saved screen", async () => {
    const { db, inserts } = fakeDb({ redeemRow: row });
    const verify = vi.fn(async () => ({ userId: USER }));
    const signOut = vi.fn(async () => undefined);
    expect(await redeemSigninLink(db, { id: LINK, tokenHash: HASH, now }, verify, signOut)).toBe(
      "/welcome?all=1",
    );
    expect(verify).toHaveBeenCalledWith(HASH);
    expect(signOut).not.toHaveBeenCalled();
    expect(inserts.find((i) => i.table === "organization_audit")?.row).toMatchObject({
      action: "signin_link_used",
    });
  });
  it("refuses a used or expired link without asking Supabase", async () => {
    const { db } = fakeDb({ redeemRow: null });
    const verify = vi.fn(async () => ({ userId: USER }));
    expect(
      await redeemSigninLink(db, { id: LINK, tokenHash: HASH, now }, verify, async () => {}),
    ).toBeNull();
    expect(verify).not.toHaveBeenCalled();
  });
  it("signs out when the token belongs to someone else", async () => {
    const { db } = fakeDb({ redeemRow: row });
    const signOut = vi.fn(async () => undefined);
    expect(
      await redeemSigninLink(
        db,
        { id: LINK, tokenHash: HASH, now },
        async () => ({ userId: "someone-else" }),
        signOut,
      ),
    ).toBeNull();
    expect(signOut).toHaveBeenCalled();
  });
  it("refuses when Supabase says no", async () => {
    const { db } = fakeDb({ redeemRow: row });
    expect(
      await redeemSigninLink(
        db,
        { id: LINK, tokenHash: HASH, now },
        async () => ({ userId: null }),
        async () => {},
      ),
    ).toBeNull();
  });
});
