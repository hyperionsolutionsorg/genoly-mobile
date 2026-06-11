/**
 * useSignedUrl — resolves an R2 objectKey to a presigned download URL via
 * one-shot r2:getDownloadUrl calls with an in-memory TTL cache, so a
 * photo grid costs one query per unique image per ~10 minutes instead of
 * N live subscriptions (bandwidth diet).
 */

import { useEffect, useState } from 'react';
import { useConvex } from 'convex/react';

import { getDownloadUrl } from '../lib/genolyApi';

// Presigned URLs last 15 min server-side; refresh comfortably before.
const URL_TTL_MS = 10 * 60 * 1000;

interface CacheEntry {
  url: string;
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<string>>();

/** Test helper. */
export function __resetSignedUrlCache(): void {
  cache.clear();
  inflight.clear();
}

export function useSignedUrl(objectKey: string | null | undefined): string | null {
  const convex = useConvex();
  const [url, setUrl] = useState<string | null>(() => {
    if (!objectKey) return null;
    const hit = cache.get(objectKey);
    return hit && Date.now() - hit.fetchedAt < URL_TTL_MS ? hit.url : null;
  });

  useEffect(() => {
    if (!objectKey) {
      setUrl(null);
      return;
    }
    const hit = cache.get(objectKey);
    if (hit && Date.now() - hit.fetchedAt < URL_TTL_MS) {
      setUrl(hit.url);
      return;
    }
    let cancelled = false;
    let promise = inflight.get(objectKey);
    if (!promise) {
      promise = convex.query(getDownloadUrl, { objectKey }).then((signed) => {
        cache.set(objectKey, { url: signed, fetchedAt: Date.now() });
        inflight.delete(objectKey);
        return signed;
      });
      inflight.set(objectKey, promise);
    }
    promise
      .then((signed) => {
        if (!cancelled) setUrl(signed);
      })
      .catch(() => {
        inflight.delete(objectKey);
        if (!cancelled) setUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [objectKey, convex]);

  return url;
}
