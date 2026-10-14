import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { parseUserProfile } from '../lib/access';
import type { UserProfile } from '../types';

const BOOTSTRAP_ENABLED = import.meta.env.VITE_ENABLE_ADMIN_BOOTSTRAP === 'true';

export type AccessNotice = 'disabled' | 'unprovisioned' | 'unsupported' | null;

interface AuthContextValue {
  user: User | null;
  userProfile: UserProfile | null;
  /** Signed in with Firebase Auth but no users/{uid} document (only kept signed in for dev bootstrap). */
  needsBootstrap: boolean;
  loading: boolean;
  notice: AccessNotice;
  isSuperAdmin: boolean;
  isTeacher: boolean;
  clearNotice: () => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [needsBootstrap, setNeedsBootstrap] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<AccessNotice>(null);

  useEffect(() => {
    let unsubProfile: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, (firebaseUser) => {
      unsubProfile?.();
      unsubProfile = null;
      setUser(firebaseUser);
      setUserProfile(null);
      setNeedsBootstrap(false);

      if (!firebaseUser) {
        setLoading(false);
        return;
      }

      setLoading(true);
      unsubProfile = onSnapshot(
        doc(db, 'users', firebaseUser.uid),
        (snap) => {
          if (!snap.exists()) {
            // Unprovisioned. Allow a signed-in session only for the dev bootstrap flow.
            setUserProfile(null);
            if (BOOTSTRAP_ENABLED) {
              setNeedsBootstrap(true);
              setLoading(false);
            } else {
              setNotice('unprovisioned');
              void signOut(auth);
            }
            return;
          }

          const profile = parseUserProfile(firebaseUser.uid, snap.data());
          if (!profile) {
            setNotice('unsupported');
            setUserProfile(null);
            void signOut(auth);
            return;
          }

          if (profile.status === 'disabled') {
            setNotice('disabled');
            setUserProfile(null);
            void signOut(auth);
            return;
          }

          setNeedsBootstrap(false);
          setUserProfile(profile);
          setLoading(false);
        },
        (error) => {
          console.error('[CAGS] Failed to read user profile', error);
          setNotice('unprovisioned');
          setUserProfile(null);
          setLoading(false);
          void signOut(auth);
        },
      );
    });

    return () => {
      unsubProfile?.();
      unsubAuth();
    };
  }, []);

  const logout = useCallback(async () => {
    await signOut(auth);
  }, []);

  const clearNotice = useCallback(() => setNotice(null), []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      userProfile,
      needsBootstrap,
      loading,
      notice,
      isSuperAdmin: userProfile?.role === 'super_admin',
      isTeacher: userProfile?.role === 'teacher',
      clearNotice,
      logout,
    }),
    [user, userProfile, needsBootstrap, loading, notice, clearNotice, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
