import type { UserProfile, UserRole } from '../types';

export type AccessDecision =
  | { allowed: true }
  | { allowed: false; reason: 'unauthenticated' | 'unprovisioned' | 'disabled' | 'wrong_role' };

/** Home route for each role (ROLES_AND_PERMISSIONS.md / FRONTEND_IMPLEMENTATION.md section 3). */
export function homeRouteForRole(role: UserRole): string {
  return role === 'super_admin' ? '/admin' : '/teacher';
}

/** Pure authorization decision used by ProtectedRoute. UI guards are convenience only; Firestore rules enforce. */
export function decideAccess(
  isSignedIn: boolean,
  profile: UserProfile | null,
  allowedRoles: UserRole[],
): AccessDecision {
  if (!isSignedIn) return { allowed: false, reason: 'unauthenticated' };
  if (!profile) return { allowed: false, reason: 'unprovisioned' };
  if (profile.status !== 'active') return { allowed: false, reason: 'disabled' };
  if (!allowedRoles.includes(profile.role)) return { allowed: false, reason: 'wrong_role' };
  return { allowed: true };
}

/** Validates a raw Firestore document into a supported UserProfile, or null if role/status unsupported. */
export function parseUserProfile(uid: string, data: Record<string, unknown> | undefined): UserProfile | null {
  if (!data) return null;
  const role = data.role;
  const status = data.status;
  if (role !== 'super_admin' && role !== 'teacher') return null;
  if (status !== 'active' && status !== 'disabled') return null;
  return { ...(data as object), uid, role, status } as UserProfile;
}
