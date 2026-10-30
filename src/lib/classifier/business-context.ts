// What the classifiers are told about the business (docs/tdd.md §19, T25). One function for the
// job, the Lab and the triage report, so measured accuracy matches production.

export const BUSINESS_PROFILE_MAX = 1000;

export interface BusinessContext {
  text: string;
  /** profile: the owner's description; name: only the business name (no profile yet). */
  source: "profile" | "name";
}

export function businessContext(business: {
  name: string;
  profile?: string | null;
}): BusinessContext {
  const profile = (business.profile ?? "").trim().slice(0, BUSINESS_PROFILE_MAX);
  return profile
    ? { text: `${business.name.trim()}. ${profile}`, source: "profile" }
    : { text: business.name.trim(), source: "name" };
}
