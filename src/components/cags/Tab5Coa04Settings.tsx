import { useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { Loader2, Save, Info } from 'lucide-react';
import { db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { useAcademic } from '../../context/AcademicContext';
import { averageOf, saveCoa04, validateCoa04 } from '../../services/cagsService';
import type { AttainmentGoals, CagsCoa04Document, HistoricalMarks } from '../../types';

export function defaultGoals(marksThreshold: number): AttainmentGoals {
  return {
    level3: { studentPercentThreshold: 60, marksPercentThreshold: marksThreshold },
    level2: { studentPercentThreshold: 50, marksPercentThreshold: marksThreshold },
    level1: { studentPercentThreshold: 40, marksPercentThreshold: marksThreshold },
    justification: '',
  };
}

/** "2025-26" -> ["2022-23","2023-24","2024-25"] (CAY-3, CAY-2, CAY-1). */
export function previousYearLabels(label?: string): string[] {
  const m = label?.match(/^(\d{4})-(\d{2})$/);
  if (!m) return ['CAY-3', 'CAY-2', 'CAY-1'];
  const start = parseInt(m[1], 10);
  return [3, 2, 1].map((n) => {
    const s = start - n;
    return `${s}-${String((s + 1) % 100).padStart(2, '0')}`;
  });
}

function num(v: string): number | null {
  if (v.trim() === '') return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

export default function Tab5Coa04Settings() {
  const { user, isSuperAdmin } = useAuth();
  const { activeSubject, activeAcademicYear } = useAcademic();
  const subjectId = activeSubject?.id;

  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState<CagsCoa04Document | null>(null);
  const [saving, setSaving] = useState(false);

  const [history, setHistory] = useState<HistoricalMarks[]>([]);
  const [manualCia, setManualCia] = useState(60);
  const [manualTee, setManualTee] = useState(50);
  const [baseJustification, setBaseJustification] = useState('');
  const [cia, setCia] = useState<AttainmentGoals>(defaultGoals(60));
  const [tee, setTee] = useState<AttainmentGoals>(defaultGoals(55));

  useEffect(() => {
    if (!subjectId) return;
    setLoaded(false);
    return onSnapshot(
      doc(db, 'cags_coa04', subjectId),
      (snap) => {
        setSaved(snap.exists() ? (snap.data() as CagsCoa04Document) : null);
        setLoaded(true);
      },
      (err) => {
        console.error('[EduSync] cags_coa04 listener failed:', err);
        setLoaded(true);
      }
    );
  }, [subjectId]);

  // Initialise form from saved doc (or defaults) whenever the snapshot arrives
  useEffect(() => {
    if (!loaded) return;
    const labels = previousYearLabels(activeAcademicYear?.yearLabel);
    const defaultsHistory: HistoricalMarks[] = labels.map((y) => ({ academicYear: y, ciaAvgPercent: null, teeAvgPercent: null }));
    setHistory(saved?.historicalMarks?.length ? saved.historicalMarks : defaultsHistory);
    setManualCia(saved?.last3YearsAverage?.ciaPercent ?? 60);
    setManualTee(saved?.last3YearsAverage?.teePercent ?? 50);
    setBaseJustification(saved?.calculationBaseJustification ?? '');
    setCia(saved?.ciaAttainmentGoals ?? defaultGoals(60));
    setTee(saved?.teeAttainmentGoals ?? defaultGoals(55));
  }, [loaded, saved, activeAcademicYear?.yearLabel]);

  const hasHistory = history.some((h) => h.ciaAvgPercent !== null || h.teeAvgPercent !== null);
  const avgCia = hasHistory ? averageOf(history.map((h) => h.ciaAvgPercent)) : manualCia;
  const avgTee = hasHistory ? averageOf(history.map((h) => h.teeAvgPercent)) : manualTee;

  const errors = useMemo(
    () => validateCoa04({ ciaAttainmentGoals: cia, teeAttainmentGoals: tee }),
    [cia, tee]
  );

  async function handleSave() {
    if (!activeSubject || !user) return;
    setSaving(true);
    try {
      await saveCoa04(
        { subjectId: activeSubject.id, academicYearId: activeSubject.academicYearId, classId: activeSubject.classId },
        { uid: user.uid, role: isSuperAdmin ? 'super_admin' : 'teacher' },
        {
          historicalMarks: history,
          last3YearsAverage: { ciaPercent: avgCia, teePercent: avgTee },
          calculationBaseJustification: baseJustification.trim(),
          ciaAttainmentGoals: { ...cia, justification: cia.justification.trim() },
          teeAttainmentGoals: { ...tee, justification: tee.justification.trim() },
          cdcApprovalStatus: 'pending',
        }
      );
      toast.success('COA-04 target settings saved.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save COA-04 settings.');
    } finally {
      setSaving(false);
    }
  }

  function goalTable(
    title: string,
    idPrefix: string,
    goals: AttainmentGoals,
    set: (g: AttainmentGoals) => void
  ) {
    const rows: { key: 'level3' | 'level2' | 'level1'; label: string }[] = [
      { key: 'level3', label: 'Level 3' },
      { key: 'level2', label: 'Level 2' },
      { key: 'level1', label: 'Level 1' },
    ];
    return (
      <div className="glass-card p-4 space-y-3">
        <p className="text-sm font-bold text-slate-800">{title}</p>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-slate-500 text-left">
              <th className="py-1 pr-2">Level</th>
              <th className="py-1 pr-2">% of students ≥</th>
              <th className="py-1">score % of marks</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-t border-slate-100">
                <td className="py-2 pr-2 font-bold text-slate-700">{r.label}</td>
                <td className="py-2 pr-2">
                  <input
                    id={`${idPrefix}-${r.key}-students`}
                    type="number"
                    min={0}
                    max={100}
                    value={goals[r.key].studentPercentThreshold}
                    onChange={(e) =>
                      set({ ...goals, [r.key]: { ...goals[r.key], studentPercentThreshold: Number(e.target.value) } })
                    }
                    className="input-field !py-1.5 !text-xs w-24"
                  />
                </td>
                <td className="py-2">
                  <input
                    id={`${idPrefix}-${r.key}-marks`}
                    type="number"
                    min={0}
                    max={100}
                    value={goals[r.key].marksPercentThreshold}
                    onChange={(e) =>
                      set({ ...goals, [r.key]: { ...goals[r.key], marksPercentThreshold: Number(e.target.value) } })
                    }
                    className="input-field !py-1.5 !text-xs w-24"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <textarea
          id={`${idPrefix}-justification`}
          rows={2}
          value={goals.justification}
          onChange={(e) => set({ ...goals, justification: e.target.value })}
          placeholder="Justification required if any"
          className="input-field !text-xs !py-2"
        />
      </div>
    );
  }

  if (!loaded) {
    return (
      <div className="glass-card p-10 flex items-center justify-center gap-3 text-sm text-slate-600">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading COA-04 settings…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <span className="badge bg-violet-50 text-violet-700 border border-violet-200">Sheet 5 · COA-04</span>
          <h2 className="mt-2 text-xl font-extrabold text-slate-900">Target Level Settings for COs</h2>
          <p className="text-xs text-slate-500 mt-1">
            Calculation base from the last 3 years and the CIA / TEE attainment goals for Levels 1–3.
          </p>
        </div>
        <button
          type="button"
          id="btn-save-coa04"
          onClick={handleSave}
          disabled={saving || errors.length > 0}
          className="btn-primary !text-xs !py-2.5"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save Target Settings
        </button>
      </div>

      {errors.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700" role="alert">
          {errors.map((e) => (
            <p key={e}>{e}</p>
          ))}
        </div>
      )}

      {/* Calculation base */}
      <div className="glass-card p-4 space-y-3">
        <p className="text-sm font-bold text-slate-800">Calculation Base · Average % of marks</p>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-slate-500 text-left">
              <th className="py-1">Academic year</th>
              <th className="py-1">CIA %</th>
              <th className="py-1">TEE %</th>
            </tr>
          </thead>
          <tbody>
            {history.map((h, i) => (
              <tr key={h.academicYear} className="border-t border-slate-100">
                <td className="py-2 font-semibold text-slate-700">{h.academicYear}</td>
                {(['ciaAvgPercent', 'teeAvgPercent'] as const).map((field) => (
                  <td key={field} className="py-2">
                    <input
                      id={`hist-${i}-${field}`}
                      type="number"
                      min={0}
                      max={100}
                      value={h[field] ?? ''}
                      onChange={(e) =>
                        setHistory(history.map((x, j) => (j === i ? { ...x, [field]: num(e.target.value) } : x)))
                      }
                      placeholder="–"
                      className="input-field !py-1.5 !text-xs w-24"
                    />
                  </td>
                ))}
              </tr>
            ))}
            <tr className="border-t-2 border-slate-200 bg-slate-50 font-bold">
              <td className="py-2 pl-1">Average (last 3 years)</td>
              <td className="py-2">
                {hasHistory ? (
                  <span data-testid="avg-cia">{avgCia}%</span>
                ) : (
                  <input
                    id="manual-cia"
                    type="number"
                    min={0}
                    max={100}
                    value={manualCia}
                    onChange={(e) => setManualCia(Number(e.target.value))}
                    className="input-field !py-1.5 !text-xs w-24"
                  />
                )}
              </td>
              <td className="py-2">
                {hasHistory ? (
                  <span data-testid="avg-tee">{avgTee}%</span>
                ) : (
                  <input
                    id="manual-tee"
                    type="number"
                    min={0}
                    max={100}
                    value={manualTee}
                    onChange={(e) => setManualTee(Number(e.target.value))}
                    className="input-field !py-1.5 !text-xs w-24"
                  />
                )}
              </td>
            </tr>
          </tbody>
        </table>
        <p className="flex items-start gap-1.5 text-[11px] text-slate-500">
          <Info className="h-3.5 w-3.5 shrink-0 mt-px" />
          Enter yearly averages to compute the 3-year benchmark automatically. Leave them blank for a new course and set the benchmark manually.
        </p>
        <textarea
          id="base-justification"
          rows={2}
          value={baseJustification}
          onChange={(e) => setBaseJustification(e.target.value)}
          placeholder="Justification required if any (e.g. course introduced for the first time)"
          className="input-field !text-xs !py-2"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {goalTable('Attainment Goal for CIA', 'cia', cia, setCia)}
        {goalTable('Attainment Goal for TEE', 'tee', tee, setTee)}
      </div>
    </div>
  );
}
