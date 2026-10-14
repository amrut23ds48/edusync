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

  // Trim and check role & status
  const rawRole = typeof data.role === 'string' ? data.role.trim() : '';
  const rawStatus = typeof data.status === 'string' ? data.status.trim() : '';

  if (rawRole !== 'super_admin' && rawRole !== 'teacher') {
    console.warn(`[CAGS Auth] Unsupported or missing role in users/${uid}:`, data.role, '(Expected "super_admin" or "teacher")');
    return null;
  }
  if (rawStatus !== 'active' && rawStatus !== 'disabled') {
    console.warn(`[CAGS Auth] Unsupported or missing status in users/${uid}:`, data.status, '(Expected "active" or "disabled")');
    return null;
  }

  return { ...(data as object), uid, role: rawRole, status: rawStatus } as UserProfile;
}
