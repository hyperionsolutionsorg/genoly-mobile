/**
 * release.test.mjs — unit tests for scripts/release.mjs pure helpers.
 *
 * Run via the dedicated config (root jest preset is jest-expo, which
 * tries to transform .mjs via babel — we want plain Node ESM):
 *
 *   npx jest --config jest.scripts.config.cjs
 *   npm run test:scripts
 */

import {
  parseSemver,
  bumpSemver,
  isValidTag,
  transformPackageJson,
  transformAppJson,
  transformVersionTs,
  groupCommits,
  renderChangelogSection,
  insertChangelogSection,
  detectDrift,
} from "./release.mjs";

describe("parseSemver", () => {
  it("parses plain X.Y.Z", () => {
    expect(parseSemver("1.2.3")).toEqual({
      major: 1,
      minor: 2,
      patch: 3,
      prerelease: null,
    });
  });

  it("parses X.Y.Z-pre.N", () => {
    expect(parseSemver("1.0.0-pre.5")).toEqual({
      major: 1,
      minor: 0,
      patch: 0,
      prerelease: "pre.5",
    });
  });

  it("returns null for non-semver", () => {
    expect(parseSemver("v1.2.3")).toBeNull();
    expect(parseSemver("1.2")).toBeNull();
    expect(parseSemver("")).toBeNull();
    expect(parseSemver("abc")).toBeNull();
  });

  it("returns null for non-string", () => {
    expect(parseSemver(null)).toBeNull();
    expect(parseSemver(undefined)).toBeNull();
    expect(parseSemver(123)).toBeNull();
  });
});

describe("bumpSemver", () => {
  it("patch bump increments patch", () => {
    expect(bumpSemver("1.2.3", "patch")).toBe("1.2.4");
    expect(bumpSemver("0.0.0", "patch")).toBe("0.0.1");
    expect(bumpSemver("1.0.0", "patch")).toBe("1.0.1");
  });

  it("minor bump increments minor and resets patch", () => {
    expect(bumpSemver("1.2.3", "minor")).toBe("1.3.0");
    expect(bumpSemver("1.0.5", "minor")).toBe("1.1.0");
  });

  it("major bump increments major and resets minor + patch", () => {
    expect(bumpSemver("1.2.3", "major")).toBe("2.0.0");
    expect(bumpSemver("0.9.9", "major")).toBe("1.0.0");
  });

  it("prerelease bump creates -pre.0 on a stable version", () => {
    expect(bumpSemver("1.0.0", "prerelease")).toBe("1.0.0-pre.0");
  });

  it("prerelease bump increments pre.N", () => {
    expect(bumpSemver("1.0.0-pre.0", "prerelease")).toBe("1.0.0-pre.1");
    expect(bumpSemver("2.5.7-pre.42", "prerelease")).toBe("2.5.7-pre.43");
  });

  it("rejects unknown bump kinds", () => {
    expect(() => bumpSemver("1.0.0", "huge")).toThrow(/Unknown bump kind/);
  });

  it("rejects invalid input versions", () => {
    expect(() => bumpSemver("not-a-version", "patch")).toThrow(/valid SemVer/);
  });

  it("rejects prerelease bump on freeform prerelease tags", () => {
    expect(() => bumpSemver("1.0.0-alpha", "prerelease")).toThrow(
      /Cannot prerelease-bump/,
    );
  });
});

describe("isValidTag", () => {
  it("accepts vX.Y.Z", () => {
    expect(isValidTag("v1.0.0")).toBe(true);
    expect(isValidTag("v0.0.1")).toBe(true);
    expect(isValidTag("v10.20.30")).toBe(true);
  });

  it("accepts vX.Y.Z-pre.N", () => {
    expect(isValidTag("v1.0.0-pre.0")).toBe(true);
  });

  it("rejects missing v prefix", () => {
    expect(isValidTag("1.0.0")).toBe(false);
  });

  it("rejects garbage", () => {
    expect(isValidTag("vlatest")).toBe(false);
    expect(isValidTag("")).toBe(false);
    expect(isValidTag(null)).toBe(false);
  });
});

