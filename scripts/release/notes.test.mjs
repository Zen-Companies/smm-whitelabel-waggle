// node --test scripts/release/notes.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  AREAS,
  PREVIEW_MARKER,
  buildPreviewComment,
  buildReleaseBody,
  bumpReason,
  chooseBump,
  collectWarnings,
  deployState,
  formatDay,
  latestVersion,
  nextVersion,
  parseChecklist,
  parseReleaseNote,
  parseSummary,
  combineBump,
  pickSummary,
  prNumberFromSubject,
  prNumbersFromSubjects,
  releaseGuard,
  releasePrs,
} from "./notes.mjs";

const FULL = `## What this does
Tech stuff.

## Release note
<!-- One row per change. -->
| Type | Area | Change | What it means |
|------|------|--------|---------------|
| New | Inbox & Replies | Interview location | The office adds where. |
| improved | inbox & replies | Status page refreshes | Updates within 30 s. |

## Before this goes live
<!-- Anything production needs. -->
- [ ] Tick new-applicant emails in Team → Alerts
- [x] Set SENTRY_DSN on production

## Release summary
<!-- Only on staging → main. -->
`;

test("parses the release-note table, case-insensitively", () => {
  const r = parseReleaseNote(FULL);
  assert.equal(r.missing, false);
  assert.equal(r.none, false);
  assert.deepEqual(r.rows, [
    {
      type: "New",
      area: "Inbox & Replies",
      change: "Interview location",
      meaning: "The office adds where.",
    },
    {
      type: "Improved",
      area: "Inbox & Replies",
      change: "Status page refreshes",
      meaning: "Updates within 30 s.",
    },
  ]);
  assert.deepEqual(r.warnings, []);
});

test("reads loosely written rows (no outer pipes, extra spaces, escaped pipe)", () => {
  const body = `## Release note\nType | Area | Change | What it means\n---|---|---|---\n  Fixed |  Plans & Billing | Deposit total |  Shows A \\| B correctly  \n`;
  const r = parseReleaseNote(body);
  assert.deepEqual(r.rows, [
    {
      type: "Fixed",
      area: "Plans & Billing",
      change: "Deposit total",
      meaning: "Shows A | B correctly",
    },
  ]);
});

test('"none" means an internal-only PR', () => {
  const r = parseReleaseNote("## Release note\nnone\n");
  assert.equal(r.none, true);
  assert.equal(r.missing, false);
  assert.deepEqual(r.rows, []);
});

test("an absent or empty section is missing, not none", () => {
  assert.equal(parseReleaseNote("## What this does\nx").missing, true);
  assert.equal(parseReleaseNote(null).missing, true);
  const onlyTemplate =
    "## Release note\n<!-- hint -->\n| Type | Area | Change | What it means |\n|---|---|---|---|\n";
  assert.equal(parseReleaseNote(onlyTemplate).missing, true);
});

test("an unknown area goes to Other with a warning; an unknown type is skipped with a warning", () => {
  const body =
    "## Release note\n| Type | Area | Change | What it means |\n|---|---|---|---|\n| New | Spaceships | Warp | Fast |\n| Removed | Inbox & Replies | X | Y |\n";
  const r = parseReleaseNote(body);
  assert.deepEqual(r.rows, [{ type: "New", area: "Other", change: "Warp", meaning: "Fast" }]);
  assert.equal(r.warnings.length, 2);
  assert.match(r.warnings[0], /Spaceships/);
  assert.match(r.warnings[1], /Removed/);
});

test("the checklist keeps both ticked and unticked items, without the boxes", () => {
  assert.deepEqual(parseChecklist(FULL), [
    "Tick new-applicant emails in Team → Alerts",
    "Set SENTRY_DSN on production",
  ]);
  assert.deepEqual(parseChecklist("## What this does\nx"), []);
});

test("summary is the section text, or null when empty", () => {
  assert.equal(parseSummary(FULL), null);
  assert.equal(
    parseSummary("## Release summary\nThis release rebuilds careers.\n\nSecond line.\n"),
    "This release rebuilds careers.\n\nSecond line.",
  );
});

test("the area list is the agreed one, in order", () => {
  assert.deepEqual(AREAS, [
    "Sign-up & Setup",
    "Plans & Billing",
    "Inbox & Replies",
    "Teach Waggle & AI",
    "Posts & Publishing",
    "Contacts & Leads",
    "Accounts & Platforms",
    "Insights",
    "Teams & Organizations",
    "AI Assistants (MCP)",
    "CRM (GoHighLevel)",
    "Emails & Notifications",
    "Staff & Admin",
    "Security & Privacy",
    "Reliability & Behind the Scenes",
  ]);
});

