import { describe, expect, it } from "vitest";
import { MockSocialProvider, resolveSocialProviderMode } from "./mock";

describe("resolveSocialProviderMode", () => {
  it("defaults to mock under Vitest and Zernio otherwise", () => {
    expect(resolveSocialProviderMode({ VITEST: "true" })).toBe("mock");
    expect(resolveSocialProviderMode({})).toBe("zernio");
  });

  it("the env switch wins", () => {
    expect(resolveSocialProviderMode({ SOCIAL_PROVIDER_MODE: "mock" })).toBe("mock");
    expect(resolveSocialProviderMode({ SOCIAL_PROVIDER_MODE: "Zernio", VITEST: "1" })).toBe(
      "zernio",
    );
  });

  it("rejects unknown values and mock in production", () => {
    expect(() => resolveSocialProviderMode({ SOCIAL_PROVIDER_MODE: "fake" })).toThrow();
    expect(() =>
      resolveSocialProviderMode({ SOCIAL_PROVIDER_MODE: "mock", VERCEL_ENV: "production" }),
    ).toThrow(/production/);
  });
});

describe("MockSocialProvider", () => {
  it("replays a send with the same idempotency key", async () => {
    const social = new MockSocialProvider();
    const input = { accountId: "a", conversationId: "c", message: "hi", idempotencyKey: "k1" };
    const first = await social.sendDm(input);
    const again = await social.sendDm(input);
    expect(again).toEqual(first);
    expect(social.sends).toHaveLength(1);
    expect(await social.listConversationMessages({ conversationId: "c", accountId: "a" })).toEqual([
      expect.objectContaining({ id: first.providerMessageId, direction: "outgoing" }),
    ]);
  });

  it("connect returns to the app and profiles are stable per tenant", async () => {
    const social = new MockSocialProvider();
    const { authUrl } = await social.getConnectUrl({
      platform: "instagram",
      profileId: "p",
      redirectUrl: "http://localhost:3000/settings?connecting=instagram",
    });
    expect(authUrl).toBe("http://localhost:3000/settings?connecting=instagram&mock_connect=1");
    const a = await social.createProfile({ name: "x", externalId: "t1" });
    const b = await social.createProfile({ name: "y", externalId: "t1" });
    expect(a.profileId).toBe(b.profileId);
  });
});
