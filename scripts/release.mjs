#!/usr/bin/env node
/**
 * release.mjs — atomic version bump + CHANGELOG entry + git tag for genoly-mobile.
 *
 * Usage (from repo root):
 *   node scripts/release.mjs <patch|minor|major|prerelease> [--dry-run]
 *
 * Or via npm scripts:
 *   npm run release:patch
 *   npm run release:minor
 *   npm run release:major
 *   npm run release:prerelease
 *
 * What it does:
 *   1. Pre-flight: clean tree, on main, up-to-date with origin, last tag is valid
 *      SemVer, all four version-bearing files agree (drift detection).
 *   2. Compute new SemVer from current root package.json version + bump kind.
 *   3. Atomically update the four version-bearing files:
 *        - package.json (root) :: "version"
 *        - apps/mobile/package.json :: "version"
 *        - apps/mobile/app.json :: expo.version
 *        - apps/mobile/constants/version.ts :: VERSION constant
 *      ios.buildNumber + android.versionCode are intentionally NOT touched —
 *      those drift per store submission, separate from the marketing version.
 *   4. Generate a CHANGELOG section from conventional commits since last tag,
 *      prepend it under the title block.
 *   5. Commit with message exactly `chore: release v<new>` (no Claude attribution).
 *   6. Annotated tag `v<new>` with message `Genoly mobile v<new>`.
 *   7. Print push command. Does NOT auto-push.
 *
 * --dry-run prints planned actions without writing files or invoking git
 * mutations.
 *
 * Zero external deps — Node built-ins only.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

// ---------------------------------------------------------------------------
// Constants — paths relative to repo root (one level up from scripts/).
// ---------------------------------------------------------------------------

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..");

export const FILE_PATHS = {
  rootPackage: join(REPO_ROOT, "package.json"),
  mobilePackage: join(REPO_ROOT, "apps", "mobile", "package.json"),
  appJson: join(REPO_ROOT, "apps", "mobile", "app.json"),
  versionTs: join(REPO_ROOT, "apps", "mobile", "constants", "version.ts"),
  changelog: join(REPO_ROOT, "docs", "CHANGELOG.md"),
};

export const BUMP_KINDS = ["patch", "minor", "major", "prerelease"];

// ---------------------------------------------------------------------------
// Pure helpers — exported for unit testing.
// ---------------------------------------------------------------------------

const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;

/**
 * Parse a SemVer-ish string `X.Y.Z` or `X.Y.Z-pre.N`. Returns null when
 * the input doesn't match. Pre-release is captured but only the
 * `pre.<N>` form is treated as bumpable; freeform prerelease tags are
 * preserved but cannot be `prerelease`-incremented (caller must error).
 */
export function parseSemver(version) {
  if (typeof version !== "string") return null;
  const m = SEMVER_RE.exec(version.trim());
  if (!m) return null;
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    prerelease: m[4] ?? null,
  };
}

/**
 * Compute the new SemVer string for the given bump kind.
 * `prerelease` bumps in the `-pre.N` form. If the input has no prerelease,
 * a `prerelease` bump produces `<current>-pre.0` (without incrementing
 * patch — the operator picked prerelease deliberately).
 */
export function bumpSemver(version, kind) {
  const parsed = parseSemver(version);
  if (!parsed) {
    throw new Error(`Not a valid SemVer X.Y.Z(-pre.N) string: ${version}`);
  }
  if (!BUMP_KINDS.includes(kind)) {
    throw new Error(
      `Unknown bump kind: ${kind}. Expected one of ${BUMP_KINDS.join(", ")}`,
    );
  }

  if (kind === "major") {
    return `${parsed.major + 1}.0.0`;
  }
  if (kind === "minor") {
    return `${parsed.major}.${parsed.minor + 1}.0`;
  }
  if (kind === "patch") {
    return `${parsed.major}.${parsed.minor}.${parsed.patch + 1}`;
  }
  // prerelease
  if (parsed.prerelease == null) {
    return `${parsed.major}.${parsed.minor}.${parsed.patch}-pre.0`;
  }
  const preMatch = /^pre\.(\d+)$/.exec(parsed.prerelease);
  if (!preMatch) {
    throw new Error(
      `Cannot prerelease-bump non-pre.N prerelease: ${parsed.prerelease}. Hand-edit the version or use a different bump kind.`,
    );
  }
  const next = Number(preMatch[1]) + 1;
  return `${parsed.major}.${parsed.minor}.${parsed.patch}-pre.${next}`;
}

