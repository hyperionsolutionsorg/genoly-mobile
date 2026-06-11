/**
 * dashboardFormat.ts — pure presentation helpers for the Home dashboard
 * (kept out of the screen file so they're unit-testable under Node).
 */

import type { AnniversaryItem } from './genolyApi';

export function medalFor(rank: number): string {
  return rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}.`;
}

export function annivEmoji(item: Pick<AnniversaryItem, 'kind'>): string {
  return item.kind === 'birthday' ? '🎂' : item.kind === 'marriage' ? '💍' : '🕯️';
}

export function annivTitle(item: AnniversaryItem): string {
  if (item.kind === 'marriage' && item.partnerNames) {
    return `${item.partnerNames.p1} & ${item.partnerNames.p2} — ${item.yearsSince} years`;
  }
  const name = item.personName ?? 'A family member';
  if (item.kind === 'birthday') {
    return `${name} turns ${item.yearsSince}`;
  }
  return `Remembering ${name}`;
}

export function annivWhen(item: Pick<AnniversaryItem, 'daysFromNow'>): string {
  if (item.daysFromNow === 0) return 'Today';
  if (item.daysFromNow === 1) return 'Tomorrow';
  return `In ${item.daysFromNow} days`;
}
