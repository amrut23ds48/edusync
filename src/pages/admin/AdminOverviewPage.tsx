import { useCallback, useEffect, useState } from 'react';
import { collection, getCountFromServer, query, where } from 'firebase/firestore';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { 
  Building2, 
  GraduationCap, 
  Users, 
  Award, 
  CalendarClock, 
  CheckCircle2, 
  Loader2, 
  Sprout, 
  ArrowRight,
  Database
} from 'lucide-react';
import { db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { OFFICIAL_GLOBAL_OUTCOMES, seedOfficialGlobalOutcomes } from '../../services/seedService';

const EXPECTED = OFFICIAL_GLOBAL_OUTCOMES.length;

export default function AdminOverviewPage() {
  const { user } = useAuth();
  const [outcomeCount, setOutcomeCount] = useState<number | null>(null);
  const [departmentCount, setDepartmentCount] = useState<number | null>(null);
  const [teacherCount, setTeacherCount] = useState<number | null>(null);
  const [seeding, setSeeding] = useState(false);

  const loadStats = useCallback(async () => {
    try {
      const outcomeSnap = await getCountFromServer(
        query(collection(db, 'global_outcomes'), where('status', '==', 'active'))
      );
      setOutcomeCount(outcomeSnap.data().count);
    } catch (err) {
      console.warn('[CAGS] Could not count outcomes', err);
    }

    try {
      const deptSnap = await getCountFromServer(
        query(collection(db, 'departments'), where('status', '==', 'active'))
      );
      setDepartmentCount(deptSnap.data().count);
    } catch {
      setDepartmentCount(0);
    }

    try {
      const teacherSnap = await getCountFromServer(
        query(collection(db, 'users'), where('role', '==', 'teacher'))
      );
      setTeacherCount(teacherSnap.data().count);
    } catch {
      setTeacherCount(0);
    }
  }, []);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  async function handleSeed() {
    if (!user) return;
    setSeeding(true);
    try {
      await seedOfficialGlobalOutcomes(user.uid);
      await loadStats();
      toast.success(`Seeded ${EXPECTED} official outcomes.`);
    } catch (err: any) {
      console.error('[CAGS] Seeding failed:', err);
      toast.error('Seeding failed. Check permissions.');
    } finally {
      setSeeding(false);
    }
  }

  const seeded = outcomeCount === EXPECTED;

  const quickLinks = [
    {
      title: 'Departments',
      description: 'Create and configure institutional departments.',
      to: '/admin/departments',
      icon: Building2,
      count: departmentCount !== null ? `${departmentCount} active` : '...',
      color: 'from-blue-600 to-indigo-600',
    },
    {
      title: 'Academic Setup',
      description: 'Manage Academic Years, Classes, and Subjects.',
      to: '/admin/academic-setup',
      icon: GraduationCap,
      count: 'Hierarchy Config',
      color: 'from-indigo-600 to-violet-600',
    },
    {
      title: 'Teachers & Assignments',
      description: 'Provision teacher accounts and assign subjects.',
      to: '/admin/teachers',
      icon: Users,
      count: teacherCount !== null ? `${teacherCount} provisioned` : '...',
      color: 'from-violet-600 to-purple-600',
    },
    {
      title: 'Global Outcomes',
      description: 'Program Outcomes (POs, PEOs, PSOs) per department.',
      to: '/admin/outcomes',
      icon: Award,
      count: outcomeCount !== null ? `${outcomeCount} outcomes` : '...',
      color: 'from-amber-600 to-orange-600',
    },
    {
      title: 'Class Timetables',
      description: 'Configure weekly lecture recurrence and slots.',
      to: '/admin/timetables',
      icon: CalendarClock,
      count: 'Weekly Schedules',
      color: 'from-emerald-600 to-teal-600',
    },
  ];

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Institutional Administration</h1>
        <p className="mt-1 text-sm text-slate-500">
          Configure academic years, departments, curricula, teacher assignments, and timetable schedules.
        </p>
      </div>

      {/* Quick Navigation Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {quickLinks.map((card) => {
          const Icon = card.icon;
          return (
            <Link
              key={card.to}
              to={card.to}
              className="glass-card p-6 flex flex-col justify-between hover:shadow-glow hover:-translate-y-1 transition-all duration-200 group"
            >
              <div>
                <div className={`h-11 w-11 rounded-xl bg-gradient-to-br ${card.color} text-white flex items-center justify-center mb-4 shadow-sm`}>
                  <Icon className="h-5 w-5" />
                </div>
                <h2 className="text-base font-semibold text-slate-900 group-hover:text-brand-600 transition-colors">
                  {card.title}
                </h2>
                <p className="mt-1 text-xs text-slate-500 leading-relaxed">
                  {card.description}
                </p>
              </div>
              <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-600">{card.count}</span>
                <span className="text-xs font-semibold text-brand-600 flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
                  Configure <ArrowRight className="h-3.5 w-3.5" />
                </span>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Outcomes Seeder Quick Card */}
      <section className="glass-card p-6 border-brand-100 bg-gradient-to-r from-brand-50/40 via-white to-violet-50/40" aria-labelledby="seed-title">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700 shadow-sm">
              <Database className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 id="seed-title" className="text-base font-semibold text-slate-900">
                  Data Science Official Outcomes
                </h3>
                {seeded && (
                  <span className="badge bg-emerald-100 text-emerald-800 flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Fully Seeded
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-slate-600 max-w-2xl">
                Seeded verbatim from <code>project-outcome.pdf</code> (PO1–PO12, PEO1–PEO5, PSO1–PSO2). Managed under the Global Outcomes console.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <span id="outcome-count" className="text-xs font-mono font-medium text-slate-600 bg-white/80 px-3 py-1.5 rounded-lg border border-slate-200">
              {outcomeCount === null ? 'Checking...' : `${outcomeCount} / ${EXPECTED} active`}
            </span>
            <button
              id="seed-outcomes"
              type="button"
              className="btn-primary !py-2 !px-4 !text-xs"
              onClick={handleSeed}
              disabled={seeding || seeded}
            >
              {seeding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sprout className="h-4 w-4" />}
              {seeded ? 'Seeded' : 'Seed Default Outcomes'}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