test("bump: labels first, then the branch", () => {
  const b = (labels, headRef) => chooseBump({ labels, headRef });
  assert.equal(b(["release: skip", "release: major"], "staging"), "skip");
  assert.equal(b(["release: major"], "hotfix/x"), "major");
  assert.equal(b(["Release: Minor"], "hotfix/x"), "minor");
  assert.equal(b([], "staging"), "minor");
  assert.equal(b([], "hotfix/status-page"), "patch");
  assert.equal(b([], "content/9-11-article"), "patch");
  assert.equal(b([], "feat/whatever"), "patch");
  assert.equal(b([], null), "patch");
});

test("bump reason reads like a sentence", () => {
  assert.match(bumpReason({ labels: [], headRef: "staging" }, "minor"), /merged from `staging`/);
  assert.match(
    bumpReason({ labels: ["release: major"], headRef: "staging" }, "major"),
    /release: major/,
  );
  assert.match(bumpReason({ labels: [], headRef: "hotfix/x" }, "patch"), /`hotfix\/x`/);
});

test("latest version sorts numerically and ignores other tags", () => {
  assert.equal(
    latestVersion(["v1.9.0", "v1.10.0", "v1.2.3", "v2.0.0-rc.1", "baseline", "v0.9.9"]),
    "v1.10.0",
  );
  assert.equal(latestVersion([]), null);
});

test("next version resets the lower parts", () => {
  assert.equal(nextVersion("v1.4.2", "patch"), "v1.4.3");
  assert.equal(nextVersion("v1.4.2", "minor"), "v1.5.0");
  assert.equal(nextVersion("v1.4.2", "major"), "v2.0.0");
  assert.throws(() => nextVersion("1.4.2", "patch"));
  assert.throws(() => nextVersion("v1.4.2", "skip"));
});

test("PR numbers come from merge-commit subjects only", () => {
  assert.deepEqual(
    prNumbersFromSubjects([
      "Merge pull request #475 from Zen-Companies/feat/careers-upgrade",
      "Merge branch 'staging' of https://github.com/Zen-Companies/smm-whitelabel-waggle into feat/careers-upgrade",
      "feat(careers): something #12",
      "Merge pull request #467 from Zen-Companies/feat/sentry-environments",
      "Merge pull request #475 from Zen-Companies/feat/careers-upgrade",
    ]),
    [475, 467],
  );
});

test("release content: feature and hotfix PRs count; release and back-merge PRs do not", () => {
  const prs = [
    { number: 1, headRefName: "feat/a", baseRefName: "staging" },
    { number: 2, headRefName: "staging", baseRefName: "main" },
    { number: 3, headRefName: "main", baseRefName: "staging" },
    { number: 4, headRefName: "hotfix/status-page", baseRefName: "main" },
    { number: 5, headRefName: "staging", baseRefName: "feat/a" },
  ];
  assert.deepEqual(
    releasePrs(prs).map((p) => p.number),
    [1, 4],
  );
});

const run = (name, status, conclusion = null) => ({ name, status, conclusion });

test("deploys: waits while anything runs, fails on any failure, ignores its own jobs", () => {
  const s = (o) => deployState({ statuses: [], elapsedMs: 600000, ...o });
  assert.equal(s({ checkRuns: [run("supabase db push", "in_progress")] }), "pending");
  assert.equal(
    s({
      checkRuns: [run("supabase db push", "completed", "success")],
      statuses: [{ context: "Vercel", state: "pending" }],
    }),
    "pending",
  );
  assert.equal(
    s({ checkRuns: [run("supabase functions deploy", "completed", "failure")] }),
    "failure",
  );
  assert.equal(s({ checkRuns: [], statuses: [{ context: "Vercel", state: "error" }] }), "failure");
  assert.equal(
    s({
      checkRuns: [run("release", "in_progress"), run("Type-check & build", "completed", "skipped")],
      statuses: [{ context: "Vercel", state: "success" }],
    }),
    "success",
  );
});

test("deploys: nothing reported yet is pending during the grace period, success after it", () => {
  assert.equal(deployState({ checkRuns: [], statuses: [], elapsedMs: 30000 }), "pending");
  assert.equal(deployState({ checkRuns: [], statuses: [], elapsedMs: 130000 }), "success");
});

test("formats a day in Central time", () => {
  assert.equal(formatDay("2026-10-15T03:00:00Z"), "14 Oct 2026");
});

