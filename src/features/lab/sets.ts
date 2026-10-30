import "server-only";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { loadLabeledSet } from "@/features/triage";
import type { Category } from "@/lib/classifier/types";
import type { ServiceClient } from "@/lib/supabase/service";

// Labeled sets for the Lab's batch compare (T28): the repository's fixture sets (available where
// the repository is, i.e. locally) and the sets saved from the Lab and owners' corrections.

export interface LabSetSummary {
  key: string;
  label: string;
  count: number;
}

export interface LabSet {
  /** The business the messages are written for; null = the tenant's own (saved sets). */
  business: { name: string; profile: string } | null;
  tenantId: string | null;
  messages: { id: string; text: string; kind: "comment" | "dm"; expected: Category }[];
}

const FIXTURES = [
  { key: "fixture:cafe", dir: "tests/fixtures/triage" },
  { key: "fixture:digital-products", dir: "tests/fixtures/triage-sets/digital-products" },
  { key: "fixture:salon", dir: "tests/fixtures/triage-sets/salon" },
];

const fixtureDir = (dir: string) => join(process.cwd(), dir);

export async function listSets(db: ServiceClient): Promise<LabSetSummary[]> {
  const sets: LabSetSummary[] = [];
  for (const f of FIXTURES) {
    if (!existsSync(fixtureDir(f.dir)) || readdirSync(fixtureDir(f.dir)).length === 0) continue;
    const set = loadLabeledSet(fixtureDir(f.dir));
    sets.push({
      key: f.key,
      label: `${set.business.name} (labeled set)`,
      count: set.messages.length,
    });
  }
  const { data } = await db.from("lab_cases").select("tenant_id, set_name, tenants (name)");
  const saved = new Map<string, LabSetSummary>();
  for (const row of (data ?? []) as unknown as {
    tenant_id: string;
    set_name: string;
    tenants: { name: string } | null;
  }[]) {
    const key = `saved:${row.tenant_id}:${encodeURIComponent(row.set_name)}`;
    const current = saved.get(key);
    if (current) current.count += 1;
    else saved.set(key, { key, label: `${row.set_name} · ${row.tenants?.name ?? "?"}`, count: 1 });
  }
  return [...sets, ...saved.values()];
}

export async function loadSet(db: ServiceClient, key: string): Promise<LabSet | null> {
  const fixture = FIXTURES.find((f) => f.key === key);
  if (fixture) {
    if (!existsSync(fixtureDir(fixture.dir))) return null;
    const set = loadLabeledSet(fixtureDir(fixture.dir));
    return {
      business: set.business,
      tenantId: null,
      messages: set.messages.map((m) => ({
        id: m.id,
        text: m.text,
        kind: m.kind,
        expected: m.expected,
      })),
    };
  }
  const match = /^saved:([0-9a-f-]{36}):(.+)$/.exec(key);
  if (!match) return null;
  const [, tenantId, setName] = match;
  const { data } = await db
    .from("lab_cases")
    .select("id, text, kind, expected_category")
    .eq("tenant_id", tenantId)
    .eq("set_name", decodeURIComponent(setName))
    .order("created_at");
  return {
    business: null,
    tenantId,
    messages: (data ?? []).map((c) => ({
      id: c.id,
      text: c.text,
      kind: c.kind as "comment" | "dm",
      expected: c.expected_category as Category,
    })),
  };
}
