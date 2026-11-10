import { describe, expect, it, vi } from "vitest";
import {
  createMailpitMailer,
  createResendMailer,
  getMailer,
  logMailer,
  MailerError,
} from "./mailer";

const email = {
  to: ["owner@example.com"],
  subject: "A message needs you",
  text: "Open the inbox",
  html: "<p>Open the inbox</p>",
  idempotencyKey: "alert-1",
};

describe("Resend mailer", () => {
  it("posts the email with an idempotency key and returns Resend's id", async () => {
    const fetch = vi.fn(async () => Response.json({ id: "re_123" }));
    const mailer = createResendMailer({ apiKey: "re_test", from: "Alerts <a@x.dev>", fetch });

    await expect(mailer.send(email)).resolves.toEqual({ providerId: "re_123", mode: "sent" });

    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.method).toBe("POST");
    const headers = new Headers(init.headers);
    expect(headers.get("Authorization")).toBe("Bearer re_test");
    expect(headers.get("Idempotency-Key")).toBe("alert-1");
    expect(JSON.parse(init.body as string)).toEqual({
      from: "Alerts <a@x.dev>",
      to: ["owner@example.com"],
      subject: "A message needs you",
      text: "Open the inbox",
      html: "<p>Open the inbox</p>",
    });
  });

  it("throws a MailerError with the status only", async () => {
    const fetch = vi.fn(async () =>
      Response.json({ message: "owner@example.com is invalid" }, { status: 422 }),
    );
    const mailer = createResendMailer({ apiKey: "k", from: "a@x.dev", fetch });
    const error = (await mailer.send(email).catch((e: unknown) => e)) as MailerError;
    expect(error).toBeInstanceOf(MailerError);
    expect(error.status).toBe(422);
    expect(error.message).not.toContain("owner@example.com");
  });

  it("logs instead of sending without a key, and always under Vitest", async () => {
    expect(getMailer({})).toBe(logMailer);
    expect(getMailer({ RESEND_API_KEY: "re_x" })).toBe(logMailer);
    expect(getMailer({ RESEND_API_KEY: "re_x", ALERT_FROM_EMAIL: "a@x.dev", VITEST: "1" })).toBe(
      logMailer,
    );
    expect(getMailer({ RESEND_API_KEY: "re_x", ALERT_FROM_EMAIL: "a@x.dev" })).not.toBe(logMailer);
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    await expect(logMailer.send(email)).resolves.toEqual({ providerId: null, mode: "logged" });
    expect(info.mock.calls[0][0]).not.toContain("owner@example.com");
    info.mockRestore();
  });
});

describe("Mailpit mailer (local)", () => {
  it("posts to Mailpit's send API and returns its message id", async () => {
    const fetch = vi.fn(async () => Response.json({ ID: "mp_1" }));
    const mailer = createMailpitMailer({
      url: "http://127.0.0.1:55324/",
      from: "w@localhost",
      fetch,
    });
    await expect(mailer.send(email)).resolves.toEqual({ providerId: "mp_1", mode: "sent" });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://127.0.0.1:55324/api/v1/send");
    expect(JSON.parse(init.body as string)).toMatchObject({
      From: { Email: "w@localhost" },
      To: [{ Email: "owner@example.com" }],
      Subject: "A message needs you",
    });
  });

  it("is used only without Resend, off Vercel and outside tests", () => {
    expect(getMailer({ MAILPIT_URL: "http://127.0.0.1:55324" })).not.toBe(logMailer);
    expect(getMailer({ MAILPIT_URL: "http://127.0.0.1:55324", VERCEL: "1" })).toBe(logMailer);
    expect(getMailer({ MAILPIT_URL: "http://127.0.0.1:55324", VITEST: "1" })).toBe(logMailer);
  });
});
