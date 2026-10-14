import { describe, expect, it } from 'vitest';
import { decideAccess, homeRouteForRole, parseUserProfile } from '../lib/access';
import type { UserProfile } from '../types';

const base: UserProfile = { uid: 'u1', email: 'a@b.c', displayName: 'A', role: 'teacher', status: 'active' };

describe('decideAccess', () => {
  it('denies unauthenticated users', () => {
    expect(decideAccess(false, null, ['teacher'])).toEqual({ allowed: false, reason: 'unauthenticated' });
  });
  it('denies signed-in users without a profile', () => {
    expect(decideAccess(true, null, ['teacher'])).toEqual({ allowed: false, reason: 'unprovisioned' });
  });
  it('denies disabled users', () => {
    expect(decideAccess(true, { ...base, status: 'disabled' }, ['teacher'])).toEqual({ allowed: false, reason: 'disabled' });
  });
  it('denies a teacher on an admin-only route', () => {
    expect(decideAccess(true, base, ['super_admin'])).toEqual({ allowed: false, reason: 'wrong_role' });
  });
  it('allows an active user with a permitted role', () => {
    expect(decideAccess(true, { ...base, role: 'super_admin' }, ['super_admin'])).toEqual({ allowed: true });
  });
});

describe('homeRouteForRole', () => {
  it('maps roles to home routes', () => {
    expect(homeRouteForRole('super_admin')).toBe('/admin');
    expect(homeRouteForRole('teacher')).toBe('/teacher');
  });
});

describe('parseUserProfile', () => {
  it('rejects unsupported role or status', () => {
    expect(parseUserProfile('u', { role: 'student', status: 'active' })).toBeNull();
    expect(parseUserProfile('u', { role: 'teacher', status: 'pending' })).toBeNull();
    expect(parseUserProfile('u', undefined)).toBeNull();
  });
  it('accepts valid profiles and forces uid from the document id', () => {
    const p = parseUserProfile('real', { uid: 'spoofed', role: 'teacher', status: 'active', email: 'x' });
    expect(p?.uid).toBe('real');
  });
});
