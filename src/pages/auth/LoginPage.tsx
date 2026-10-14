import { useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { AlertTriangle, GraduationCap, KeyRound, Loader2, LogIn, ShieldCheck } from 'lucide-react';
import { auth, db, isFirebaseConfigured } from '../../lib/firebase';
import { homeRouteForRole } from '../../lib/access';
import { useAuth } from '../../context/AuthContext';
import { LoadingScreen } from '../../components/layout/ProtectedRoute';


function friendlyAuthError(code: string): string {
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-email':
      return 'Incorrect email or password.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a moment and try again.';
    case 'auth/network-request-failed':
      return 'Network error. Check your connection and try again.';
    case 'auth/user-disabled':
      return 'This account has been disabled. Contact your administrator.';
    default:
      return 'Sign-in failed. Please try again.';
  }
}

const NOTICE_TEXT = {
  disabled: 'Account disabled or unauthorized. Contact your administrator.',
  unprovisioned: 'Your account has not been provisioned for this application. Contact your administrator.',
  unsupported: 'Your account has an unsupported role or status. Contact your administrator.',
} as const;

export default function LoginPage() {
  const { user, userProfile, needsBootstrap, loading, notice, clearNotice, logout } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [bootstrapDenied, setBootstrapDenied] = useState(false);

  if (loading) return <LoadingScreen label="Checking your session…" />;

  if (user && userProfile) {
    const from = (location.state as { from?: string } | null)?.from;
    const home = homeRouteForRole(userProfile.role);
    const target = from && from.startsWith(home) ? from : home;
    return <Navigate to={target} replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    clearNotice();
    setSubmitting(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (err) {
      setError(friendlyAuthError((err as { code?: string }).code ?? ''));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleBootstrap() {
    if (!user) return;
    setBootstrapping(true);
    setBootstrapDenied(false);
    try {
      await setDoc(doc(db, 'users', user.uid), {
        uid: user.uid,
        email: user.email ?? '',
        displayName: user.displayName || 'Super Admin',
        role: 'super_admin',
        status: 'active',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: user.uid,
      });
      toast.success('Super Admin profile created.');
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === 'permission-denied') {
        // Production rules (FIREBASE_SECURITY.md) only let an existing Super Admin create users.
        setBootstrapDenied(true);
      } else {
        toast.error('Could not create the profile. Please try again.');
      }
    } finally {
      setBootstrapping(false);
    }
  }

  const bootstrapJson = user
    ? JSON.stringify(
        {
          uid: user.uid,
          email: user.email,
          displayName: 'Super Admin',
          role: 'super_admin',
          status: 'active',
        },
        null,
        2,
      )
    : '';

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-ink-900 via-ink-800 to-brand-900 p-6">
      <div className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 animate-float rounded-full bg-brand-500/30 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-24 h-[28rem] w-[28rem] animate-float rounded-full bg-violet-500/25 blur-3xl [animation-delay:3s]" />

      <div className="relative w-full max-w-md animate-fade-up">
        <div className="mb-8 text-center text-white">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-violet-500 shadow-glow">
            <GraduationCap className="h-8 w-8" />
          </div>
          <h1 className="text-3xl font-bold">CAGS Automation</h1>
          <p className="mt-2 text-sm text-slate-300">Academic records &amp; attendance portal for engineering departments</p>
        </div>

        <div className="glass-card p-8">
          {!isFirebaseConfigured && (
            <div role="alert" className="mb-5 flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>Firebase is not configured. Copy <code>.env.example</code> to <code>.env.local</code> and add your keys.</span>
            </div>
          )}

          {notice && (
            <div role="alert" id="access-notice" className="mb-5 flex gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{NOTICE_TEXT[notice]}</span>
            </div>
          )}

          {user && needsBootstrap ? (
            <section aria-labelledby="bootstrap-title" id="bootstrap-card">
              <div className="mb-4 flex items-center gap-2 text-brand-700">
                <ShieldCheck className="h-5 w-5" />
                <h2 id="bootstrap-title" className="text-lg font-semibold">First-Time Setup</h2>
              </div>
              <p className="text-sm text-slate-600">
                <strong>{user.email}</strong> is signed in but has no application profile. Initialize this account as the
                Super Admin?
              </p>

              {bootstrapDenied && (
                <div role="alert" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                  <p className="font-semibold">Firestore rules blocked the one-click setup.</p>
                  <p className="mt-1">
                    Create the document manually: Firebase Console → Firestore → collection <code>users</code> → document ID{' '}
                    <code>{user.uid}</code> with:
                  </p>
                  <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-900 p-3 text-[11px] leading-relaxed text-emerald-300">{bootstrapJson}</pre>
                  <p className="mt-2">Then reload this page.</p>
                </div>
              )}

              <div className="mt-5 flex flex-col gap-3">
                <button id="bootstrap-super-admin" type="button" className="btn-primary" onClick={handleBootstrap} disabled={bootstrapping}>
                  {bootstrapping ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                  Bootstrap First Super Admin
                </button>
                <button id="bootstrap-cancel" type="button" className="btn-secondary" onClick={() => void logout()}>
                  Sign out
                </button>
              </div>
            </section>
          ) : (
            <form onSubmit={handleSubmit} noValidate>
              <h2 className="mb-6 text-xl font-semibold text-slate-900">Sign in</h2>

              <label htmlFor="login-email" className="mb-1.5 block text-sm font-medium text-slate-700">Email</label>
              <input id="login-email" type="email" autoComplete="email" required className="input-field" placeholder="you@aiktc.ac.in" value={email} onChange={(e) => setEmail(e.target.value)} />

              <label htmlFor="login-password" className="mb-1.5 mt-4 block text-sm font-medium text-slate-700">Password</label>
              <input id="login-password" type="password" autoComplete="current-password" required className="input-field" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} />

              {error && (
                <p role="alert" id="login-error" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>
              )}

              <button id="login-submit" type="submit" className="btn-primary mt-6 w-full" disabled={submitting || !email || !password}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
                Sign in
              </button>
              <p className="mt-4 text-center text-xs text-slate-500">Accounts are provisioned by your Super Admin. Public sign-up is disabled.</p>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
