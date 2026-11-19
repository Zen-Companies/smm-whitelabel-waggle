/**
 * Release automation — I/O over git and the gh CLI (preinstalled on GitHub
 * runners; locally, `gh auth login`). Kept thin and untested by design: all
 * decisions live in notes.mjs. GH_TOKEN comes from the workflow.
 */
import { execFileSync } from "node:child_process";

const sh = (cmd, args, input) =>
  execFileSync(cmd, args, {
    encoding: "utf8",
    input,
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["pipe", "pipe", "inherit"],
  }).trim();
const gh = (args, input) => sh("gh", args, input);
const git = (args) => sh("git", args);
const ghJson = (args) => JSON.parse(gh(args) || "null");

export const repoSlug = () =>
  process.env.GITHUB_REPOSITORY ||
  ghJson(["repo", "view", "--json", "nameWithOwner"]).nameWithOwner;

export const versionTags = () => git(["tag", "--list", "v*"]).split("\n").filter(Boolean);
export const tagExists = (tag) => versionTags().includes(tag);
export const commitDate = (ref) => git(["log", "-1", "--format=%cI", ref]);
export const mergeSubjects = (from, to) =>
  git(["log", "--merges", "--format=%s", `${from}..${to}`])
    .split("\n")
    .filter(Boolean);
/** Merges made ON main (its first-parent line), newest first — the PRs merged into main. */
export const mainMergeSubjects = (from, to) =>
  git(["log", "--first-parent", "--merges", "--format=%s", `${from}..${to}`])
    .split("\n")
    .filter(Boolean);
export const subject = (ref) => git(["log", "-1", "--format=%s", ref]);
export const revParse = (ref) => git(["rev-parse", `${ref}^{commit}`]);
export function isAncestor(a, b) {
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", a, b], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const PR_FIELDS = "number,title,body,labels,baseRefName,headRefName,author,mergedAt,url,commits";

export function pr(number) {
  const p = ghJson(["pr", "view", String(number), "--json", PR_FIELDS]);
  return {
    ...p,
    labels: (p.labels ?? []).map((l) => l.name),
    author: p.author?.login ?? "unknown",
  };
}

/** The merged PR whose merge commit is `sha`, or null (manual run, direct push). */
export function prForCommit(sha) {
  const list = ghJson(["api", `repos/${repoSlug()}/commits/${sha}/pulls`]) ?? [];
  const hit =
    list.find((p) => p.merged_at && p.base?.ref === "main" && p.merge_commit_sha === sha) ??
    list.find((p) => p.merged_at && p.base?.ref === "main");
  return hit ? pr(hit.number) : null;
}

export const checkRuns = (sha) =>
  (
    ghJson(["api", `repos/${repoSlug()}/commits/${sha}/check-runs?per_page=100`])?.check_runs ?? []
  ).map((r) => ({
    name: r.name,
    status: r.status,
    conclusion: r.conclusion,
  }));

export const statuses = (sha) =>
  (ghJson(["api", `repos/${repoSlug()}/commits/${sha}/status`])?.statuses ?? []).map((s) => ({
    context: s.context,
    state: s.state,
  }));

export function comment(number, body) {
  gh(["pr", "comment", String(number), "--body-file", "-"], body);
}

/** Create or update the single preview comment (found by its marker). */
export function upsertComment(number, marker, body) {
  const repo = repoSlug();
  const list = ghJson(["api", `repos/${repo}/issues/${number}/comments?per_page=100`]) ?? [];
  const mine = list.find((c) => (c.body ?? "").startsWith(marker));
  if (mine)
    gh(["api", "-X", "PATCH", `repos/${repo}/issues/comments/${mine.id}`, "-F", "body=@-"], body);
  else comment(number, body);
}

/** Tag + release in one call, so a failure can never leave a tag without its release. */
export function createRelease({ tag, sha, title, notesFile }) {
  gh([
    "release",
    "create",
    tag,
    "--target",
    sha,
    "--title",
    title,
    "--notes-file",
    notesFile,
    "--latest",
  ]);
  return ghJson(["release", "view", tag, "--json", "url"]).url;
}
