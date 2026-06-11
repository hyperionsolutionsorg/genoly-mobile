/**
 * genolyApi.test.ts — guards the hand-maintained function-reference names
 * against typos. The strings must match the web repo's convex file/export
 * layout ("path/file:exportName"); a wrong name fails at runtime with a
 * confusing server error, so we pin them here.
 */

import { getFunctionName } from 'convex/server';

import {
  usersMe,
  recordLoginAttempt,
  isCurrentSessionMfaVerified,
  verifyMfaForSession,
  getMfaStatus,
  requestMfaRecovery,
  sendVerificationEmailToMe,
  getMyVerificationStatus,
  completeOnboardingFirstTree,
  completeOnboarding,
  listMyTrees,
  getTreeBySlug,
  createPerson,
  addChildToPerson,
  listAllPersonsByTree,
  searchPersonsAutocomplete,
  getPerson,
  getPersonBySlugOrId,
  updatePerson,
  listEventsByPerson,
  createEventForPerson,
  getMediaForTarget,
  getDownloadUrl,
  getUploadUrl,
  createMediaMetadata,
  linkMedia,
  getRelationshipGraph,
  createFamily,
  getMyRewardsSummary,
  getTreeLeaderboard,
  recordVisitToday,
  getUpcomingAnniversaries,
  getGamesContext,
  recordDailyCompletion,
  getDailySocialStats,
  isDemoEmail,
  isAdminRole,
} from '../lib/genolyApi';

describe('function reference names', () => {
  it.each([
    [usersMe, 'users:me'],
    [recordLoginAttempt, 'lib/authRateLimit:recordLoginAttempt'],
    [isCurrentSessionMfaVerified, 'mfa:isCurrentSessionMfaVerified'],
    [verifyMfaForSession, 'mfa:verifyMfaForSession'],
    [getMfaStatus, 'mfa:getMfaStatus'],
    [requestMfaRecovery, 'mfa:requestMfaRecovery'],
    [sendVerificationEmailToMe, 'emailVerification:sendVerificationEmailToMe'],
    [getMyVerificationStatus, 'emailVerification:getMyVerificationStatus'],
    [completeOnboardingFirstTree, 'onboarding:completeOnboardingFirstTree'],
    [completeOnboarding, 'onboarding:completeOnboarding'],
    [listMyTrees, 'trees:listMyTrees'],
    [getTreeBySlug, 'trees:getTreeBySlug'],
    [createPerson, 'persons:createPerson'],
    [addChildToPerson, 'families:addChildToPerson'],
    [listAllPersonsByTree, 'persons:listAllPersonsByTree'],
    [searchPersonsAutocomplete, 'personSearch:searchPersonsAutocomplete'],
    [getPerson, 'persons:getPerson'],
    [getPersonBySlugOrId, 'persons:getPersonBySlugOrId'],
    [updatePerson, 'persons:updatePerson'],
    [listEventsByPerson, 'events:listEventsByPerson'],
    [createEventForPerson, 'events:createEventForPerson'],
    [getMediaForTarget, 'media:getMediaForTarget'],
    [getDownloadUrl, 'r2:getDownloadUrl'],
    [getUploadUrl, 'r2:getUploadUrl'],
    [createMediaMetadata, 'media:createMediaMetadata'],
    [linkMedia, 'media:linkMedia'],
    [getRelationshipGraph, 'games:getRelationshipGraph'],
    [createFamily, 'families:createFamily'],
    [getMyRewardsSummary, 'rewards:getMyRewardsSummary'],
    [getTreeLeaderboard, 'treeLeaderboards:getTreeLeaderboard'],
    [recordVisitToday, 'users:recordVisitToday'],
    [getUpcomingAnniversaries, 'anniversaries:getUpcomingAnniversaries'],
    [getGamesContext, 'games:getGamesContext'],
    [recordDailyCompletion, 'gameCompletions:recordDailyCompletion'],
    [getDailySocialStats, 'gameCompletions:getDailySocialStats'],
  ])('reference resolves to %s', (ref, expected) => {
    expect(getFunctionName(ref)).toBe(expected);
  });
});

describe('demo + admin helpers', () => {
  it('detects the two demo accounts (SSOT mirror of web demoUsers.ts)', () => {
    expect(isDemoEmail('demo-admin@genoly.org')).toBe(true);
    expect(isDemoEmail('demo-viewer@genoly.org')).toBe(true);
    expect(isDemoEmail('shankar@genoly.org')).toBe(false);
    expect(isDemoEmail(undefined)).toBe(false);
  });

  it('classifies admin-tier roles for the admin-on-mobile banner', () => {
    expect(isAdminRole('super_admin')).toBe(true);
    expect(isAdminRole('site_admin')).toBe(true);
    expect(isAdminRole('moderator')).toBe(true);
    expect(isAdminRole('support')).toBe(true);
    expect(isAdminRole('member')).toBe(false);
    expect(isAdminRole(undefined)).toBe(false);
  });
});