/**
 * Return true when the input matches an annotated git tag we'd produce,
 * i.e. `v` + valid SemVer.
 */
export function isValidTag(tag) {
  if (typeof tag !== "string") return false;
  if (!tag.startsWith("v")) return false;
  return parseSemver(tag.slice(1)) !== null;
}

// ---------------------------------------------------------------------------
// File transforms — pure: take current contents string + new version,
// return new contents string. No I/O.
// ---------------------------------------------------------------------------

/**
 * Update a package.json string's top-level "version" field.
 * Preserves all other keys + formatting via JSON parse/stringify with the
 * existing indentation guessed from the source.
 */
export function transformPackageJson(contents, newVersion) {
  const indent = detectIndent(contents);
  const parsed = JSON.parse(contents);
  parsed.version = newVersion;
  return JSON.stringify(parsed, null, indent) + "\n";
}

/**
 * Update apps/mobile/app.json's expo.version. CRITICAL: preserves every
 * other key, especially ios.buildNumber and android.versionCode which
 * drift independently per store submission.
 */
export function transformAppJson(contents, newVersion) {
  const indent = detectIndent(contents);
  const parsed = JSON.parse(contents);
  if (!parsed.expo) {
    throw new Error("app.json is missing the 'expo' object");
  }
  parsed.expo.version = newVersion;
  return JSON.stringify(parsed, null, indent) + "\n";
}

/**
 * Update apps/mobile/constants/version.ts's VERSION constant.
 * Preserves BUILD_NUMBER and any other constants in the file.
 */
export function transformVersionTs(contents, newVersion) {
  if (!/export const VERSION\s*=\s*"[^"]*"/.test(contents)) {
    throw new Error(
      "version.ts does not contain a matchable `export const VERSION = \"...\"` line",
    );
  }
  return contents.replace(
    /export const VERSION\s*=\s*"[^"]*"/,
    `export const VERSION = "${newVersion}"`,
  );
}

function detectIndent(jsonish) {
  const m = /\n([ \t]+)\S/.exec(jsonish);
  if (!m) return 2;
  const ws = m[1];
  if (ws.includes("\t")) return "\t";
  return ws.length;
}

// ---------------------------------------------------------------------------
// CHANGELOG generation — pure.
// ---------------------------------------------------------------------------

const CONVENTIONAL_PREFIXES = [
  ["feat", "Added"],
  ["fix", "Fixed"],
  ["perf", "Performance"],
  ["refactor", "Refactor"],
  ["docs", "Documentation"],
  ["test", "Tests"],
  ["build", "Build"],
  ["ci", "CI"],
  ["style", "Style"],
  ["revert", "Reverted"],
  ["chore", "Chore"],
];

/**
 * Group commits (`{subject: string}` objects) by their conventional-prefix
 * heading. Skips merge commits and `chore: release ...` rollups.
 * Commits without a recognised prefix go under "Other".
 *
 * Returns a Map keyed by heading, preserving CONVENTIONAL_PREFIXES order
 * followed by "Other".
 */
