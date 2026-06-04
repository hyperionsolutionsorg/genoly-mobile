#!/usr/bin/env node
/**
 * sync-manifest.mjs (mobile repo)
 *
 * Reads `apps/mobile/package.json`, posts the manifest to Convex via
 * plain HTTP (no `convex` npm import — mobile doesn't have it). Used by:
 *
 *   1. `npm run sync-deps` (manual)
 *
 * Configuration — Convex URL + secret are read from the WEB repo's
 * `.env.local` (one Convex deployment is shared between web + mobile).
 * Path resolution: `../genoly-family-web/.env.local` relative to this
 * mobile repo root. Override via env if your layout differs.
 *
 *   VITE_CONVEX_URL=https://<deployment>.convex.cloud
 *   MANIFEST_SYNC_SECRET=<shared secret>
 *
 * See genoly-family-web/scripts/sync-manifest.mjs for the one-time secret
 * setup instructions.
 *
 * Skips internal workspace packages (`@genoly/*`) and entries with
 * `version === "*"` (yarn/npm workspace placeholders).
 *
 * Fail-soft: any error logs a warning and exits 0.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const REPO = "mobile";

/** Parse a `.env.local`-style file into a flat object. */
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
  const mobileRoot = join(__dirname, "..");
  const mobilePkgPath = join(mobileRoot, "apps", "mobile", "package.json");

  // The web repo lives as a sibling — read its .env.local for Convex creds
  const webEnvPath = resolve(mobileRoot, "..", "genoly-family-web", ".env.local");

  const pkg = JSON.parse(readFileSync(mobilePkgPath, "utf-8"));

  /** @type {Array<{packageName: string, currentVersion: string, type: "runtime"|"dev"}>} */
  const packages = [];
  const skipPackage = (name, version) =>
    name.startsWith("@genoly/") || version === "*";

  for (const [name, version] of Object.entries(pkg.dependencies ?? {})) {
    if (skipPackage(name, version)) continue;
    packages.push({ packageName: name, currentVersion: version, type: "runtime" });
  }
  for (const [name, version] of Object.entries(pkg.devDependencies ?? {})) {
    if (skipPackage(name, version)) continue;
    packages.push({ packageName: name, currentVersion: version, type: "dev" });
  }

  // Load secrets — prefer process.env, fall back to web repo's .env.local
  let envFile = {};
  try {
    envFile = parseDotEnv(readFileSync(webEnvPath, "utf-8"));
  } catch {
    // .env.local not found — fall through to process.env
  }

  const convexUrl =
    process.env.CONVEX_URL ||
    process.env.EXPO_PUBLIC_CONVEX_URL ||
    process.env.NEXT_PUBLIC_CONVEX_URL ||
    process.env.VITE_CONVEX_URL ||
    envFile.CONVEX_URL ||
    envFile.VITE_CONVEX_URL ||
    envFile.NEXT_PUBLIC_CONVEX_URL;

  const secret =
    process.env.MANIFEST_SYNC_SECRET || envFile.MANIFEST_SYNC_SECRET;

  if (!convexUrl) {
    console.warn(
      `[sync-manifest] Skipping — no CONVEX_URL set in env or in ${webEnvPath}.`,
    );
    process.exit(0);
  }
  if (!secret) {
    console.warn(
      `[sync-manifest] Skipping — no MANIFEST_SYNC_SECRET in env or in ${webEnvPath}.\n` +
        "  See genoly-family-web/scripts/sync-manifest.mjs for one-time setup.",
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
