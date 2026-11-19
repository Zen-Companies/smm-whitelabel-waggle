/**
 * Release automation — pure logic. No I/O here: github.mjs does the talking,
 * run.mjs wires it. Tested by notes.test.mjs (node --test).
 * See CLAUDE.md "Releases".
 */

export const AREAS = [
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
];
export const OTHER_AREA = "Other";
export const TYPES = ["New", "Improved", "Fixed"];
/** Near-miss type words people actually write, so a row isn't dropped over "Fix". */
const TYPE_ALIASES = {
  new: "New",
  add: "New",
  added: "New",
  feature: "New",
  feat: "New",
  improved: "Improved",
  improve: "Improved",
  improvement: "Improved",
  changed: "Improved",
  change: "Improved",
  fixed: "Fixed",
  fix: "Fixed",
  fixes: "Fixed",
  bugfix: "Fixed",
  "bug fix": "Fixed",
};

const stripComments = (s) => (s ?? "").replace(/<!--[\s\S]*?-->/g, "");

/** Text of the "## <title>" section up to the next "## " heading, or null. */
function section(body, title) {
  const lines = stripComments(body).split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim().toLowerCase() === `## ${title.toLowerCase()}`);
  if (start < 0) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^##\s/.test(l.trim()));
  return (end < 0 ? rest : rest.slice(0, end)).join("\n");
}

/** Split a markdown table row into cells, honouring "\|" as a literal pipe. */
function cells(line) {
  const t = line
    .trim()
    .replace(/^\|/, "")
    .replace(/(?<!\\)\|$/, "");
  return t.split(/(?<!\\)\|/).map((c) => c.replace(/\\\|/g, "|").trim());
}

export function parseReleaseNote(body) {
  const text = section(body, "Release note");
  if (text === null) return { rows: [], none: false, missing: true, warnings: [] };
  if (/^\s*none\.?\s*$/i.test(text)) return { rows: [], none: true, missing: false, warnings: [] };

  const rows = [];
  const warnings = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.includes("|")) continue;
    const c = cells(line);
    if (c.length < 4) continue;
    if (c[0].toLowerCase() === "type") continue; // header
    if (c.every((x) => /^:?-{2,}:?$/.test(x) || x === "")) continue; // separator
    const [rawType, rawArea, change, meaning] = c;
    if (!change && !meaning) continue;
    const type = TYPE_ALIASES[rawType.toLowerCase()];
    if (!type) {
      warnings.push(`Type "${rawType}" isn't New, Improved or Fixed — row "${change}" skipped`);
      continue;
    }
    let area = AREAS.find((a) => a.toLowerCase() === rawArea.toLowerCase());
    if (!area) {
      warnings.push(`Area "${rawArea}" isn't on the list — row "${change}" filed under Other`);
      area = OTHER_AREA;
    }
    rows.push({ type, area, change, meaning });
  }
  return { rows, none: false, missing: rows.length === 0 && warnings.length === 0, warnings };
}

export function parseChecklist(body) {
  const text = section(body, "Before this goes live");
  if (text === null) return [];
  const items = [];
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*[-*]\s+(.*)$/.exec(line);
    if (!m) continue;
    // Drop the checkbox; an empty "- [ ]" (the template's blank line) is not an item.
    const item = m[1].replace(/^\[[ xX]\]\s*/, "").trim();
    if (item) items.push(item);
  }
  return items;
}

export function parseSummary(body) {
  const text = section(body, "Release summary");
  if (text === null) return null;
  // It's the form's last section, so stop at a rule or a generated-with footer
  // rather than publishing whatever was appended after it.
  const lines = text.split(/\r?\n/);
  const stop = lines.findIndex((l) => /^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(l) || /^\s*🤖/u.test(l));
  const t = (stop < 0 ? lines : lines.slice(0, stop)).join("\n").trim();
  return t === "" ? null : t;
}

const lower = (labels) => (labels ?? []).map((l) => l.toLowerCase().trim());

export function chooseBump({ labels, headRef }) {
  const l = lower(labels);
  if (l.includes("release: skip")) return "skip";
  if (l.includes("release: major")) return "major";
  if (l.includes("release: minor")) return "minor";
  if (headRef === "staging") return "minor";
  return "patch";
}