export function groupCommits(commits) {
  const buckets = new Map();
  for (const [, heading] of CONVENTIONAL_PREFIXES) buckets.set(heading, []);
  buckets.set("Other", []);

  for (const commit of commits) {
    const subject = (commit.subject ?? "").trim();
    if (!subject) continue;
    if (/^Merge /i.test(subject)) continue;
    if (/^chore:\s*release\s+v/i.test(subject)) continue;

    const prefixMatch = /^([a-z]+)(\([^)]*\))?!?:\s*(.+)$/.exec(subject);
    let heading = "Other";
    let body = subject;
    if (prefixMatch) {
      const prefix = prefixMatch[1].toLowerCase();
      const known = CONVENTIONAL_PREFIXES.find(([p]) => p === prefix);
      if (known) {
        heading = known[1];
        body = prefixMatch[3];
      }
    }
    buckets.get(heading).push(body);
  }

  // Drop empty buckets.
  for (const [key, list] of buckets) {
    if (list.length === 0) buckets.delete(key);
  }
  return buckets;
}

/**
 * Render a CHANGELOG section in the same format as the existing v1.0.0 entry.
 * Returns a string ending with `\n` and a trailing `\n---\n\n` separator.
 */
export function renderChangelogSection({ version, date, commits }) {
  const grouped = groupCommits(commits);
  const lines = [];
  lines.push(`## [${version}] — ${date}`);
  lines.push("");
  if (grouped.size === 0) {
    lines.push("### Maintenance");
    lines.push("");
    lines.push("- No notable changes since the previous release.");
    lines.push("");
  } else {
    for (const [heading, items] of grouped) {
      lines.push(`### ${heading}`);
      lines.push("");
      for (const item of items) {
        lines.push(`- ${item}`);
      }
      lines.push("");
    }
  }
  lines.push("---");
  lines.push("");
  return lines.join("\n");
}

/**
 * Insert a freshly rendered changelog section at the top of an existing
 * CHANGELOG, just before the first `## [` heading (preserving the title
 * block).
 */
export function insertChangelogSection(existing, section) {
  const idx = existing.indexOf("\n## [");
  if (idx < 0) {
    // No existing release sections; append below whatever header exists.
    const trimmedExisting = existing.endsWith("\n") ? existing : existing + "\n";
    return trimmedExisting + section;
  }
  const before = existing.slice(0, idx + 1); // include the newline before the heading
  const after = existing.slice(idx + 1);
  return before + section + after;
}

// ---------------------------------------------------------------------------
// Drift detection — pure.
// ---------------------------------------------------------------------------

/**
 * Given a map of {filePath: versionString}, return { ok: true } when all
 * versions match, otherwise { ok: false, version, diverging: [{path, version}] }.
 */
export function detectDrift(versions) {
  const entries = Object.entries(versions);
  if (entries.length === 0) return { ok: true, version: null };
  const [, firstVersion] = entries[0];
  const diverging = entries.filter(([, v]) => v !== firstVersion);
  if (diverging.length === 0) return { ok: true, version: firstVersion };
  return {
    ok: false,
    version: firstVersion,
    diverging: entries.map(([path, version]) => ({ path, version })),
  };
}

// ---------------------------------------------------------------------------
// File reads — small wrappers used by the CLI portion.
// ---------------------------------------------------------------------------

export function readVersions() {
  const rootPkg = JSON.parse(readFileSync(FILE_PATHS.rootPackage, "utf8"));
  const mobilePkg = JSON.parse(readFileSync(FILE_PATHS.mobilePackage, "utf8"));
  const appJson = JSON.parse(readFileSync(FILE_PATHS.appJson, "utf8"));
  const versionTs = readFileSync(FILE_PATHS.versionTs, "utf8");
  const versionTsMatch = /export const VERSION\s*=\s*"([^"]+)"/.exec(versionTs);

  return {
    [FILE_PATHS.rootPackage]: rootPkg.version,
    [FILE_PATHS.mobilePackage]: mobilePkg.version,
    [FILE_PATHS.appJson]: appJson.expo?.version,
    [FILE_PATHS.versionTs]: versionTsMatch ? versionTsMatch[1] : null,
  };
}

