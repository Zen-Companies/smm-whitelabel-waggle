#!/usr/bin/env node
/**
 * Release automation CLI.
 *   node scripts/release/run.mjs preview <pr>
 *   node scripts/release/run.mjs release <sha> [--bump auto|patch|minor|major]
 *        [--dry-run] [--no-wait] [--previous-tag v1.0.0 --previous-ref f8e3f9bd]
 * See CLAUDE.md "Releases".
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as G from "./github.mjs";
import {
  PREVIEW_MARKER,
  bumpReason,
  buildPreviewComment,
  buildReleaseBody,
  chooseBump,
  collectWarnings,
  combineBump,
  deployState,
  latestVersion,
  nextVersion,
  parseSummary,
  pickSummary,
  prNumberFromSubject,
  prNumbersFromSubjects,
  releaseGuard,
  releasePrs,
} from "./notes.mjs";

const BASELINE_HELP =
  'No vX.Y.Z tag exists yet. Create the v1.0.0 baseline first (see CLAUDE.md "Releases").';
const POLL_MS = 30_000;
const TIMEOUT_MS = 45 * 60_000;

function flags(argv) {
  const f = { bump: "auto", dryRun: false, wait: true, previousTag: null, previousRef: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--bump") f.bump = argv[++i];
    else if (a === "--dry-run") f.dryRun = true;
    else if (a === "--no-wait") f.wait = false;
    else if (a === "--previous-tag") f.previousTag = argv[++i];
    else if (a === "--previous-ref") f.previousRef = argv[++i];
  }
  return f;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function previous(f) {
  if (f.previousTag) return { tag: f.previousTag, ref: f.previousRef ?? f.previousTag };
  const tag = latestVersion(G.versionTags());
  return tag ? { tag, ref: tag } : null;
}

function contentPrs(numbers) {
  return releasePrs(numbers.map((n) => G.pr(n)));
}

async function preview(number) {
  const p = G.pr(number);
  if (p.baseRefName !== "main")
    return console.log(`#${number} is not into main; nothing to preview.`);
  const prev = previous({});
  if (!prev)
    return G.upsertComment(number, PREVIEW_MARKER, `${PREVIEW_MARKER}\n${BASELINE_HELP}\n`);
  const bump = chooseBump({ labels: p.labels, headRef: p.headRefName });
  const reason = bumpReason({ labels: p.labels, headRef: p.headRefName }, bump);
  if (bump === "skip")
    return G.upsertComment(
      number,
      PREVIEW_MARKER,
      buildPreviewComment({ version: null, bump, reason, body: "", warnings: [] }),
    );

  const subjects = (p.commits ?? []).map((c) => c.messageHeadline);
  const prs = p.headRefName === "staging" ? contentPrs(prNumbersFromSubjects(subjects)) : [p];
  const version = nextVersion(prev.tag, bump);
  const body = buildReleaseBody({
    version,
    previous: prev.tag,
    periodFrom: G.commitDate(prev.ref),
    periodTo: new Date().toISOString(),
    releasedBy: "whoever merges",
    summary: parseSummary(p.body),
    prs,
    repo: G.repoSlug(),
  });
  G.upsertComment(
    number,
    PREVIEW_MARKER,
    buildPreviewComment({ version, bump, reason, body, warnings: collectWarnings(prs) }),
  );
  console.log(`Preview for #${number}: ${version} (${bump})`);
}

async function waitForDeploys(sha) {
  const start = Date.now();
  for (;;) {
    const state = deployState({
      checkRuns: G.checkRuns(sha),
      statuses: G.statuses(sha),
      elapsedMs: Date.now() - start,
    });
    console.log(`Deploys for ${sha.slice(0, 8)}: ${state}`);
    if (state !== "pending") return state;
    if (Date.now() - start > TIMEOUT_MS) return "timeout";
    await sleep(POLL_MS);
  }
}

/** The PR merged into main by this commit: from its merge subject, else the API. */
function mergedPr(sha) {
  const n = prNumberFromSubject(G.subject(sha));
  return n ? G.pr(n) : G.prForCommit(sha);
}

const bumpOf = (p) => chooseBump({ labels: p?.labels ?? [], headRef: p?.headRefName ?? null });

