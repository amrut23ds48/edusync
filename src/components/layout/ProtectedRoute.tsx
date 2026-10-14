import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { decideAccess, homeRouteForRole } from '../../lib/access';
import type { UserRole } from '../../types';

export function LoadingScreen({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50">
      <div className="h-12 w-12 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
      <p className="text-sm font-medium text-slate-500">{label}</p>
    </div>
  );
}

export function ProtectedRoute({ allowedRoles, children }: { allowedRoles: UserRole[]; children: ReactNode }) {
  const { user, userProfile, loading } = useAuth();
  const location = useLocation();

  if (loading) return <LoadingScreen label="Verifying your session…" />;

  const decision = decideAccess(Boolean(user), userProfile, allowedRoles);
  if (decision.allowed) return <>{children}</>;

  if (decision.reason === 'wrong_role' && userProfile) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="glass-card max-w-md p-8 text-center">
          <ShieldAlert className="mx-auto mb-3 h-10 w-10 text-amber-500" />
          <h1 className="text-xl font-semibold">Access restricted</h1>
          <p className="mt-2 text-sm text-slate-600">Your role does not have permission to open this page.</p>
          <Navigate to={homeRouteForRole(userProfile.role)} replace />
        </div>
      </div>
    );
  }

  return <Navigate to="/login" replace state={{ from: location.pathname }} />;
}