export function bumpReason({ labels, headRef }, bump) {
  const l = lower(labels);
  if (bump === "skip") return "labelled `release: skip`";
  if (l.includes(`release: ${bump}`)) return `labelled \`release: ${bump}\``;
  if (headRef === "staging" && bump === "minor") return "merged from `staging`";
  if (headRef) return `merged from \`${headRef}\``;
  return "run by hand";
}

const SEMVER = /^v(\d+)\.(\d+)\.(\d+)$/;

export function latestVersion(tags) {
  let best = null;
  for (const t of tags ?? []) {
    const m = SEMVER.exec(t);
    if (!m) continue;
    const v = m.slice(1).map(Number);
    if (
      !best ||
      v[0] > best.v[0] ||
      (v[0] === best.v[0] && (v[1] > best.v[1] || (v[1] === best.v[1] && v[2] > best.v[2])))
    ) {
      best = { t, v };
    }
  }
  return best ? best.t : null;
}

export function nextVersion(current, bump) {
  const m = SEMVER.exec(current ?? "");
  if (!m) throw new Error(`Not a version tag: ${current}`);
  const [maj, min, pat] = m.slice(1).map(Number);
  if (bump === "major") return `v${maj + 1}.0.0`;
  if (bump === "minor") return `v${maj}.${min + 1}.0`;
  if (bump === "patch") return `v${maj}.${min}.${pat + 1}`;
  throw new Error(`No version for bump "${bump}"`);
}

export function prNumbersFromSubjects(subjects) {
  const seen = [];
  for (const s of subjects ?? []) {
    const m = /^Merge pull request #(\d+) from /.exec(s);
    if (m && !seen.includes(Number(m[1]))) seen.push(Number(m[1]));
  }
  return seen;
}

/** PRs whose changes the release describes. The staging → main PR only
 *  supplies the summary; back-merges (main → staging, staging → feature)
 *  carry nothing new. */
export function releasePrs(prs) {
  return (prs ?? []).filter((p) => p.headRefName !== "staging" && p.headRefName !== "main");
}

const FAILED = ["failure", "timed_out", "action_required", "startup_failure", "stale"];

/** Whether everything deploying this commit has finished, and how. */
export function deployState({
  checkRuns,
  statuses,
  elapsedMs,
  graceMs = 120000,
  ignore = ["release", "release-preview", "Vercel Preview Comments"],
}) {
  const runs = (checkRuns ?? []).filter((r) => !ignore.includes(r.name));
  const sts = statuses ?? [];
  if (runs.some((r) => r.status === "completed" && FAILED.includes(r.conclusion))) return "failure";
  if (sts.some((s) => s.state === "failure" || s.state === "error")) return "failure";
  if (runs.some((r) => r.status !== "completed")) return "pending";
  if (sts.some((s) => s.state === "pending")) return "pending";
  // A run cancelled by a newer merge (Frontend CI cancels in progress) is not a
  // broken deploy: the next merge's release will carry this commit's changes.
  if (runs.some((r) => r.status === "completed" && r.conclusion === "cancelled"))
    return "superseded";
  if (elapsedMs < graceMs) return "pending";
  return "success";
}

