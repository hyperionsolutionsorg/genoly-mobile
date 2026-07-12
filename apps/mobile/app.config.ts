import type { ConfigContext, ExpoConfig } from "expo/config";

/**
 * Dynamic Expo config (security follow-up item 1, 2026-07-11).
 *
 * Previously app.json was static: `extra.convexBaseUrl` / `convexCloudUrl` held
 * the DEV deployment for every build, and the `convexProdBaseUrl` /
 * `convexProdCloudUrl` keys were scheme-less placeholders no code ever read — so
 * a PRODUCTION build silently shipped pointing at the dev backend.
 *
 * This resolves the Convex URLs by build profile and FAILS THE BUILD if a
 * production build lacks valid production URLs — far safer than a runtime throw
 * that would ship a broken binary to users.
 *
 * Forkability / injection rule (AGENTS.md §3.10): production URLs are NOT
 * hardcoded — they are injected via the operator-set EAS environment variables
 * CONVEX_PROD_BASE_URL / CONVEX_PROD_CLOUD_URL (production scope), read from
 * process.env at config-eval time. Dev URLs stay in app.json's `extra` as the
 * committed default for development/preview/local builds.
 *
 * The resolver is kept in THIS file (not a sibling module) and exported for
 * unit tests, because Expo's config loader can't resolve a nested `.ts` import
 * at require time. `app.config.test.ts` imports `resolveConvexUrls` from here.
 */

export interface ResolveConvexUrlsInput {
  /** EAS build profile — `process.env.EAS_BUILD_PROFILE`. Undefined for local `expo start`. */
  profile: string | undefined;
  env: Record<string, string | undefined>;
  /** Committed dev/default base URL from app.json extra. */
  devBaseUrl: string | undefined;
  /** Committed dev/default cloud URL from app.json extra. */
  devCloudUrl: string | undefined;
}

export interface ConvexUrls {
  baseUrl: string;
  cloudUrl: string;
}

function assertValidConvexUrl(
  name: string,
  value: string | undefined,
  expectHostSuffix: string,
): string {
  if (!value || typeof value !== "string") {
    throw new Error(
      `[app.config] Production build requires ${name} to be set (operator EAS env var). ` +
        `Refusing to build a production app that would point at the dev backend.`,
    );
  }
  if (!value.startsWith("https://")) {
    throw new Error(
      `[app.config] ${name} must be an https:// URL (got "${value}"). ` +
        `A scheme-less placeholder or http:// value is rejected for production.`,
    );
  }
  if (!value.includes(expectHostSuffix)) {
    throw new Error(`[app.config] ${name} must be a Convex ${expectHostSuffix} URL (got "${value}").`);
  }
  return value;
}

/**
 * Resolve the Convex base (fitness HTTP) + cloud (member reactive) URLs for the
 * current build profile. Production → operator-injected prod env vars (validated,
 * fail-closed). Everything else (development, preview, local `expo start`) → the
 * committed dev defaults.
 */
export function resolveConvexUrls({
  profile,
  env,
  devBaseUrl,
  devCloudUrl,
}: ResolveConvexUrlsInput): ConvexUrls {
  if (profile === "production") {
    return {
      baseUrl: assertValidConvexUrl("CONVEX_PROD_BASE_URL", env.CONVEX_PROD_BASE_URL, ".convex.site"),
      cloudUrl: assertValidConvexUrl("CONVEX_PROD_CLOUD_URL", env.CONVEX_PROD_CLOUD_URL, ".convex.cloud"),
    };
  }
  if (!devBaseUrl || !devCloudUrl) {
    throw new Error(
      "[app.config] Missing dev Convex URLs (extra.convexBaseUrl / extra.convexCloudUrl) in app.json.",
    );
  }
  return { baseUrl: devBaseUrl, cloudUrl: devCloudUrl };
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const extra = { ...(config.extra ?? {}) } as Record<string, unknown>;

  const { baseUrl, cloudUrl } = resolveConvexUrls({
    profile: process.env.EAS_BUILD_PROFILE,
    env: process.env,
    devBaseUrl: extra.convexBaseUrl as string | undefined,
    devCloudUrl: extra.convexCloudUrl as string | undefined,
  });

  // Prod URLs are env-injected per profile now — drop any dead placeholder keys.
  delete extra.convexProdBaseUrl;
  delete extra.convexProdCloudUrl;

  return {
    ...(config as ExpoConfig),
    extra: {
      ...extra,
      convexBaseUrl: baseUrl,
      convexCloudUrl: cloudUrl,
    },
  };
};
