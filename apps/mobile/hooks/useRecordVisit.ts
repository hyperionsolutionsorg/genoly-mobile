/**
 * useRecordVisit — credits the 👋 visit streak once per UTC day, mirroring
 * the web's useRecordVisit-in-AppLayout pattern: an AsyncStorage day gate
 * in front of the server-idempotent users:recordVisitToday mutation, so a
 * normal day costs at most one mutation.
 */

import { useEffect } from 'react';
import { useConvex } from 'convex/react';

import { recordVisitToday } from '../lib/genolyApi';
import { getVisitRecordedDayUTC, setVisitRecordedDayUTC } from '../utils/preferences';

export function isoDayUtc(now: number = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

export function useRecordVisit(enabled: boolean): void {
  const convex = useConvex();

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      try {
        const today = isoDayUtc();
        const recorded = await getVisitRecordedDayUTC();
        if (cancelled || recorded === today) return;
        await convex.mutation(recordVisitToday, {});
        await setVisitRecordedDayUTC(today);
      } catch {
        // Best-effort — the server gate is idempotent; a missed credit
        // self-heals on the next app open.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, convex]);
}
