import { useCallback, useEffect, useState } from 'react';
import { collection, getCountFromServer, query, where } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { CheckCircle2, Database, Loader2, LogOut, Sprout } from 'lucide-react';
import { db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { OFFICIAL_GLOBAL_OUTCOMES, seedOfficialGlobalOutcomes } from '../../services/seedService';

const EXPECTED = OFFICIAL_GLOBAL_OUTCOMES.length;

export default function AdminOverviewPage() {
  const { userProfile, user, logout } = useAuth();
  const [count, setCount] = useState<number | null>(null);
  const [countError, setCountError] = useState(false);
  const [seeding, setSeeding] = useState(false);

  const loadCount = useCallback(async () => {
    try {
      setCountError(false);
      const snap = await getCountFromServer(query(collection(db, 'global_outcomes'), where('status', '==', 'active')));
      setCount(snap.data().count);
    } catch (err) {
      console.error('[CAGS] Failed to count outcomes', err);
      setCountError(true);
    }
  }, []);

  useEffect(() => {
    void loadCount();
  }, [loadCount]);

  async function handleSeed() {
    if (!user) return;
    setSeeding(true);
    try {
      console.log('[CAGS] Seeding outcomes with superAdminUid:', user.uid);
      await seedOfficialGlobalOutcomes(user.uid);
      await loadCount();
      toast.success(`Seeded ${EXPECTED} official outcomes.`);
    } catch (err: any) {
      console.error('[CAGS] Seeding failed with error:', err);
      const code = err?.code || '';
      const msg = err?.message || '';
      toast.error(code === 'permission-denied' 
        ? `Permission denied. Check firestore.rules and users/${user.uid} role.`
        : `Seeding failed: ${msg || 'Nothing was saved.'}`);
    } finally {
      setSeeding(false);
    }
  }

  const seeded = count === EXPECTED;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-100 to-slate-50">
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Super Admin Dashboard</h1>
            <p className="text-xs text-slate-500">
              {userProfile?.displayName} · {userProfile?.email} · 
              <span className="ml-1 font-mono text-emerald-600 font-semibold">role: "{userProfile?.role}"</span> · 
              <span className="ml-1 font-mono text-emerald-600 font-semibold">status: "{userProfile?.status}"</span>
            </p>
            <p className="text-[11px] text-slate-400 font-mono">UID: {user?.uid}</p>
          </div>
          <button id="logout-button" type="button" className="btn-secondary !py-2" onClick={() => void logout()}>
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        <section className="glass-card animate-fade-up p-8" aria-labelledby="seed-title">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
              <Database className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <h2 id="seed-title" className="text-lg font-semibold text-slate-900">Official Global Outcomes</h2>
              <p className="mt-1 text-sm text-slate-600">
                Seeds PO1–PO12, PEO1–PEO5 and PSO1–PSO2 verbatim from <code>project-outcome.pdf</code> into{' '}
                <code>global_outcomes</code>. Safe to re-run (existing records are merged, not duplicated).
              </p>

              <div className="mt-5 flex flex-wrap items-center gap-4">
                <button id="seed-outcomes" type="button" className="btn-primary" onClick={handleSeed} disabled={seeding}>
                  {seeding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sprout className="h-4 w-4" />}
                  Seed Official Outcomes
                </button>
                <span id="outcome-count" className={`badge ${seeded ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                  {countError ? 'Count unavailable' : count === null ? 'Counting…' : `${count} / ${EXPECTED} outcomes in Firestore`}
                </span>
                {seeded && <CheckCircle2 className="h-5 w-5 text-emerald-500" />}
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