const PRS = [
  {
    number: 475,
    title: "Inbox & Replies upgrade",
    body: "## Release note\n| Type | Area | Change | What it means |\n|---|---|---|---|\n| New | Inbox & Replies | Calendar links | Add to calendar. |\n| Fixed | Inbox & Replies | Deadline day | Open until midnight. |\n\n## Before this goes live\n- [ ] Tick new-applicant emails\n",
  },
  {
    number: 467,
    title: "Sentry environments",
    body: "## Release note\n| Type | Area | Change | What it means |\n|---|---|---|---|\n| Improved | Reliability & Behind the Scenes | Errors kept apart | Test and live separated. |\n\n## Before this goes live\n- [ ] Set SENTRY_DSN\n",
  },
  { number: 466, title: "Feat/hiring badge", body: "" },
  { number: 470, title: "Internal refactor", body: "## Release note\nnone\n" },
];

test("release body follows the changelog layout", () => {
  const md = buildReleaseBody({
    version: "v1.1.0",
    previous: "v1.0.0",
    periodFrom: "2026-10-13T11:16:00Z",
    periodTo: "2026-10-15T15:00:00Z",
    releasedBy: "febron",
    summary: "Careers rebuilt.",
    prs: PRS,
    repo: "Zen-Companies/smm-whitelabel-waggle",
  });
  assert.match(
    md,
    /\*\*Waggle v1\.1\.0\*\* · Production · 13 Oct 2026 – 15 Oct 2026 · released by @febron/,
  );
  assert.match(md, /## Release summary\n\nCareers rebuilt\./);
  assert.match(md, /\| \*\*1\*\* \| \*\*1\*\* \| \*\*1\*\* \|/); // New / Improved / Fixed
  // areas in the agreed order: Inbox & Replies before Reliability
  assert.ok(md.indexOf("## Inbox & Replies") < md.indexOf("## Reliability & Behind the Scenes"));
  assert.match(md, /\| New \| Calendar links \| Add to calendar\. \(#475\) \|/);
  assert.match(md, /## Other changes\n\n- Feat\/hiring badge \(#466\)/);
  assert.doesNotMatch(md, /Internal refactor/);
  // sorted by PR number, like every other list on the page
  assert.match(
    md,
    /## Deploy notes\n\n- \[ \] Set SENTRY_DSN \(#467\)\n- \[ \] Tick new-applicant emails \(#475\)/,
  );
  assert.match(
    md,
    /https:\/\/github\.com\/Zen-Companies\/smm-whitelabel-waggle\/compare\/v1\.0\.0\.\.\.v1\.1\.0/,
  );
  assert.match(md, /#466 · #467 · #470 · #475/);
});

test("a release without a summary or deploy notes says so plainly", () => {
  const md = buildReleaseBody({
    version: "v1.1.1",
    previous: "v1.1.0",
    periodFrom: "2026-10-15T00:00:00Z",
    periodTo: "2026-10-15T20:00:00Z",
    releasedBy: "x",
    summary: null,
    prs: [PRS[1]],
    repo: "o/r",
  });
  assert.match(md, /_No summary was written for this release\._/);
  assert.doesNotMatch(md, /## Other changes/);
});

test("warnings name each PR without a note, and each unreadable row", () => {
  const w = collectWarnings([
    ...PRS,
    {
      number: 9,
      title: "x",
      body: "## Release note\n| Type | Area | Change | What it means |\n|---|---|---|---|\n| Removed | Inbox & Replies | A | B |\n",
    },
  ]);
  assert.deepEqual(w, [
    '#466 has no release note — it will be listed under "Other changes".',
    '#9: Type "Removed" isn\'t New, Improved or Fixed — row "A" skipped',
  ]);
});

test("preview comment carries the marker, version, reason and warnings", () => {
  const c = buildPreviewComment({
    version: "v1.1.0",
    bump: "minor",
    reason: "merged from `staging`",
    body: "BODY",
    warnings: ["#466 has no release note"],
  });
  assert.ok(c.startsWith(PREVIEW_MARKER));
  assert.match(c, /Release preview: \*\*v1\.1\.0\*\* \(minor — merged from `staging`\)/);
  assert.match(c, /#466 has no release note/);
  assert.match(c, /BODY/);
  const skip = buildPreviewComment({
    version: null,
    bump: "skip",
    reason: "labelled `release: skip`",
    body: "",
    warnings: [],
  });
  assert.match(skip, /deploy without a release/);
});

test("the untouched PR template reads as: no note, no checklist, no summary", () => {
  const tpl = readFileSync(
    new URL("../../.github/pull_request_template.md", import.meta.url),
    "utf8",
  );
  assert.equal(parseReleaseNote(tpl).missing, true);
  assert.deepEqual(parseReleaseNote(tpl).warnings, []);
  assert.deepEqual(parseChecklist(tpl), []);
  assert.equal(parseSummary(tpl), null);
});

// ── Final review fixes ────────────────────────────────────────────────────

test("C-1/I-6: refuses to release an old, already-released, or off-main commit", () => {
  const ok = {
    onMain: true,
    isAncestorOfPrev: false,
    isPrev: false,
    explicitBump: false,
    prCount: 2,
  };
  assert.equal(releaseGuard(ok), null);
  assert.match(releaseGuard({ ...ok, onMain: false }), /not on main/);
  assert.match(releaseGuard({ ...ok, isAncestorOfPrev: true }), /older than/);
  assert.match(releaseGuard({ ...ok, isPrev: true }), /already released/);
  assert.equal(releaseGuard({ ...ok, isPrev: true, explicitBump: true }), null);
  assert.match(releaseGuard({ ...ok, prCount: 0 }), /nothing new/);
  assert.equal(releaseGuard({ ...ok, prCount: 0, explicitBump: true }), null);
});

test("I-1: an unreleased staging merge keeps its minor when a hotfix releases it", () => {
  assert.equal(combineBump(["patch", "minor"]), "minor");
  assert.equal(combineBump(["patch", "major", "minor"]), "major");
  assert.equal(combineBump(["patch"]), "patch");
  assert.equal(combineBump(["skip", "patch"]), "patch");
  assert.equal(combineBump(["skip"]), "skip");
  assert.equal(combineBump([]), "patch");
});

test("I-1: the summary comes from the staging → main PR in the range, newest first", () => {
  const prs = [
    { number: 480, headRefName: "hotfix/x", body: "## Release summary\nHotfix." },
    { number: 478, headRefName: "staging", body: "## Release summary\nThe big one." },
  ];
  assert.equal(pickSummary(prs), "The big one.");
  assert.equal(pickSummary([prs[0]]), "Hotfix.");
  assert.equal(pickSummary([]), null);
});

test("I-1: the PR merged into main is read from the merge-commit subject", () => {
  assert.equal(prNumberFromSubject("Merge pull request #478 from Zen-Companies/staging"), 478);
  assert.equal(prNumberFromSubject("chore: direct push"), null);
});

test("I-3: a check cancelled by a newer merge reads as superseded, not failed", () => {
  const s = (o) => deployState({ statuses: [], elapsedMs: 600000, ...o });
  assert.equal(
    s({ checkRuns: [run("Type-check & build", "completed", "cancelled")] }),
    "superseded",
  );
  assert.equal(
    s({
      checkRuns: [
        run("Type-check & build", "completed", "cancelled"),
        run("supabase db push", "completed", "failure"),
      ],
    }),
    "failure",
  );
  assert.equal(
    s({
      checkRuns: [run("Type-check & build", "completed", "cancelled"), run("x", "in_progress")],
    }),
    "pending",
  );
});

test("I-4: near-miss type words are understood; a PR with no usable rows goes to Other changes", () => {
  const t = (type) =>
    parseReleaseNote(
      `## Release note\n| Type | Area | Change | What it means |\n|---|---|---|---|\n| ${type} | Inbox & Replies | A | B |\n`,
    ).rows[0]?.type;
  assert.equal(t("Fix"), "Fixed");
  assert.equal(t("bugfix"), "Fixed");
  assert.equal(t("Feature"), "New");
  assert.equal(t("Added"), "New");
  assert.equal(t("Improvement"), "Improved");
  assert.equal(t("changed"), "Improved");
  const md = buildReleaseBody({
    version: "v1.0.1",
    previous: "v1.0.0",
    periodFrom: "2026-10-15T00:00:00Z",
    periodTo: "2026-10-15T20:00:00Z",
    releasedBy: "x",
    summary: null,
    repo: "o/r",
    prs: [
      {
        number: 9,
        title: "Odd notes",
        body: "## Release note\n| Type | Area | Change | What it means |\n|---|---|---|---|\n| Whatever | Inbox & Replies | A | B |\n",
      },
    ],
  });
  assert.match(md, /## Other changes\n\n- Odd notes \(#9\)/);
});

test("I-5: the summary stops at a rule or the generated-with footer", () => {
  assert.equal(
    parseSummary("## Release summary\nCareers rebuilt.\n\n---\nfooter"),
    "Careers rebuilt.",
  );
  assert.equal(
    parseSummary(
      "## Release summary\nCareers rebuilt.\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)\n",
    ),
    "Careers rebuilt.",
  );
  assert.equal(
    parseSummary(
      "## Release summary\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)\n",
    ),
    null,
  );
});