export function formatDay(iso) {
  return new Date(iso).toLocaleDateString("en-GB", {
    timeZone: "America/Chicago",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const cell = (s) => String(s).replace(/\|/g, "\\|").replace(/\r?\n/g, " ");

export function buildReleaseBody({
  version,
  previous,
  periodFrom,
  periodTo,
  releasedBy,
  summary,
  prs,
  repo,
}) {
  const sorted = [...(prs ?? [])].sort((a, b) => a.number - b.number);
  const rows = [];
  const other = [];
  const deploy = [];
  for (const pr of sorted) {
    const note = parseReleaseNote(pr.body);
    for (const r of note.rows) rows.push({ ...r, pr: pr.number });
    // No usable rows (absent, empty, or every row unreadable) — still list it.
    if (!note.none && note.rows.length === 0) other.push(pr);
    for (const item of parseChecklist(pr.body)) deploy.push({ item, pr: pr.number });
  }

  const count = (t) => rows.filter((r) => r.type === t).length;
  const areas = [...AREAS, OTHER_AREA].filter((a) => rows.some((r) => r.area === a));
  const out = [];

  out.push(
    `**Waggle ${version}** · Production · ${formatDay(periodFrom)} – ${formatDay(periodTo)} · released by @${releasedBy}`,
  );
  out.push("", "## Release summary", "", summary ?? "_No summary was written for this release._");
  out.push(
    "",
    "## At a glance",
    "",
    "| New | Improved | Fixed |",
    "|:---:|:---:|:---:|",
    `| **${count("New")}** | **${count("Improved")}** | **${count("Fixed")}** |`,
  );
  if (areas.length) {
    out.push("", "## What changed, by area", "", "| Area | Changes |", "|---|---:|");
    for (const a of areas) out.push(`| ${a} | ${rows.filter((r) => r.area === a).length} |`);
    for (const a of areas) {
      out.push("", `## ${a}`, "", "| Type | Change | What it means |", "|---|---|---|");
      for (const t of TYPES) {
        for (const r of rows.filter((x) => x.area === a && x.type === t)) {
          out.push(`| ${t} | ${cell(r.change)} | ${cell(r.meaning)} (#${r.pr}) |`);
        }
      }
    }
  } else {
    out.push("", "_No user-facing changes were described in this release._");
  }
  if (other.length) {
    out.push("", "## Other changes", "");
    for (const pr of other) out.push(`- ${pr.title} (#${pr.number})`);
  }
  if (deploy.length) {
    out.push("", "## Deploy notes", "");
    for (const d of deploy) out.push(`- [ ] ${d.item} (#${d.pr})`);
  }
  out.push(
    "",
    "## Full changelog",
    "",
    sorted.map((p) => `#${p.number}`).join(" · ") || "_No pull requests._",
  );
  if (previous) out.push("", `https://github.com/${repo}/compare/${previous}...${version}`);
  return out.join("\n") + "\n";
}

export function collectWarnings(prs) {
  const warnings = [];
  for (const pr of prs ?? []) {
    const note = parseReleaseNote(pr.body);
    if (note.missing)
      warnings.push(`#${pr.number} has no release note — it will be listed under "Other changes".`);
    for (const w of note.warnings) warnings.push(`#${pr.number}: ${w}`);
  }
  return warnings;
}

export const PREVIEW_MARKER = "<!-- release-preview -->";

export function buildPreviewComment({ version, bump, reason, body, warnings }) {
  const out = [PREVIEW_MARKER];
  if (bump === "skip") {
    out.push(`### Release preview: this merge will deploy without a release (${reason})`);
    return out.join("\n") + "\n";
  }
  out.push(`### Release preview: **${version}** (${bump} — ${reason})`);
  out.push(
    "",
    '> Updates when this PR changes. Add `release: major` for a major release, or `release: skip` to deploy without one. Edited another PR\'s notes? Re-run "Release preview" from the Actions tab.',
  );
  if (warnings?.length) {
    out.push("", "**Warnings**", "");
    for (const w of warnings) out.push(`- ${w}`);
  }
  out.push(
    "",
    "<details open><summary>Release notes that will be published</summary>",
    "",
    body,
    "</details>",
  );
  return out.join("\n") + "\n";
}

/** The PR a merge commit on main came from, read from its subject. */
export function prNumberFromSubject(subject) {
  const m = /^Merge pull request #(\d+) from /.exec(subject ?? "");
  return m ? Number(m[1]) : null;
}

const RANK = { patch: 1, minor: 2, major: 3 };

/** The release's bump when several merges into main land in one release (an
 *  earlier one superseded, failed or skipped): the highest one wins, so a
 *  staging batch released by a later hotfix stays a minor. */
export function combineBump(bumps) {
  const real = (bumps ?? []).filter((b) => b !== "skip");
  if (!real.length) return bumps?.length ? "skip" : "patch";
  return real.reduce((a, b) => (RANK[b] > RANK[a] ? b : a));
}

/** Summary from the newest staging → main PR in the release, else the newest PR. */
export function pickSummary(mainPrs) {
  const list = mainPrs ?? [];
  const pr = list.find((p) => p.headRefName === "staging") ?? list[0];
  return pr ? parseSummary(pr.body) : null;
}

/** Why this commit must not be released, or null when it may be. */
export function releaseGuard({ onMain, isAncestorOfPrev, isPrev, explicitBump, prCount }) {
  if (!onMain) return "This commit is not on main; only main is released.";
  if (isAncestorOfPrev)
    return "This commit is older than the latest release, which already includes it.";
  if (isPrev && !explicitBump)
    return "This commit is already released; run with an explicit bump to tag it again.";
  if (prCount === 0 && !explicitBump) return "There is nothing new since the latest release.";
  return null;
}
