/**
 * authSchemas.test.ts — C2 member-auth validation + error-mapping coverage.
 */

import {
  loginSchema,
  signupSchema,
  forgotVerifySchema,
  mfaCodeSchema,
  mapMemberAuthError,
} from '../lib/authSchemas';

describe('loginSchema', () => {
  it('accepts a normal email + 8-char password', () => {
    expect(
      loginSchema.safeParse({ email: 'maya@example.com', password: 'longenough' }).success,
    ).toBe(true);
  });

  it('rejects short passwords and malformed emails', () => {
    expect(loginSchema.safeParse({ email: 'nope', password: 'longenough' }).success).toBe(false);
    expect(loginSchema.safeParse({ email: 'a@b.com', password: 'short' }).success).toBe(false);
  });

  it('rejects RFC-6761 reserved-TLD emails with a friendly message', () => {
    const result = loginSchema.safeParse({ email: 'qa@genoly.test', password: 'longenough' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toMatch(/real email/i);
    }
  });
});

describe('signupSchema', () => {
  const base = {
    name: 'Maya Bennett',
    email: 'maya@example.com',
    password: 'longenough',
    confirmPassword: 'longenough',
    acceptedLegal: true as const,
  };

  it('accepts a complete signup', () => {
    expect(signupSchema.safeParse(base).success).toBe(true);
  });

  it('requires the legal-acceptance checkbox', () => {
    const result = signupSchema.safeParse({ ...base, acceptedLegal: undefined });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(JSON.stringify(result.error.issues)).toMatch(/Terms of Service/);
    }
  });

  it('requires matching passwords', () => {
    const result = signupSchema.safeParse({ ...base, confirmPassword: 'different1' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toContain('confirmPassword');
    }
  });

  it('requires a name', () => {
    expect(signupSchema.safeParse({ ...base, name: '  ' }).success).toBe(false);
  });
});

describe('forgotVerifySchema', () => {
  it('checks code length and password match', () => {
    expect(
      forgotVerifySchema.safeParse({
        code: 'ABCD2345',
        newPassword: 'longenough',
        confirmPassword: 'longenough',
      }).success,
    ).toBe(true);
    expect(
      forgotVerifySchema.safeParse({
        code: 'AB',
        newPassword: 'longenough',
        confirmPassword: 'longenough',
      }).success,
    ).toBe(false);
  });
});

describe('mfaCodeSchema', () => {
  it('accepts 6-digit TOTP and backup-code formats', () => {
    expect(mfaCodeSchema.safeParse({ code: '123456' }).success).toBe(true);
    expect(mfaCodeSchema.safeParse({ code: 'ABCDE-FGHIJ' }).success).toBe(true);
  });

  it('rejects too-short and too-long inputs', () => {
    expect(mfaCodeSchema.safeParse({ code: '123' }).success).toBe(false);
    expect(mfaCodeSchema.safeParse({ code: 'X'.repeat(20) }).success).toBe(false);
  });
});

describe('mapMemberAuthError', () => {
  it('maps legal-gate failures', () => {
    expect(mapMemberAuthError(new Error('acceptedLegal must be true'), 'signUp')).toMatch(
      /Terms of Service/,
    );
  });

  it('maps duplicate-account failures', () => {
    expect(mapMemberAuthError(new Error('Account already exists'), 'signUp')).toMatch(
      /already exists/i,
    );
  });

  it('maps rate limiting', () => {
    expect(mapMemberAuthError(new Error('Too many requests'), 'signIn')).toMatch(/Wait a minute/);
  });

  it('falls back per flow without leaking which field was wrong', () => {
    expect(mapMemberAuthError(new Error('InvalidSecret'), 'signIn')).toBe(
      'Wrong email or password. Try again.',
    );
    expect(mapMemberAuthError(new Error('boom'), 'reset')).toMatch(/code did not work/i);
  });
});
