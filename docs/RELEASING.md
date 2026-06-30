# Releasing Genoly Mobile

This repo ships a release-automation script at `scripts/release.mjs` that
atomically bumps the four version-bearing files, generates a CHANGELOG
entry from conventional commits, commits, and creates an annotated tag.
It does NOT push — that is a deliberate manual step.

## When to bump

Follow SemVer 2.0.

| Kind | When | Example |
|------|------|---------|
| `patch` (`1.0.x`) | Bug fixes, crash fixes, minor copy tweaks | Fix Health Connect reconnect loop |
| `minor` (`1.x.0`) | New screens or feature additions, backwards-compatible | Add DNA match screen |
| `major` (`x.0.0`) | Breaking changes — navigation restructures, auth contract changes, EAS runtime swap | RN 0.85 → 1.0 |
| `prerelease` (`1.0.0-pre.N`) | Cutting a pre-release build for TestFlight / internal track | `1.1.0-pre.0` |

## How to run

From the repo root:

```
npm run release:patch
npm run release:minor
npm run release:major
npm run release:prerelease
```

Or invoke the script directly:

```
node scripts/release.mjs <patch|minor|major|prerelease>
node scripts/release.mjs patch --dry-run
```

`--dry-run` prints the planned actions without writing files or running
any git mutations.

## What the script does

1. **Pre-flight** (aborts with a clear error on any failure):
   - Working tree is clean.
   - Currently on the `main` branch.
   - Local `main` is in sync with `origin/main`.
   - Last tag is a valid SemVer `vX.Y.Z(-pre.N)`.
   - All four version-bearing files agree on the current version
     (drift detection — the failure mode that landed PR #24 in a mixed
     0.1.0 / 1.0.0 state).
2. Computes the new SemVer from the current root `package.json` version.
3. Atomically updates the four version-bearing files (see below).
4. Reads conventional commits since the last tag, groups by prefix,
   generates a CHANGELOG section, prepends it under the title block.
5. Stages and commits with message exactly `chore: release v<new>`.
6. Creates an annotated tag `v<new>` with message `Genoly mobile v<new>`.
7. Prints the push command. Exits 0 without pushing.

## What it touches

The script writes exactly these four files:

| File | Field |
|------|-------|
| `package.json` (repo root) | `"version"` |
| `apps/mobile/package.json` | `"version"` |
| `apps/mobile/app.json` | `expo.version` |
| `apps/mobile/constants/version.ts` | `VERSION` constant |

Plus `docs/CHANGELOG.md` (new section prepended).

The existing parity test (`apps/mobile/__tests__/version.test.tsx`)
keeps `constants/version.ts::VERSION === app.json::expo.version` on
every release.

## What it does NOT touch

- `apps/mobile/app.json :: expo.ios.buildNumber`
- `apps/mobile/app.json :: expo.android.versionCode`
- `apps/mobile/constants/version.ts :: BUILD_NUMBER`

These drift per store submission, independent of the marketing version.
Bumping them is part of the store-submission ritual, not the release
script. See **Store-submission ritual** below.

## After the script runs

The script prints something like:

```
Release v1.0.1 committed and tagged locally.
Run: git push origin main && git push origin v1.0.1
```

Review the commit and tag locally (`git show HEAD`, `git show v1.0.1`)
before pushing. Once pushed, the tag is immutable.

## Recovery if something goes wrong mid-flow

The script writes files then commits — if a step fails after the file
writes but before the tag, undo everything with:

```
git reset --hard HEAD~1
git tag -d v<version>
```

The first command rolls back the commit + working-tree changes. The
second removes the local tag if one was created. Neither has any
effect once you've pushed — at which point the recovery is a new
patch release with corrected files.

To undo a tag locally before push:

```
git tag -d v<version>
```

## Store-submission ritual

When a marketing version actually ships to a store, ALSO bump the
native build identifiers manually:

- `apps/mobile/app.json :: expo.ios.buildNumber` — increment for every
  TestFlight / App Store submission, even when the marketing version
  stays the same.
- `apps/mobile/app.json :: expo.android.versionCode` — strictly
  monotonic integer; Google Play rejects re-uploads at the same code.
  Convention: increment by 100 per release (`100`, `200`, `300`...) to
  leave room for hotfix builds in between.

The release script intentionally leaves these alone so the marketing
version (`1.0.0`) can re-ship for store re-reviews without forcing a
SemVer bump.

## Sibling: web repo release script

The web app has its own equivalent at
`genoly-family-web/scripts/release.mjs` (task #401 web half). It
follows the same pattern adapted for that repo's version-bearing
files. Marketing version stays in lockstep across web and mobile.

## Tests

Pure helpers in `scripts/release.mjs` (SemVer math, file transforms,
CHANGELOG generation, drift detection) are unit-tested in
`scripts/release.test.mjs`. Run with:

```
npm run test:scripts
```

The transforms protect `ios.buildNumber` and `android.versionCode`
explicitly — see the `transformAppJson` tests.