describe("transformPackageJson", () => {
  const sample = JSON.stringify(
    {
      name: "genoly-mobile",
      version: "1.0.0",
      private: true,
      scripts: { foo: "bar" },
    },
    null,
    2,
  );

  it("updates the version field", () => {
    const out = transformPackageJson(sample, "1.0.1");
    const parsed = JSON.parse(out);
    expect(parsed.version).toBe("1.0.1");
  });

  it("preserves other fields", () => {
    const out = transformPackageJson(sample, "2.0.0");
    const parsed = JSON.parse(out);
    expect(parsed.name).toBe("genoly-mobile");
    expect(parsed.private).toBe(true);
    expect(parsed.scripts).toEqual({ foo: "bar" });
  });

  it("preserves 2-space indentation", () => {
    const out = transformPackageJson(sample, "1.0.1");
    expect(out).toMatch(/^\{\n {2}"name"/);
  });

  it("ends with trailing newline", () => {
    const out = transformPackageJson(sample, "1.0.1");
    expect(out.endsWith("\n")).toBe(true);
  });
});

describe("transformAppJson", () => {
  const sample = JSON.stringify(
    {
      expo: {
        name: "Genoly",
        version: "1.0.0",
        ios: {
          bundleIdentifier: "org.hyperionsolutions.genoly",
          buildNumber: "1",
        },
        android: {
          package: "org.hyperionsolutions.genoly",
          versionCode: 100,
        },
        extra: {
          eas: { projectId: "abc" },
        },
      },
    },
    null,
    2,
  );

  it("updates expo.version", () => {
    const out = transformAppJson(sample, "1.0.1");
    const parsed = JSON.parse(out);
    expect(parsed.expo.version).toBe("1.0.1");
  });

  it("preserves ios.buildNumber unchanged", () => {
    const out = transformAppJson(sample, "2.0.0");
    const parsed = JSON.parse(out);
    expect(parsed.expo.ios.buildNumber).toBe("1");
  });

  it("preserves android.versionCode unchanged", () => {
    const out = transformAppJson(sample, "2.0.0");
    const parsed = JSON.parse(out);
    expect(parsed.expo.android.versionCode).toBe(100);
  });

  it("preserves expo.extra subtree", () => {
    const out = transformAppJson(sample, "1.2.0");
    const parsed = JSON.parse(out);
    expect(parsed.expo.extra.eas.projectId).toBe("abc");
  });

  it("throws when expo block is missing", () => {
    const bad = JSON.stringify({ name: "no-expo" });
    expect(() => transformAppJson(bad, "1.0.0")).toThrow(/expo/);
  });
});

describe("transformVersionTs", () => {
  const sample = `export const VERSION = "1.0.0";\nexport const BUILD_NUMBER = "1";\n`;

  it("updates VERSION", () => {
    const out = transformVersionTs(sample, "1.0.1");
    expect(out).toContain('export const VERSION = "1.0.1"');
  });

  it("preserves BUILD_NUMBER", () => {
    const out = transformVersionTs(sample, "1.0.1");
    expect(out).toContain('export const BUILD_NUMBER = "1"');
  });

  it("throws when VERSION line is absent", () => {
    expect(() => transformVersionTs("// nothing here\n", "1.0.0")).toThrow(
      /VERSION/,
    );
  });
});

describe("groupCommits", () => {
  it("groups by conventional prefix", () => {
    const commits = [
      { subject: "feat: add dna match screen" },
      { subject: "fix: health connect reconnect loop" },
      { subject: "chore: bump deps" },
    ];
    const grouped = groupCommits(commits);
    expect(grouped.get("Added")).toEqual(["add dna match screen"]);
    expect(grouped.get("Fixed")).toEqual(["health connect reconnect loop"]);
    expect(grouped.get("Chore")).toEqual(["bump deps"]);
  });

  it("skips merge commits", () => {
    const grouped = groupCommits([
      { subject: "Merge pull request #42 from feat-branch" },
      { subject: "feat: real change" },
    ]);
    expect(grouped.get("Added")).toEqual(["real change"]);
    expect(grouped.has("Other")).toBe(false);
  });

  it("skips chore: release rollups", () => {
    const grouped = groupCommits([
      { subject: "chore: release v1.0.0" },
      { subject: "feat: post-release feature" },
    ]);
    expect(grouped.get("Added")).toEqual(["post-release feature"]);
    expect(grouped.has("Chore")).toBe(false);
  });

  it("handles scoped prefixes feat(scope):", () => {
    const grouped = groupCommits([
      { subject: "feat(auth): mfa enrollment" },
      { subject: "fix(tree): person delete confirm" },
    ]);
    expect(grouped.get("Added")).toEqual(["mfa enrollment"]);
    expect(grouped.get("Fixed")).toEqual(["person delete confirm"]);
  });

  it("falls back to Other for unknown prefixes", () => {
    const grouped = groupCommits([{ subject: "wibble: experimental" }]);
    expect(grouped.get("Other")).toEqual(["wibble: experimental"]);
  });

  it("ignores empty subjects", () => {
    const grouped = groupCommits([{ subject: "" }, { subject: "   " }]);
    expect(grouped.size).toBe(0);
  });
});

describe("renderChangelogSection", () => {
  it("renders the section header with version + date", () => {
    const out = renderChangelogSection({
      version: "1.0.1",
      date: "2026-07-01",
      commits: [{ subject: "fix: small bug" }],
    });
    expect(out).toContain("## [1.0.1] — 2026-07-01");
  });

  it("groups items under prefix headings", () => {
    const out = renderChangelogSection({
      version: "1.1.0",
      date: "2026-07-15",
      commits: [
        { subject: "feat: new screen" },
        { subject: "fix: crash on load" },
      ],
    });
    expect(out).toContain("### Added\n\n- new screen");
    expect(out).toContain("### Fixed\n\n- crash on load");
  });

  it("ends with the --- separator", () => {
    const out = renderChangelogSection({
      version: "1.0.1",
      date: "2026-07-01",
      commits: [{ subject: "fix: x" }],
    });
    expect(out.endsWith("---\n")).toBe(true);
  });

  it("emits a 'Maintenance' section when there are no commits", () => {
    const out = renderChangelogSection({
      version: "1.0.1",
      date: "2026-07-01",
      commits: [],
    });
    expect(out).toContain("### Maintenance");
    expect(out).toContain("No notable changes");
  });
});

describe("insertChangelogSection", () => {
  it("inserts before the first existing ## [ heading", () => {
    const existing = `# Changelog\n\nSome preamble.\n\n## [1.0.0] — 2026-06-27\n\n### Added\n- initial\n`;
    const section = `## [1.0.1] — 2026-07-01\n\n### Fixed\n\n- bug\n\n---\n\n`;
    const out = insertChangelogSection(existing, section);
    const firstNewIdx = out.indexOf("## [1.0.1]");
    const oldIdx = out.indexOf("## [1.0.0]");
    expect(firstNewIdx).toBeGreaterThan(0);
    expect(oldIdx).toBeGreaterThan(firstNewIdx);
  });

  it("preserves the title block", () => {
    const existing = `# Changelog\n\n## [1.0.0] — 2026-06-27\n\n- initial\n`;
    const section = `## [1.0.1] — 2026-07-01\n\n- bug\n\n---\n\n`;
    const out = insertChangelogSection(existing, section);
    expect(out.startsWith("# Changelog")).toBe(true);
  });

  it("appends when no existing ## [ heading is found", () => {
    const existing = `# Changelog\n\nNo entries yet.\n`;
    const section = `## [1.0.0] — 2026-06-27\n\n- initial\n\n---\n\n`;
    const out = insertChangelogSection(existing, section);
    expect(out).toContain("# Changelog");
    expect(out).toContain("## [1.0.0]");
  });
});

describe("detectDrift", () => {
  it("returns ok when all versions match", () => {
    const result = detectDrift({
      "/a": "1.0.0",
      "/b": "1.0.0",
      "/c": "1.0.0",
      "/d": "1.0.0",
    });
    expect(result.ok).toBe(true);
    expect(result.version).toBe("1.0.0");
  });

  it("reports diverging files when versions mix", () => {
    const result = detectDrift({
      "/a": "1.0.0",
      "/b": "0.1.0",
      "/c": "1.0.0",
      "/d": "0.1.0",
    });
    expect(result.ok).toBe(false);
    // diverging list contains all four entries (path + version), so the
    // operator can read it as a complete snapshot.
    expect(result.diverging).toHaveLength(4);
    const paths = result.diverging.map((d) => d.path);
    expect(paths).toEqual(["/a", "/b", "/c", "/d"]);
  });

  it("handles a null version (missing constant) by treating it as diverging", () => {
    const result = detectDrift({
      "/a": "1.0.0",
      "/b": "1.0.0",
      "/c": null,
    });
    expect(result.ok).toBe(false);
    const cEntry = result.diverging.find((d) => d.path === "/c");
    expect(cEntry.version).toBeNull();
  });

  it("returns ok for empty input", () => {
    const result = detectDrift({});
    expect(result.ok).toBe(true);
  });
});
