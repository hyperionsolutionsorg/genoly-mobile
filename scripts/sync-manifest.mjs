#!/usr/bin/env node
/**
 * sync-manifest.mjs (mobile repo)
 *
 * Reads apps/mobile/package.json, posts the manifest to Convex via plain
 * HTTP (no `convex` npm import — works identically in mobile). Used by:
 *
 *   1. `npm run sync-deps` (manual, run after SDK upgrades)
 *
 * Configuration (auto-loaded from `.env.local` in repo root):
 *
 *   CONVEX_URL=https://<deployment>.convex.cloud   (or VITE_CONVEX_URL)
 *   MANIFEST_SYNC_SECRET=<shared secret>
 *
 * The same shared secret used in genoly-family-web. One-time setup
 * matches the web setup — if already configured there, copy the secret.
 *
 * Fail-soft: any error logs a warning and exits 0, so it never blocks a
 * build or CI run.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REPO = "mobile";

/** Parse a `.env.local`-style file into a flat object. Quotes/comments handled. */
function parseDotEnv(content) {
  const env = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    const hashIdx = val.search(/\s+#/);
    if (hashIdx >= 0) val = val.slice(0, hashIdx).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
  return env;
}

async function main() {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const repoRoot = join(__dirname, "..");
  // Read from apps/mobile/package.json — that's the source of truth for
  // the Expo app's dependencies and is what expo-doctor validates.
  const pkgPath = join(repoRoot, "apps", "mobile", "package.json");
  const envPath = join(repoRoot, ".env.local");

  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));

  /** @type {Array<{packageName: string, currentVersion: string, type: "runtime"|"dev"}>} */
  const packages = [];
  for (const [name, version] of Object.entries(pkg.dependencies ?? {})) {
    packages.push({ packageName: name, currentVersion: version, type: "runtime" });
  }
  for (const [name, version] of Object.entries(pkg.devDependencies ?? {})) {
    packages.push({ packageName: name, currentVersion: version, type: "dev" });
  }

  let envFile = {};
  try {
    envFile = parseDotEnv(readFileSync(envPath, "utf-8"));
  } catch {
    // .env.local not found — fall through to process.env
  }

  const convexUrl =
    process.env.CONVEX_URL ||
    process.env.NEXT_PUBLIC_CONVEX_URL ||
    process.env.VITE_CONVEX_URL ||
    envFile.CONVEX_URL ||
    envFile.VITE_CONVEX_URL ||
    envFile.NEXT_PUBLIC_CONVEX_URL;

  const secret =
    process.env.MANIFEST_SYNC_SECRET || envFile.MANIFEST_SYNC_SECRET;

  if (!convexUrl) {
    console.warn(
      "[sync-manifest] Skipping — no CONVEX_URL / VITE_CONVEX_URL set in env or .env.local.",
    );
    process.exit(0);
  }
  if (!secret) {
    console.warn(
      "[sync-manifest] Skipping — no MANIFEST_SYNC_SECRET in env or .env.local.\n" +
        "  One-time setup:\n" +
        '    secret=$(openssl rand -hex 32)\n' +
        '    npx convex env set MANIFEST_SYNC_SECRET "$secret"\n' +
        '    echo "MANIFEST_SYNC_SECRET=$secret" >> .env.local',
    );
    process.exit(0);
  }

  console.log(`[sync-manifest] ${packages.length} packages → ${convexUrl}`);

  try {
    const response = await fetch(`${convexUrl}/api/mutation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: "dependencyManifest:syncFromPackageJson",
        format: "json",
        args: [{ repo: REPO, packages, secret }],
      }),
    });
    if (!response.ok) {
      const text = await response.text();
      console.warn(
        `[sync-manifest] ⚠ ${REPO}: HTTP ${response.status} — ${text.slice(0, 200)}`,
      );
      process.exit(0);
    }
    const body = await response.json();
    if (body.status === "success") {
      const result = body.value;
      console.log(
        `[sync-manifest] ✓ ${REPO}: ${result.inserted} inserted, ${result.replaced} replaced.`,
      );
    } else {
      console.warn(
        `[sync-manifest] ⚠ ${REPO}: ${body.errorMessage ?? "unknown error"}`,
      );
    }
  } catch (err) {
    console.warn(
      `[sync-manifest] ⚠ ${REPO}: ${err instanceof Error ? err.message : String(err)} — skipped.`,
    );
  }

  process.exit(0);
}

main().catch((err) => {
  console.warn(`[sync-manifest] ⚠ unexpected error: ${err?.message ?? err}`);
  process.exit(0);
});
