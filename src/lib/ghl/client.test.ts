import { describe, expect, it, vi } from "vitest";
import { createGhlClient, ghlConfig, GhlError, rateLimitWaitMs, upsertBody } from "./client";

const config = { token: "pit-test", locationId: "loc1" };

describe("ghlConfig", () => {
  it("needs both the token and the sub-account", () => {
    expect(ghlConfig({ GHL_PRIVATE_TOKEN: "t", GHL_LOCATION_ID: "l" })).toEqual({
      token: "t",
      locationId: "l",
    });
    expect(ghlConfig({ GHL_PRIVATE_TOKEN: "t" })).toBeNull();
  });
});

describe("upsertBody", () => {
  it("sends fields by contact key and never tags", () => {
    const body = upsertBody("loc1", {
      email: "ana@cafe.com",
      name: "Ana Cruz",
      fields: { waggle_plan: "team", waggle_founding: "true" },
    });
    expect(body).toEqual({
      locationId: "loc1",
      email: "ana@cafe.com",
      name: "Ana Cruz",
      customFields: [
        { key: "contact.waggle_plan", fieldValue: "team" },
        { key: "contact.waggle_founding", fieldValue: "true" },
      ],
    });
    expect(body).not.toHaveProperty("tags");
  });
});

describe("createGhlClient", () => {
  it("upserts with the token and Version header, then returns the contact id", async () => {
    const fetch = vi.fn(async () => Response.json({ contact: { id: "c1" }, new: true }));
    const client = createGhlClient(config, fetch as unknown as typeof globalThis.fetch);
    await expect(client.upsertContact({ email: "a@b.co", fields: {} })).resolves.toEqual({
      contactId: "c1",
    });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://services.leadconnectorhq.com/contacts/upsert");
    expect(init.headers).toMatchObject({ Authorization: "Bearer pit-test", Version: "2021-07-28" });
  });

  it("adds tags on the contact", async () => {
    const fetch = vi.fn(async () => Response.json({ tags: ["waggle-app-event"] }, { status: 201 }));
    await createGhlClient(config, fetch as unknown as typeof globalThis.fetch).addTags("c1", [
      "waggle-app-event",
    ]);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://services.leadconnectorhq.com/contacts/c1/tags");
    expect(JSON.parse(init.body as string)).toEqual({ tags: ["waggle-app-event"] });
  });

  it("a 429 says how long to wait; other failures say the status", async () => {
    const limited = vi.fn(
      async () =>
        new Response("{}", {
          status: 429,
          headers: { "x-ratelimit-interval-milliseconds": "10000" },
        }),
    );
    const err = await createGhlClient(config, limited as unknown as typeof globalThis.fetch)
      .addTags("c1", ["x"])
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GhlError);
    expect((err as GhlError).retryAfterMs).toBe(10000);

    const bad = vi.fn(async () => new Response("nope", { status: 401 }));
    await expect(
      createGhlClient(config, bad as unknown as typeof globalThis.fetch).upsertContact({
        email: "a@b.co",
        fields: {},
      }),
    ).rejects.toMatchObject({ status: 401 });
  });

  it("waits for the daily window when the day's budget is spent", () => {
    const h = new Headers({
      "x-ratelimit-daily-remaining": "0",
      "x-ratelimit-daily-reset": "5000",
    });
    expect(rateLimitWaitMs(h)).toBe(5000);
  });
});