async function release(sha, f) {
  const explicit = Boolean(f.bump && f.bump !== "auto");
  const onMain = G.isAncestor(sha, "origin/main");
  // A dry run on a commit not yet on main (e.g. the staging tip) has no PR merged into main.
  const offMainDryRun = f.dryRun && !onMain;
  const merged = offMainDryRun ? null : mergedPr(sha);
  if (!explicit && bumpOf(merged) === "skip") {
    return console.log(
      `Not releasing ${sha.slice(0, 8)} (${bumpReason({ labels: merged?.labels ?? [], headRef: merged?.headRefName ?? null }, "skip")}).`,
    );
  }

  if (f.wait && !f.dryRun) {
    const state = await waitForDeploys(sha);
    if (state === "superseded") {
      // A newer merge cancelled this one's CI; its release will include these changes.
      if (merged)
        G.comment(
          merged.number,
          "Not released on its own: a newer merge into main superseded this one. Its changes will be in the next release — nothing to do.",
        );
      return console.log("Superseded by a newer merge; nothing released.");
    }
    if (state !== "success") {
      const why =
        state === "timeout" ? "the deploys had not finished after 45 minutes" : "a deploy failed";
      if (merged)
        G.comment(
          merged.number,
          `Not released: ${why}. Fix it; the next merge into main will release these changes too (or, if main has not moved, re-run the "Release" workflow from the Actions tab).`,
        );
      throw new Error(`Not released: ${why}.`);
    }
  }

  const prev = previous(f);
  if (!prev) throw new Error(BASELINE_HELP);

  const prs = contentPrs(prNumbersFromSubjects(G.mergeSubjects(prev.ref, sha)));
  const isPrev = G.revParse(sha) === G.revParse(prev.ref);
  const refusal = releaseGuard({
    onMain,
    isAncestorOfPrev: !isPrev && G.isAncestor(sha, prev.ref),
    isPrev,
    explicitBump: explicit,
    prCount: prs.length,
  });
  if (refusal && !f.dryRun) throw new Error(`Not released: ${refusal}`);

  // Every PR merged into main since the last release: an earlier one that was
  // superseded, failed or queued out still decides the bump and the summary.
  const mainPrs = offMainDryRun
    ? []
    : prNumbersFromSubjects(G.mainMergeSubjects(prev.ref, sha)).map((n) => G.pr(n));
  const bumps = mainPrs.length ? mainPrs.map(bumpOf) : [bumpOf(merged)];
  const bump = explicit ? f.bump : combineBump(bumps);
  if (bump === "skip")
    return console.log(
      `Not releasing ${sha.slice(0, 8)}: every merge since ${prev.tag} is labelled release: skip.`,
    );
  const reason = explicit
    ? `run by hand: ${f.bump}`
    : bump === bumpOf(merged)
      ? bumpReason({ labels: merged?.labels ?? [], headRef: merged?.headRefName ?? null }, bump)
      : `includes unreleased ${mainPrs.map((p) => `#${p.number}`).join(", ")}`;

  const version = nextVersion(prev.tag, bump);
  if (!f.dryRun && G.tagExists(version))
    throw new Error(`${version} already exists; refusing to overwrite it.`);

  const body = buildReleaseBody({
    version,
    previous: prev.tag,
    periodFrom: G.commitDate(prev.ref),
    periodTo: new Date().toISOString(),
    releasedBy: merged?.author ?? process.env.GITHUB_ACTOR ?? "unknown",
    summary: pickSummary(mainPrs) ?? (merged ? parseSummary(merged.body) : null),
    prs,
    repo: G.repoSlug(),
  });

  if (f.dryRun) {
    if (refusal) console.log(`(A real run would refuse: ${refusal})`);
    console.log(`DRY RUN — would release ${version} (${bump}, ${reason}) on ${sha}\n`);
    console.log(body);
    const w = collectWarnings(prs);
    if (w.length) console.log(`Warnings:\n- ${w.join("\n- ")}`);
    return;
  }

  const file = join(mkdtempSync(join(tmpdir(), "release-")), "notes.md");
  writeFileSync(file, body);
  const url = G.createRelease({ tag: version, sha, title: `Waggle ${version}`, notesFile: file });
  console.log(`Released ${version}: ${url}`);
  if (merged) G.comment(merged.number, `Released as **${version}**: ${url}`);
}

const [cmd, arg, ...rest] = process.argv.slice(2);
try {
  if (cmd === "preview" && arg) await preview(Number(arg));
  else if (cmd === "release" && arg) await release(arg, flags(rest));
  else {
    console.error(
      "Usage: run.mjs preview <pr> | release <sha> [--bump X] [--dry-run] [--no-wait] [--previous-tag T --previous-ref R]",
    );
    process.exit(2);
  }
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
