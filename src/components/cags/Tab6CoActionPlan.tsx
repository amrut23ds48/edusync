import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { Loader2, Save, Sparkles } from 'lucide-react';
import { db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { useAcademic } from '../../context/AcademicContext';
import { useCagsWorkspace } from '../../context/CagsWorkspaceContext';
import { AiUnavailableError, requestAiActionPlans } from '../../services/cagsAiService';
import { buildActionPlans, saveActionPlan } from '../../services/cagsService';
import type { CagsActionPlanDocument, CoActionPlanItem } from '../../types';

type PlanField = 'cayMinus1Plan' | 'cayPlan' | 'cayPlus1Plan';

const COLUMNS: { field: PlanField; label: string }[] = [
  { field: 'cayMinus1Plan', label: 'CAY-1 Plan' },
  { field: 'cayPlan', label: 'CAY Plan' },
  { field: 'cayPlus1Plan', label: 'CAY+1 Plan' },
];

export default function Tab6CoActionPlan() {
  const { user, isSuperAdmin } = useAuth();
  const { activeSubject } = useAcademic();
  const { subjectId, cos, cosLoading } = useCagsWorkspace();

  const [saved, setSaved] = useState<CagsActionPlanDocument | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [plans, setPlans] = useState<Record<string, CoActionPlanItem>>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    setLoaded(false);
    return onSnapshot(
      doc(db, 'cags_action_plans', subjectId),
      (snap) => {
        setSaved(snap.exists() ? (snap.data() as CagsActionPlanDocument) : null);
        setLoaded(true);
      },
      (err) => {
        console.error('[CAGS] cags_action_plans listener failed:', err);
        setLoaded(true);
      }
    );
  }, [subjectId]);

  useEffect(() => {
    if (!loaded || cosLoading) return;
    if (dirty) {
      setPlans((prev) => buildActionPlans(cos, prev));
    } else {
      setPlans(buildActionPlans(cos, saved?.plans || {}));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, cosLoading, cos, saved]);

  function update(coCode: string, field: PlanField, value: string) {
    setPlans((prev) => ({ ...prev, [coCode]: { ...prev[coCode], [field]: value } }));
    setDirty(true);
  }

  async function handleAi() {
    if (!activeSubject || aiLoading) return;
    const ready = cos.length === 4 && cos.every((c) => c.description?.trim());
    if (!ready) {
      toast.error('Define CO1–CO4 with descriptions first (Super Admin → Academic Setup).');
      return;
    }
    const hasText = Object.values(plans).some(
      (p) => p.cayPlan.trim() || p.cayMinus1Plan.trim() || p.cayPlus1Plan.trim()
    );
    if (hasText && !window.confirm('AI will draft continuous improvement text across CAY-1, CAY, and CAY+1. Overwrite existing entries?')) return;

    setAiLoading(true);
    try {
      const res = await requestAiActionPlans(
        activeSubject.courseName,
        cos.map((c) => ({ coCode: c.coCode, description: c.description, syllabusHours: c.syllabusHours }))
      );
      setPlans((prev) => {
        const next = { ...prev };
        for (const p of res.actionPlans) {
          if (next[p.coCode]) {
            next[p.coCode] = {
              ...next[p.coCode],
              cayMinus1Plan: p.cayMinus1Plan || next[p.coCode].cayMinus1Plan || '',
              cayPlan: p.cayPlan || next[p.coCode].cayPlan || '',
              cayPlus1Plan: p.cayPlus1Plan || next[p.coCode].cayPlus1Plan || '',
            };
          }
        }
        return next;
      });
      setDirty(true);
      toast.success('AI action plan drafted across CAY-1, CAY, and CAY+1. Review before saving.');
    } catch (err) {
      const reason = err instanceof AiUnavailableError ? err.message : 'unexpected error';
      toast.error(`AI suggestion unavailable: ${reason}. You can still enter values manually.`);
    } finally {
      setAiLoading(false);
    }
  }

  async function handleSave() {
    if (!activeSubject || !user) return;
    setSaving(true);
    try {
      await saveActionPlan(
        { subjectId: activeSubject.id, academicYearId: activeSubject.academicYearId, classId: activeSubject.classId },
        { uid: user.uid, role: isSuperAdmin ? 'super_admin' : 'teacher' },
        plans
      );
      setDirty(false);
      toast.success('Action plan saved.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save action plan.');
    } finally {
      setSaving(false);
    }
  }

  if (!loaded || cosLoading) {
    return (
      <div className="glass-card p-10 flex items-center justify-center gap-3 text-sm text-slate-600">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading action plan…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
        <div>
          <span className="badge bg-amber-50 text-amber-700 border border-amber-200">Sheet 6 · COs Action Plan</span>
          <h2 className="mt-2 text-xl font-extrabold text-slate-900">Action Plan for COs</h2>
          <p className="text-xs text-slate-500 mt-1">
            Continuous improvement plan per Course Outcome across CAY-1, CAY and CAY+1.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            id="btn-ai-action-plan"
            onClick={handleAi}
            disabled={aiLoading || saving}
            className="btn-secondary !text-xs !py-2.5 border-amber-300 !text-amber-800 bg-amber-50 hover:!bg-amber-100"
          >
            {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {aiLoading ? 'Drafting all cycles…' : 'Draft Action Plan with AI (CAY-1, CAY, CAY+1)'}
          </button>
          <button
            type="button"
            id="btn-save-action-plan"
            onClick={handleSave}
            disabled={saving || aiLoading || !dirty}
            className="btn-primary !text-xs !py-2.5"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Action Plan
          </button>
        </div>
      </div>

      {dirty && (
        <span className="badge bg-orange-100 text-orange-800 border border-orange-300">Unsaved changes</span>
      )}

      {cos.length === 0 ? (
        <div className="glass-card p-10 text-center text-sm text-slate-500">
          No course outcomes defined for this subject yet.
        </div>
      ) : (
        <div className="glass-card overflow-x-auto">
          <table className="min-w-full text-xs" id="action-plan-table">
            <thead>
              <tr className="bg-slate-50 text-slate-600">
                <th className="px-3 py-3 text-left w-16">CO No.</th>
                <th className="px-3 py-3 text-left min-w-[220px]">Course Outcome</th>
                {COLUMNS.map((c) => (
                  <th key={c.field} className="px-3 py-3 text-left min-w-[240px]">{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cos.map((co) => (
                <tr key={co.coCode} className="border-t border-slate-100 align-top">
                  <td className="px-3 py-3 font-mono font-bold text-brand-700">{co.coCode}</td>
                  <td className="px-3 py-3 text-slate-600 leading-snug">{co.description}</td>
                  {COLUMNS.map((c) => (
                    <td key={c.field} className="px-2 py-2">
                      <textarea
                        id={`plan-${co.coCode}-${c.field}`}
                        rows={4}
                        value={plans[co.coCode]?.[c.field] ?? ''}
                        onChange={(e) => update(co.coCode, c.field, e.target.value)}
                        className="input-field !text-xs !py-2"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