// ---------------------------------------------------------------------------
// CLI portion — only runs when executed directly.
// ---------------------------------------------------------------------------

function git(args, { capture = true } = {}) {
  return execFileSync("git", args, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });
}

function todayIso() {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function parseArgs(argv) {
  const positional = [];
  let dryRun = false;
  for (const a of argv) {
    if (a === "--dry-run") dryRun = true;
    else if (a.startsWith("--")) {
      throw new Error(`Unknown flag: ${a}`);
    } else {
      positional.push(a);
    }
  }
  if (positional.length !== 1) {
    throw new Error(
      `Usage: node scripts/release.mjs <${BUMP_KINDS.join("|")}> [--dry-run]`,
    );
  }
  const kind = positional[0];
  if (!BUMP_KINDS.includes(kind)) {
    throw new Error(
      `Unknown bump kind: ${kind}. Expected one of ${BUMP_KINDS.join(", ")}`,
    );
  }
  return { kind, dryRun };
}

function preflight() {
  // Working tree clean.
  const status = git(["status", "--porcelain"]).trim();
  if (status.length > 0) {
    throw new Error(
      `Working tree not clean. Commit or stash before releasing:\n${status}`,
    );
  }

  // On main.
  const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]).trim();
  if (branch !== "main") {
    throw new Error(`Must be on main branch. Currently on: ${branch}`);
  }

  // Up-to-date with origin/main.
  git(["fetch", "origin", "main"], { capture: false });
  const local = git(["rev-parse", "main"]).trim();
  const remote = git(["rev-parse", "origin/main"]).trim();
  if (local !== remote) {
    throw new Error(
      `Local main is not in sync with origin/main.\n  local:  ${local}\n  remote: ${remote}\nRun: git pull --rebase origin main`,
    );
  }

  // Last tag is a valid SemVer vX.Y.Z.
  let lastTag = "";
  try {
    lastTag = git(["describe", "--tags", "--abbrev=0"]).trim();
  } catch {
    throw new Error(
      "No previous tag found. Create an initial tag (e.g. `git tag -a v1.0.0 -m 'initial'`) before running this script.",
    );
  }
  if (!isValidTag(lastTag)) {
    throw new Error(
      `Last tag is not a valid SemVer tag (vX.Y.Z): ${lastTag}`,
    );
  }

  // Drift detection across the four files.
  const versions = readVersions();
  const drift = detectDrift(versions);
  if (!drift.ok) {
    const lines = drift.diverging
      .map(({ path, version }) => `  ${path} :: ${version ?? "<missing>"}`)
      .join("\n");
    throw new Error(
      `Version drift detected across the four mobile version-bearing files. Hand-fix before retrying:\n${lines}`,
    );
  }
  return { lastTag, currentVersion: drift.version };
}

function readCommitsSince(tag) {
  // %H<TAB>%P<TAB>%s — full hash, parent hashes, subject. Parents lets us
  // skip merge commits.
  const raw = git([
    "log",
    `${tag}..HEAD`,
    "--pretty=format:%H%x09%P%x09%s",
  ]);
  if (!raw.trim()) return [];
  return raw
    .split("\n")
    .map((line) => {
      const [hash, parents, ...subjectParts] = line.split("\t");
      const subject = subjectParts.join("\t");
      const parentCount = parents ? parents.split(" ").filter(Boolean).length : 0;
      return { hash, subject, isMerge: parentCount > 1 };
    })
    .filter((c) => !c.isMerge);
}

