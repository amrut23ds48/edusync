import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  AlertTriangle,
  BadgeCheck,
  CheckCircle2,
  ExternalLink,
  Loader2,
  QrCode,
  Save,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useAcademic } from '../../context/AcademicContext';
import { useCagsWorkspace } from '../../context/CagsWorkspaceContext';
import {
  ALLOWED_OUTCOMES,
  buildMatrix,
  enforceMinimumMappingCoverage,
  isMapped,
  levelLabel,
  validateCourseOutcomes,
} from '../../lib/cagsCalculations';
import { requestAiCoPoMapping, AiUnavailableError } from '../../services/cagsAiService';
import { approveCoPoMapping, saveMappingDraft } from '../../services/cagsService';
import type { MappingLevel } from '../../types';

const LEVEL_STYLE: Record<string, string> = {
  '3': 'bg-emerald-50 text-emerald-800 border-emerald-300',
  '2': 'bg-sky-50 text-sky-800 border-sky-300',
  '1': 'bg-slate-100 text-slate-700 border-slate-300',
  '': 'bg-white text-slate-300 border-slate-200',
};

export default function Tab3CoPoMapping() {
  const { user, isSuperAdmin } = useAuth();
  const { activeSubject } = useAcademic();
  const {
    subjectId,
    cos,
    cosLoading,
    outcomes,
    savedMapping,
    matrix,
    setCellLevel,
    setCellRationale,
    replaceMatrix,
    reviewMeetingLink,
    setReviewMeetingLink,
    reviewerNames,
    setReviewerNames,
    dirty,
    markClean,
  } = useCagsWorkspace();

  const [aiLoading, setAiLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<{ co: string; outcome: string } | null>(null);

  const coCheck = useMemo(() => validateCourseOutcomes(cos), [cos]);
  const missingDescriptions = cos.some((c) => !c.description?.trim());
  const prerequisitesMet = coCheck.valid && !missingDescriptions;

  const hasSuggestions = useMemo(
    () => Object.values(matrix).some((r) => Object.values(r.mappings).some((c) => c.status === 'suggested')),
    [matrix]
  );
  const everAiGenerated = hasSuggestions || !!savedMapping?.lastAiGeneratedAt;
  const hasAnyMapped = useMemo(
    () => Object.values(matrix).some((r) => Object.values(r.mappings).some((c) => isMapped(c))),
    [matrix]
  );

  const scope =
    activeSubject && user
      ? { subjectId, academicYearId: activeSubject.academicYearId, classId: activeSubject.classId }
      : null;
  const actor = user ? { uid: user.uid, role: isSuperAdmin ? ('super_admin' as const) : ('teacher' as const) } : null;

  async function handleAutoMap() {
    if (!activeSubject || aiLoading) return;
    if (!prerequisitesMet) {
      toast.error('Define CO1–CO4 with descriptions and 39 total hours first (Super Admin → Academic Setup).');
      return;
    }
    if (hasAnyMapped && !window.confirm('AI suggestions will replace the current matrix values. Continue?')) return;

    setAiLoading(true);
    const t0 = performance.now();
    try {
      const res = await requestAiCoPoMapping(
        activeSubject.courseName,
        activeSubject.courseCode,
        cos.map((c) => ({ coCode: c.coCode, description: c.description, syllabusHours: c.syllabusHours })),
        outcomes
      );
      let next = buildMatrix(cos);
      for (const row of res.courseMappings) {
        const target = next[row.coCode];
        if (!target) continue;
        for (const m of row.mappings) {
          if (m.level === null) continue;
          target.mappings[m.outcomeCode] = {
            level: m.level,
            aiSuggestedLevel: m.level,
            rationale: m.rationale,
            status: 'suggested',
          };
        }
      }
      // Guarantees at least 80% (12 of 14) cells are filled per CO row
      next = enforceMinimumMappingCoverage(next, 0.8);
      replaceMatrix(next);
      toast.success(`AI suggestions applied in ${((performance.now() - t0) / 1000).toFixed(1)}s (≥80% cells filled). Review and approve.`);
    } catch (err) {
      const reason = err instanceof AiUnavailableError ? err.message : 'unexpected error';
      const fallback = enforceMinimumMappingCoverage(buildMatrix(cos, matrix), 0.8);
      replaceMatrix(fallback);
      toast.error(`AI unavailable (${reason}). Applied curriculum benchmark mapping (≥80% filled).`);
    } finally {
      setAiLoading(false);
    }
  }

  async function handleSaveDraft() {
    if (!scope || !actor) return;
    setSaving(true);
    try {
      await saveMappingDraft(scope, actor, matrix, cos, {
        reviewMeetingLink,
        reviewerNames,
        hadAiSuggestions: everAiGenerated,
      });
      markClean();
      toast.success('Draft saved.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save draft.');
    } finally {
      setSaving(false);
    }
  }

  async function handleApprove() {
    if (!scope || !actor) return;
    if (!prerequisitesMet) {
      toast.error('CO1–CO4 must be defined with hours summing to 39 before approval.');
      return;
    }
    setSaving(true);
    try {
      await approveCoPoMapping(scope, actor, matrix, cos, {
        reviewMeetingLink,
        reviewerNames,
        hadAiSuggestions: everAiGenerated,
      });
      markClean();
      toast.success('CO–PO mapping approved and saved.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to approve mapping.');
    } finally {
      setSaving(false);
    }
  }

  const selectedCell = selected ? matrix[selected.co]?.mappings[selected.outcome] : null;
  const selectedOutcomeDesc = selected ? outcomes.find((o) => o.id === selected.outcome)?.description : '';
  const qrUrl = reviewMeetingLink.trim()
    ? `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(reviewMeetingLink.trim())}`
    : '';
  const approved = savedMapping?.approvalStatus === 'approved' && !dirty;

  if (cosLoading) {
    return (
      <div className="glass-card p-10 flex items-center justify-center gap-3 text-sm text-slate-600">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading course outcomes…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div>
          <span className="badge bg-indigo-50 text-indigo-700 border border-indigo-200">Sheet 3 · Course Articulation Matrix</span>
          <h2 className="mt-2 text-xl font-extrabold text-slate-900">CO–PO / PSO Mapping</h2>
          <p className="text-xs text-slate-500 mt-1">
            Levels: 3 = High · 2 = Moderate · 1 = Low · – = Not mapped. Strengths in Sheet 4 update live as you edit.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            id="btn-ai-auto-map"
            onClick={handleAutoMap}
            disabled={aiLoading || saving}
            className="btn-secondary !text-xs !py-2.5 border-amber-300 !text-amber-800 bg-amber-50 hover:!bg-amber-100"
          >
            {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {aiLoading ? 'Mapping with AI…' : 'Auto-Map with AI'}
          </button>
          <button
            type="button"
            id="btn-save-mapping-draft"
            onClick={handleSaveDraft}
            disabled={saving || aiLoading || !dirty}
            className="btn-secondary !text-xs !py-2.5"
          >
            <Save className="h-4 w-4" /> Save Draft
          </button>
          <button
            type="button"
            id="btn-approve-mapping"
            onClick={handleApprove}
            disabled={saving || aiLoading || !hasAnyMapped}
            className="btn-primary !text-xs !py-2.5"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <BadgeCheck className="h-4 w-4" />}
            Approve &amp; Save Mapping
          </button>
        </div>
      </div>

      {/* Status banners */}
      {!prerequisitesMet && (
        <div className="flex gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-900">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <div>
            <p className="font-bold">Course outcomes are not ready</p>
            <ul className="list-disc pl-4 mt-1 space-y-0.5">
              {coCheck.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
              {missingDescriptions && <li>Every CO needs a description.</li>}
            </ul>
            <p className="mt-1">Ask the Super Admin to define them under Academic Setup → Subjects → Course Outcomes.</p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 text-xs">
        {approved ? (
          <span className="badge bg-emerald-100 text-emerald-800 border border-emerald-300">
            <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approved
          </span>
        ) : (
          <span className="badge bg-slate-100 text-slate-700 border border-slate-300">
            {savedMapping ? 'Draft' : 'Not yet saved'}
          </span>
        )}
        {dirty && <span className="badge bg-orange-100 text-orange-800 border border-orange-300">Unsaved changes</span>}
        {hasSuggestions && (
          <span className="badge bg-amber-100 text-amber-800 border border-amber-300">
            AI Suggestion — Pending Review
          </span>
        )}
      </div>

      {/* Matrix */}
      <div className="glass-card overflow-x-auto">
        <table className="min-w-full text-xs" id="co-po-matrix">
          <thead>
            <tr className="bg-slate-50 text-slate-600">
              <th className="px-3 py-3 text-left font-bold sticky left-0 bg-slate-50 z-10 min-w-[260px]">Course Outcome</th>
              <th className="px-2 py-3 text-center font-bold">Hrs</th>
              {ALLOWED_OUTCOMES.map((o) => (
                <th
                  key={o}
                  title={outcomes.find((x) => x.id === o)?.description || o}
                  className="px-1.5 py-3 text-center font-bold font-mono"
                >
                  {o}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cos.length === 0 && (
              <tr>
                <td colSpan={16} className="px-4 py-10 text-center text-slate-500">
                  No course outcomes defined for this subject yet.
                </td>
              </tr>
            )}
            {cos.map((co) => (
              <tr key={co.coCode} className="border-t border-slate-100 align-top">
                <td className="px-3 py-3 sticky left-0 bg-white z-10">
                  <span className="font-mono font-bold text-brand-700">{co.coCode}</span>
                  <p className="text-slate-600 mt-0.5 leading-snug">{co.description}</p>
                </td>
                <td className="px-2 py-3 text-center font-semibold text-slate-700">{co.syllabusHours}</td>
                {ALLOWED_OUTCOMES.map((o) => {
                  const cell = matrix[co.coCode]?.mappings[o];
                  const level = cell?.level ?? null;
                  const suggested = cell?.status === 'suggested';
                  const isSel = selected?.co === co.coCode && selected.outcome === o;
                  return (
                    <td key={o} className="px-1 py-2 text-center">
                      <div className="relative inline-block">
                        <select
                          aria-label={`${co.coCode} ${o}`}
                          data-testid={`cell-${co.coCode}-${o}`}
                          value={level ?? ''}
                          title={cell?.rationale || levelLabel(level)}
                          onFocus={() => setSelected({ co: co.coCode, outcome: o })}
                          onChange={(e) => {
                            const v = e.target.value;
                            setCellLevel(co.coCode, o, v === '' ? null : (Number(v) as MappingLevel));
                          }}
                          className={`h-8 w-10 rounded-lg border text-center text-xs font-bold outline-none cursor-pointer appearance-none ${
                            LEVEL_STYLE[String(level ?? '')]
                          } ${suggested ? 'ring-2 ring-amber-400' : ''} ${isSel ? 'outline outline-2 outline-brand-500' : ''}`}
                        >
                          <option value="">–</option>
                          <option value="1">1</option>
                          <option value="2">2</option>
                          <option value="3">3</option>
                        </select>
                        {suggested && (
                          <span
                            className="absolute -top-2 -right-2 rounded-full bg-amber-400 px-1 text-[8px] font-extrabold text-amber-950 pointer-events-none"
                            title="AI Suggestion — Pending Review"
                          >
                            AI
                          </span>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Selected cell detail / rationale */}
      <div className="glass-card p-4">
        {selected && selectedCell ? (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-mono font-bold text-brand-700">{selected.co}</span>
              <span className="text-slate-400">×</span>
              <span className="font-mono font-bold text-slate-800">{selected.outcome}</span>
              <span className="badge bg-slate-100 text-slate-700 border border-slate-200">
                {levelLabel(selectedCell.level)}
              </span>
              {selectedCell.status === 'suggested' && (
                <span className="badge bg-amber-100 text-amber-800 border border-amber-300">AI Suggestion</span>
              )}
            </div>
            {selectedOutcomeDesc && <p className="text-xs text-slate-500">{selectedOutcomeDesc}</p>}
            <label className="block text-xs font-semibold text-slate-700" htmlFor="cell-rationale">
              Rationale
            </label>
            <textarea
              id="cell-rationale"
              rows={2}
              maxLength={250}
              value={selectedCell.rationale}
              onChange={(e) => setCellRationale(selected.co, selected.outcome, e.target.value)}
              placeholder="Optional justification for this mapping"
              className="input-field !text-xs !py-2"
            />
          </div>
        ) : (
          <p className="text-xs text-slate-500">Select any cell to view or edit its rationale.</p>
        )}
      </div>

      {/* Review meeting / QR */}
      <div className="glass-card p-4 grid gap-4 md:grid-cols-[1fr_auto]">
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
            <QrCode className="h-4 w-4 text-brand-600" /> Review Meeting MoM / Recording Link
          </div>
          <input
            id="review-meeting-link"
            type="url"
            value={reviewMeetingLink}
            onChange={(e) => setReviewMeetingLink(e.target.value)}
            placeholder="https://drive.google.com/…"
            className="input-field !text-xs !py-2.5"
          />
          <input
            id="reviewer-names"
            type="text"
            value={reviewerNames}
            onChange={(e) => setReviewerNames(e.target.value)}
            placeholder="Names of reviewers (comma separated)"
            className="input-field !text-xs !py-2.5"
          />
          {qrUrl && (
            <a href={reviewMeetingLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-brand-700 font-semibold">
              Open link <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
        <div className="flex items-center justify-center h-[150px] w-[150px] rounded-xl border border-dashed border-slate-300 bg-white">
          {qrUrl ? (
            <img src={qrUrl} alt="Review meeting QR code" className="h-[150px] w-[150px]" />
          ) : (
            <span className="text-[11px] text-slate-400 text-center px-3">QR Code will appear here</span>
          )}
        </div>
      </div>
    </div>
  );
}
