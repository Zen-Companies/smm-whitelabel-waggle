import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ServiceClient } from "@/lib/supabase/service";

const billing = vi.hoisted(() => ({
  roomForAnotherAccount: vi.fn<() => Promise<boolean>>(),
  orgOnFree: vi.fn<() => Promise<boolean>>(),
}));
const crm = vi.hoisted(() => ({
  queueForOwners: vi.fn(async () => undefined),
  queueQuietly: vi.fn(async (fn: () => Promise<unknown>) => {
    await fn();
  }),
}));

vi.mock("@/features/billing", () => billing);
vi.mock("@/lib/crm", () => crm);
vi.mock("./free-full", () => ({
  freeFullHref: vi.fn(
    async (_db: unknown, _t: string, origin: string, platform: string) =>
      `${origin}?upgrade=accounts&platform=${platform}`,
  ),
}));

const { accountsFullHref } = await import("./account-room");

const db = {} as ServiceClient;
const tenant = { id: "t1", organizationId: "o1" };

describe("accountsFullHref (Bluesky, Telegram, WhatsApp and LINE keys)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lets the connect go on when the plan has room", async () => {
    billing.roomForAnotherAccount.mockResolvedValue(true);
    await expect(accountsFullHref(db, tenant, "/settings/accounts", "bluesky")).resolves.toBe(null);
    expect(crm.queueForOwners).not.toHaveBeenCalled();
  });

  it("Free and full: the upgrade pop-up over the page, naming the platform", async () => {
    billing.roomForAnotherAccount.mockResolvedValue(false);
    billing.orgOnFree.mockResolvedValue(true);
    await expect(accountsFullHref(db, tenant, "/settings/accounts", "telegram")).resolves.toBe(
      "/settings/accounts?upgrade=accounts&platform=telegram",
    );
    expect(crm.queueForOwners).toHaveBeenCalledWith(
      db,
      "o1",
      expect.objectContaining({ event: "account_limit" }),
    );
  });

  it("a paid plan and full: the accounts-in-use line in place", async () => {
    billing.roomForAnotherAccount.mockResolvedValue(false);
    billing.orgOnFree.mockResolvedValue(false);
    await expect(accountsFullHref(db, tenant, "/settings/accounts", "line")).resolves.toBe(
      "/settings/accounts?connect_error=accounts_full&platform=line",
    );
  });
});