function applyFileUpdates(newVersion, dryRun) {
  const rootPkgSrc = readFileSync(FILE_PATHS.rootPackage, "utf8");
  const mobilePkgSrc = readFileSync(FILE_PATHS.mobilePackage, "utf8");
  const appJsonSrc = readFileSync(FILE_PATHS.appJson, "utf8");
  const versionTsSrc = readFileSync(FILE_PATHS.versionTs, "utf8");

  const updates = [
    [FILE_PATHS.rootPackage, transformPackageJson(rootPkgSrc, newVersion)],
    [FILE_PATHS.mobilePackage, transformPackageJson(mobilePkgSrc, newVersion)],
    [FILE_PATHS.appJson, transformAppJson(appJsonSrc, newVersion)],
    [FILE_PATHS.versionTs, transformVersionTs(versionTsSrc, newVersion)],
  ];

  for (const [path, contents] of updates) {
    if (dryRun) {
      console.log(`  [dry-run] would write: ${path}`);
    } else {
      writeFileSync(path, contents);
      console.log(`  wrote: ${path}`);
    }
  }
}

function applyChangelogUpdate(newVersion, commits, dryRun) {
  const existing = readFileSync(FILE_PATHS.changelog, "utf8");
  const section = renderChangelogSection({
    version: newVersion,
    date: todayIso(),
    commits,
  });
  const next = insertChangelogSection(existing, section);
  if (dryRun) {
    console.log(`  [dry-run] would write: ${FILE_PATHS.changelog}`);
    console.log("  [dry-run] new section:");
    for (const line of section.split("\n")) console.log(`    ${line}`);
  } else {
    writeFileSync(FILE_PATHS.changelog, next);
    console.log(`  wrote: ${FILE_PATHS.changelog}`);
  }
}

function gitCommitAndTag(newVersion, dryRun) {
  const filesToStage = [
    FILE_PATHS.rootPackage,
    FILE_PATHS.mobilePackage,
    FILE_PATHS.appJson,
    FILE_PATHS.versionTs,
    FILE_PATHS.changelog,
  ];
  const commitMsg = `chore: release v${newVersion}`;
  const tagName = `v${newVersion}`;
  const tagMsg = `Genoly mobile v${newVersion}`;

  if (dryRun) {
    console.log(`  [dry-run] would run: git add ${filesToStage.length} files`);
    console.log(`  [dry-run] would run: git commit -m "${commitMsg}"`);
    console.log(`  [dry-run] would run: git tag -a ${tagName} -m "${tagMsg}"`);
    return { tagName };
  }

  git(["add", ...filesToStage]);
  git(["commit", "-m", commitMsg]);
  git(["tag", "-a", tagName, "-m", tagMsg]);
  return { tagName };
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(e.message);
    process.exit(2);
  }
  const { kind, dryRun } = args;

  console.log(`release.mjs — bump=${kind}${dryRun ? " (dry-run)" : ""}`);

  let preflightResult;
  try {
    preflightResult = preflight();
  } catch (e) {
    console.error(`Pre-flight failed: ${e.message}`);
    process.exit(1);
  }
  const { lastTag, currentVersion } = preflightResult;
  console.log(`  last tag:        ${lastTag}`);
  console.log(`  current version: ${currentVersion}`);

  let newVersion;
  try {
    newVersion = bumpSemver(currentVersion, kind);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
  console.log(`  new version:     ${newVersion}`);

  // File updates.
  console.log("Updating version-bearing files...");
  applyFileUpdates(newVersion, dryRun);

  // CHANGELOG.
  console.log("Generating CHANGELOG entry...");
  const commits = readCommitsSince(lastTag);
  console.log(`  ${commits.length} commit(s) since ${lastTag}`);
  applyChangelogUpdate(newVersion, commits, dryRun);

  // Commit + tag.
  console.log("Committing and tagging...");
  const { tagName } = gitCommitAndTag(newVersion, dryRun);

  if (dryRun) {
    console.log("");
    console.log("Dry run complete. No files written, no git operations performed.");
    return;
  }

  console.log("");
  console.log(`Release ${tagName} committed and tagged locally.`);
  console.log(`Run: git push origin main && git push origin ${tagName}`);
}

// Only run main() when invoked directly, not when imported by tests.
const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((e) => {
    console.error(e?.stack ?? e?.message ?? String(e));
    process.exit(1);
  });
}
