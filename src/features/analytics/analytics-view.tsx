import Link from "next/link";
import { platformName } from "@/components/app/time";
import { BrandSetup } from "@/features/accounts";
import { getCurrentTenant } from "@/features/tenants";
import { createServerSupabase } from "@/lib/supabase/server";
import { AudienceSection } from "./audience-section";
import {
  latestSync,
  loadAccounts,
  loadAudience,
  loadOverview,
  loadPostComments,
  loadPostDetail,
  loadPostMetrics,
  loadWork,
  type AnalyticsAccount,
} from "./data";
import { LocalClock } from "./local-time";
import { OverviewSection, parseMeasure } from "./overview-section";
import { AccountProblems, CollectingNumbers } from "./parts";
import {
  analyticsHref,
  param,
  parsePeriod,
  parsePlatform,
  parseSection,
  SECTIONS,
  windowFor,
  type Section,
} from "./period";
import { parseDir, parseMade, parseSort, parseType } from "./posts";
import { PostsSection } from "./posts-section";
import { ANALYTICS_PERIODS } from "./sync";
import { WorkSection } from "./work-section";
import { isAnalyticsLive } from "@/lib/social/platforms";

// Analytics (T49-T52, design v3 "Analytics"): the brand's numbers, copied from Zernio by the
// sync job (TDD §7.7), and Waggle's own work from our tables. Controls are links (searchParams).

type Params = Record<string, string | string[] | undefined>;

/** "Instagram @harbourbeancafe and Facebook @harbourbeancafe" */
function accountsLine(accounts: AnalyticsAccount[]): string {
  const names = accounts.map(
    (a) => `${platformName(a.platform)}${a.username ? ` @${a.username}` : ""}`,
  );
  return names.length <= 1
    ? (names[0] ?? "")
    : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** The params each section keeps when another control changes. */
function sectionParams(section: Section, params: Params): Record<string, string | undefined> {
  if (section === "overview") return { measure: param(params, "measure") };
  if (section === "audience") return { where: param(params, "where") };
  if (section === "posts") {
    return {
      made: param(params, "made"),
      type: param(params, "type"),
      sort: param(params, "sort"),
      dir: param(params, "dir"),
      post: param(params, "post"),
    };
  }
  return {};
}

export async function AnalyticsView({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  // Tenant (cookies) first: the periods read the current date, which needs a request.
  const tenant = await getCurrentTenant();
  const supabase = await createServerSupabase();
  const now = new Date();
  const [accounts, syncedAt] = await Promise.all([
    loadAccounts(supabase, tenant.id),
    latestSync(supabase, tenant.id),
  ]);
  // First run of a brand: nothing connected yet (T47 "Set up <brand>").
  if (accounts.length === 0) return <BrandSetup brandName={tenant.name} />;

  const connected = [...new Set(accounts.map((a) => a.platform))];
  // Platform filters only where the analytics pages cover the platform today.
  const platforms = connected.filter(isAnalyticsLive);
  const notCovered = connected.filter((p) => !isAnalyticsLive(p));
  const section = parseSection(param(params, "section"));
  const period = parsePeriod(param(params, "period"));
  const platform = parsePlatform(param(params, "platform"), platforms);
  const current = { section, period, platform };
  const keep = sectionParams(section, params);
  const hrefFor = (change: Record<string, string | undefined>) =>
    analyticsHref(
      current,
      change.section && change.section !== section
        ? (change as Parameters<typeof analyticsHref>[1])
        : ({ ...keep, ...change } as Parameters<typeof analyticsHref>[1]),
    );
  const controlHref = (change: Record<string, string | number>) =>
    analyticsHref(current, { ...keep, post: undefined, ...change });

  let body: React.ReactNode;
  if (section !== "work" && !syncedAt) {
    body = <CollectingNumbers />;
  } else if (section === "overview") {
    const data = await loadOverview(supabase, tenant.id, { period, platform, platforms, now });
    body = (
      <OverviewSection
        data={data}
        period={period}
        measure={parseMeasure(param(params, "measure"))}
        hrefFor={hrefFor}
      />
    );
  } else if (section === "posts") {
    const w = windowFor(period, now);
    const state = {
      made: parseMade(param(params, "made")),
      type: parseType(param(params, "type")),
      sort: parseSort(param(params, "sort")),
      dir: parseDir(param(params, "dir")),
    };
    const postId = param(params, "post");
    const [posts, selected] = await Promise.all([
      loadPostMetrics(supabase, tenant.id, { from: w.from, to: w.to, platform }),
      postId ? loadPostDetail(supabase, tenant.id, postId) : Promise.resolve(null),
    ]);
    const comments = selected ? await loadPostComments(supabase, tenant.id, selected) : null;
    const csv = new URLSearchParams({ period: String(period), platform, ...state });
    body = (
      <PostsSection
        posts={posts}
        state={state}
        selected={selected}
        comments={comments}
        period={period}
        hrefFor={hrefFor}
        csvHref={`/analytics/posts.csv?${csv.toString()}`}
        now={now}
      />
    );
  } else if (section === "audience") {
    const data = await loadAudience(supabase, tenant.id, accounts);
    body = (
      <AudienceSection
        data={data}
        accounts={accounts}
        period={period}
        platform={platform}
        where={param(params, "where")}
        hrefFor={hrefFor}
      />
    );
  } else {
    const accountIds =
      platform === "all" ? null : accounts.filter((a) => a.platform === platform).map((a) => a.id);
    const work = await loadWork(supabase, tenant.id, { period, accountIds, now });
    body = <WorkSection work={work} period={period} />;
  }

  const asOf =
    section === "work" ? (
      <>Counted from your inbox, up to now</>
    ) : syncedAt ? (
      <>
        Numbers as of <LocalClock iso={syncedAt} /> · Instagram reach can take a day to settle
      </>
    ) : null;

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h1 className="page-title">Analytics</h1>
          <span className="meta">{accountsLine(accounts)}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <nav aria-label="Period" className="segmented">
            {ANALYTICS_PERIODS.map((p) => (
              <Link
                key={p}
                href={controlHref({ period: p })}
                scroll={false}
                data-active={p === period || undefined}
                aria-current={p === period ? "true" : undefined}
              >
                {p} days
              </Link>
            ))}
          </nav>
          {platforms.length > 1 && (
            <nav aria-label="Platform" className="segmented">
              {(["all", ...platforms] as const).map((p) => (
                <Link
                  key={p}
                  href={controlHref({ platform: p })}
                  scroll={false}
                  data-active={p === platform || undefined}
                  aria-current={p === platform ? "true" : undefined}
                >
                  {p === "all" ? "All" : platformName(p)}
                </Link>
              ))}
            </nav>
          )}
        </div>
      </header>
      <div className="flex flex-col gap-1.5">
        <nav aria-label="Analytics sections" className="tabs">
          {SECTIONS.map((s) => (
            <Link
              key={s.key}
              href={analyticsHref(current, { section: s.key })}
              data-active={s.key === section || undefined}
              aria-current={s.key === section ? "page" : undefined}
            >
              {s.label}
            </Link>
          ))}
        </nav>
        {asOf && <p className="meta">{asOf}</p>}
        {notCovered.length > 0 && section !== "work" && (
          <p className="meta">
            Numbers for {notCovered.map(platformName).join(", ")} come in an update. Their posts
            still count in All.
          </p>
        )}
      </div>
      <AccountProblems accounts={accounts} />
      {body}
    </>
  );
}
