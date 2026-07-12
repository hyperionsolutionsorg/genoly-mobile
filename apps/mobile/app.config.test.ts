/**
 * Tests for Convex URL resolution by build profile (security follow-up item 1).
 *
 * Proves the mechanism locally with no build/deploy: a production build resolves
 * to operator-injected prod URLs and FAILS CLOSED if they are missing, a
 * placeholder, http://, or the wrong host; every non-production context uses the
 * committed dev URLs. `resolveConvexUrls` is exported from app.config.ts.
 */
import { resolveConvexUrls } from "./app.config";

const DEV_BASE = "https://robust-oyster-899.convex.site";
const DEV_CLOUD = "https://robust-oyster-899.convex.cloud";
const PROD_BASE = "https://keen-owl-415.convex.site";
const PROD_CLOUD = "https://keen-owl-415.convex.cloud";

const base = { devBaseUrl: DEV_BASE, devCloudUrl: DEV_CLOUD };

describe("resolveConvexUrls", () => {
  test("production with valid prod env vars → prod URLs", () => {
    expect(
      resolveConvexUrls({
        profile: "production",
        env: { CONVEX_PROD_BASE_URL: PROD_BASE, CONVEX_PROD_CLOUD_URL: PROD_CLOUD },
        ...base,
      }),
    ).toEqual({ baseUrl: PROD_BASE, cloudUrl: PROD_CLOUD });
  });

  test("production NEVER falls back to dev — missing prod env throws", () => {
    expect(() => resolveConvexUrls({ profile: "production", env: {}, ...base })).toThrow(
      /CONVEX_PROD_BASE_URL/,
    );
  });

  test("production rejects a scheme-less placeholder (the original bug)", () => {
    expect(() =>
      resolveConvexUrls({
        profile: "production",
        env: { CONVEX_PROD_BASE_URL: "keen-owl-415-placeholder", CONVEX_PROD_CLOUD_URL: PROD_CLOUD },
        ...base,
      }),
    ).toThrow(/https:\/\//);
  });

  test("production rejects cleartext http:// prod URL", () => {
    expect(() =>
      resolveConvexUrls({
        profile: "production",
        env: { CONVEX_PROD_BASE_URL: "http://keen-owl-415.convex.site", CONVEX_PROD_CLOUD_URL: PROD_CLOUD },
        ...base,
      }),
    ).toThrow(/https:\/\//);
  });

  test("production rejects a wrong-host URL", () => {
    expect(() =>
      resolveConvexUrls({
        profile: "production",
        env: { CONVEX_PROD_BASE_URL: "https://evil.example.com", CONVEX_PROD_CLOUD_URL: PROD_CLOUD },
        ...base,
      }),
    ).toThrow(/\.convex\.site/);
  });

  test.each(["development", "preview", undefined])(
    "profile %s → committed dev URLs (prod env ignored)",
    (profile) => {
      expect(
        resolveConvexUrls({
          profile: profile as string | undefined,
          env: { CONVEX_PROD_BASE_URL: PROD_BASE, CONVEX_PROD_CLOUD_URL: PROD_CLOUD },
          ...base,
        }),
      ).toEqual({ baseUrl: DEV_BASE, cloudUrl: DEV_CLOUD });
    },
  );

  test("missing dev URLs throws (misconfigured app.json)", () => {
    expect(() =>
      resolveConvexUrls({ profile: "development", env: {}, devBaseUrl: undefined, devCloudUrl: undefined }),
    ).toThrow(/Missing dev Convex URLs/);
  });
});
