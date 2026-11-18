// GoHighLevel API client (docs/ghl-plan.md). Only the two calls Waggle needs:
//   POST /contacts/upsert           find-or-create a contact by email, set its custom fields
//   POST /contacts/{id}/tags        add tags (the trigger tag `waggle-app-event`)
//   POST /contacts/{id}/notes       a note on the contact (feedback, page ratings)
//   GET  /contacts/search/duplicate the contact by email, to keep its first UTMs
// Checked against HighLevel's API on 18 Nov. Never send `tags` in the upsert: it replaces every
// tag the contact has. Auth is a Private Integration Token on the Waggle sub-account.

export const GHL_BASE_URL = "https://services.leadconnectorhq.com";
export const GHL_VERSION = "2021-07-28";

export interface GhlConfig {
  token: string;
  locationId: string;
}

/** Token + sub-account from the environment, or null when HighLevel isn't set up here. */
export function ghlConfig(env: Record<string, string | undefined> = process.env): GhlConfig | null {
  const token = env.GHL_PRIVATE_TOKEN?.trim();
  const locationId = env.GHL_LOCATION_ID?.trim();
  return token && locationId ? { token, locationId } : null;
}

export interface GhlContactInput {
  email: string;
  name?: string | null;
  companyName?: string | null;
  /** Custom fields by key without the `contact.` prefix, e.g. `waggle_plan`. */
  fields: Record<string, string>;
}

export class GhlError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** Milliseconds to wait before trying again (rate limited), when HighLevel says. */
    readonly retryAfterMs: number | null = null,
  ) {
    super(message);
    this.name = "GhlError";
  }
}

export interface GhlClient {
  /** Returns the contact's HighLevel id. */
  upsertContact(input: GhlContactInput): Promise<{ contactId: string }>;
  addTags(contactId: string, tags: string[]): Promise<void>;
  addNote(contactId: string, note: { title: string; body: string }): Promise<void>;
  /** An existing contact's custom fields by plain key (`utm_source`), or {} when there's none. */
  contactFields(email: string): Promise<Record<string, string>>;
}

/** Pure: how long a 429 says to wait (HighLevel sends no Retry-After; its own headers say). */
export function rateLimitWaitMs(headers: Headers): number {
  if (headers.get("x-ratelimit-daily-remaining") === "0") {
    return Number(headers.get("x-ratelimit-daily-reset")) || 60 * 60_000;
  }
  return Number(headers.get("x-ratelimit-interval-milliseconds")) || 10_000;
}

/**
 * Pure: the upsert body. Field keys go WITHOUT the `contact.` prefix the sub-account shows
 * (`waggle_plan`, not `contact.waggle_plan`): HighLevel silently ignores the prefixed form
 * (found on a real send, 18 Nov).
 */
export function upsertBody(locationId: string, input: GhlContactInput) {
  return {
    locationId,
    email: input.email,
    ...(input.name ? { name: input.name } : {}),
    ...(input.companyName ? { companyName: input.companyName } : {}),
    customFields: Object.entries(input.fields).map(([key, value]) => ({
      key,
      fieldValue: value,
    })),
  };
}

export function createGhlClient(config: GhlConfig, doFetch: typeof fetch = fetch): GhlClient {
  /** Field id → plain key, read once per client (the sub-account's fields rarely change). */
  let fieldKeys: Promise<Map<string, string>> | null = null;
  const call = async (method: "POST" | "GET", path: string, body?: unknown): Promise<unknown> => {
    let res: Response;
    try {
      res = await doFetch(`${GHL_BASE_URL}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${config.token}`,
          Version: GHL_VERSION,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (err) {
      throw new GhlError(`HighLevel unreachable (${err instanceof Error ? err.name : "error"})`, 0);
    }
    if (res.status === 429) {
      throw new GhlError("HighLevel rate limit", 429, rateLimitWaitMs(res.headers));
    }
    if (!res.ok) {
      const text = (await res.text().catch(() => "")).slice(0, 300);
      throw new GhlError(
        `HighLevel ${path.split("/")[1]} failed (${res.status}): ${text}`,
        res.status,
      );
    }
    return res.json().catch(() => ({}));
  };

  return {
    async upsertContact(input) {
      const data = (await call(
        "POST",
        "/contacts/upsert",
        upsertBody(config.locationId, input),
      )) as {
        contact?: { id?: unknown };
      };
      const id = data.contact?.id;
      if (typeof id !== "string" || !id) {
        throw new GhlError("HighLevel upsert returned no contact id", 502);
      }
      return { contactId: id };
    },
    async addTags(contactId, tags) {
      await call("POST", `/contacts/${encodeURIComponent(contactId)}/tags`, { tags });
    },
    async contactFields(email) {
      fieldKeys ??= (
        call(
          "GET",
          `/locations/${encodeURIComponent(config.locationId)}/customFields?model=contact`,
        ) as Promise<{
          customFields?: { id: string; fieldKey: string }[];
        }>
      ).then(
        (r) =>
          new Map((r.customFields ?? []).map((f) => [f.id, f.fieldKey.replace(/^contact\./, "")])),
      );
      const found = (await call(
        "GET",
        `/contacts/search/duplicate?locationId=${encodeURIComponent(config.locationId)}&email=${encodeURIComponent(email)}`,
      )) as { contact?: { customFields?: { id: string; value?: unknown }[] } | null };
      const keys = await fieldKeys;
      const out: Record<string, string> = {};
      for (const f of found.contact?.customFields ?? []) {
        const key = keys.get(f.id);
        if (key && (typeof f.value === "string" || typeof f.value === "number")) {
          out[key] = String(f.value);
        }
      }
      return out;
    },
    async addNote(contactId, note) {
      await call("POST", `/contacts/${encodeURIComponent(contactId)}/notes`, {
        title: note.title.slice(0, 200),
        body: note.body.slice(0, 5000),
      });
    },
  };
}
