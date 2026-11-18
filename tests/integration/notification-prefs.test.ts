import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anonClient, serviceClient, uniqueEmail } from "./helpers";

// Waggle emails (18 Nov): each person saves only their own email frequency; the site default
// and the summary queue are server-only.
const db = serviceClient();
const users: { id: string; client: ReturnType<typeof anonClient> }[] = [];

beforeAll(async () => {
  for (let i = 0; i < 2; i++) {
    const email = uniqueEmail();
    const client = anonClient();
    const { data } = await client.auth.signUp({ email, password: "password123" });
    await client.auth.signInWithPassword({ email, password: "password123" });
    users.push({ id: data.user!.id, client });
  }
});

afterAll(async () => {
  for (const u of users) await db.auth.admin.deleteUser(u.id);
});

describe("notification_prefs", () => {
  it("a person saves and reads their own choice", async () => {
    const [a] = users;
    const { error } = await a.client
      .from("notification_prefs")
      .upsert({ user_id: a.id, email_frequency: "two_hours" }, { onConflict: "user_id" });
    expect(error).toBeNull();
    const { error: again } = await a.client
      .from("notification_prefs")
      .upsert({ user_id: a.id, email_frequency: "now" }, { onConflict: "user_id" });
    expect(again).toBeNull();
    const { data } = await a.client.from("notification_prefs").select("email_frequency");
    expect(data).toEqual([{ email_frequency: "now" }]);
  });

  it("nobody reads or writes someone else's", async () => {
    const [a, b] = users;
    const { data: seen } = await b.client
      .from("notification_prefs")
      .select("user_id")
      .eq("user_id", a.id);
    expect(seen).toEqual([]);
    const { error } = await b.client
      .from("notification_prefs")
      .insert({ user_id: a.id, email_frequency: "hourly" });
    expect(error).not.toBeNull();
    await b.client
      .from("notification_prefs")
      .update({ email_frequency: "hourly" })
      .eq("user_id", a.id);
    const { data } = await db
      .from("notification_prefs")
      .select("email_frequency")
      .eq("user_id", a.id)
      .single();
    expect(data?.email_frequency).toBe("now");
  });

  it("the site default and the summary queue are server-only", async () => {
    const [a] = users;
    const { data: site } = await a.client.from("email_settings").select("default_frequency");
    expect(site ?? []).toEqual([]);
    const { data: queue } = await a.client.from("alert_digest_entries").select("id");
    expect(queue ?? []).toEqual([]);
  });
});
