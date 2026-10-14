import { Loader2 } from 'lucide-react';
import { useCagsWorkspace } from '../../context/CagsWorkspaceContext';
import {
  ALLOWED_OUTCOMES,
  STRENGTH_LABELS,
  formatMappedCos,
  round2,
} from '../../lib/cagsCalculations';
import type { MappingStrength } from '../../types';

const STRENGTH_STYLE: Record<MappingStrength, string> = {
  3: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  2: 'bg-sky-100 text-sky-800 border-sky-300',
  1: 'bg-slate-100 text-slate-700 border-slate-300',
  0: 'bg-white text-slate-400 border-slate-200',
};

export default function Tab4MappingCalc() {
  const { cos, cosLoading, tableA, poSummary, dirty, savedMapping } = useCagsWorkspace();

  if (cosLoading) {
    return (
      <div className="glass-card p-10 flex items-center justify-center gap-3 text-sm text-slate-600">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading calculations…
      </div>
    );
  }

  const hoursOk = tableA.totalHours === 39;

  return (
    <div className="space-y-6">
      <div>
        <span className="badge bg-cyan-50 text-cyan-700 border border-cyan-200">Sheet 4 · Mapping Calculation</span>
        <h2 className="mt-2 text-xl font-extrabold text-slate-900">Mapping Calculations</h2>
        <p className="text-xs text-slate-500 mt-1">
          Computed live from the Sheet 3 matrix
          {dirty ? ' (including unsaved edits).' : savedMapping?.approvalStatus === 'approved' ? ' (approved mapping).' : '.'}
        </p>
      </div>

      {/* Table A */}
      <div className="glass-card overflow-x-auto">
        <div className="px-4 pt-4 text-sm font-bold text-slate-800">Table A · Course Outcome hours</div>
        <table className="min-w-full text-xs mt-2" id="table-a">
          <thead>
            <tr className="bg-slate-50 text-slate-600">
              <th className="px-3 py-2.5 text-left">CO</th>
              <th className="px-3 py-2.5 text-left">Course Outcome</th>
              <th className="px-3 py-2.5 text-center">Hours (syllabus)</th>
              <th className="px-3 py-2.5 text-center">% of 39 hrs</th>
              <th className="px-3 py-2.5 text-left">Mapped PO/PSO</th>
            </tr>
          </thead>
          <tbody>
            {tableA.rows.map((r) => (
              <tr key={r.coCode} className="border-t border-slate-100 align-top">
                <td className="px-3 py-2.5 font-mono font-bold text-brand-700">{r.coCode}</td>
                <td className="px-3 py-2.5 text-slate-600 max-w-md">{r.description}</td>
                <td className="px-3 py-2.5 text-center font-semibold">{r.syllabusHours}</td>
                <td className="px-3 py-2.5 text-center">{round2(r.percentOfTotal)}%</td>
                <td className="px-3 py-2.5 text-slate-700">{r.mappedOutcomes.length ? r.mappedOutcomes.join(', ') : '—'}</td>
              </tr>
            ))}
            {cos.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">No course outcomes defined yet.</td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-200 bg-slate-50 font-bold">
              <td className="px-3 py-2.5" colSpan={2}>Total</td>
              <td className={`px-3 py-2.5 text-center ${hoursOk ? 'text-emerald-700' : 'text-red-600'}`} data-testid="table-a-total-hours">
                {tableA.totalHours}
              </td>
              <td className="px-3 py-2.5 text-center">{round2(tableA.totalPercent)}%</td>
              <td className="px-3 py-2.5 text-xs font-medium">
                {hoursOk ? <span className="text-emerald-700">Matches 39 hrs ✓</span> : <span className="text-red-600">Expected 39 hrs</span>}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Table B */}
      <div className="glass-card overflow-x-auto">
        <div className="px-4 pt-4 text-sm font-bold text-slate-800">Table B · PO / PSO mapping strength</div>
        <table className="min-w-full text-xs mt-2" id="table-b">
          <thead>
            <tr className="bg-slate-50 text-slate-600">
              <th className="px-3 py-2.5 text-left">PO / PSO</th>
              <th className="px-3 py-2.5 text-left">Mapped CO</th>
              <th className="px-3 py-2.5 text-center">Mapped hours</th>
              <th className="px-3 py-2.5 text-center">Total hours</th>
              <th className="px-3 py-2.5 text-center">% mapping</th>
              <th className="px-3 py-2.5 text-center">Mapping strength</th>
            </tr>
          </thead>
          <tbody>
            {ALLOWED_OUTCOMES.map((o) => {
              const s = poSummary[o];
              if (!s) return null;
              return (
                <tr key={o} className="border-t border-slate-100" data-testid={`row-${o}`}>
                  <td className="px-3 py-2 font-mono font-bold text-slate-800">{o}</td>
                  <td className="px-3 py-2 text-slate-700">{formatMappedCos(s.mappedCos)}</td>
                  <td className="px-3 py-2 text-center">{s.mappedHours}</td>
                  <td className="px-3 py-2 text-center">{s.totalHours}</td>
                  <td className="px-3 py-2 text-center">{s.percentageMapping}%</td>
                  <td className="px-3 py-2 text-center">
                    <span
                      data-testid={`strength-${o}`}
                      className={`inline-flex min-w-[88px] justify-center rounded-full border px-2 py-0.5 font-bold ${STRENGTH_STYLE[s.calculatedStrength]}`}
                    >
                      {s.calculatedStrength === 0 ? 'Not Mapped' : `${s.calculatedStrength} · ${STRENGTH_LABELS[s.calculatedStrength]}`}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Rubric */}
      <div className="glass-card p-4 text-xs text-slate-600">
        <p className="font-bold text-slate-800 mb-1">Mapping Strength Criteria</p>
        <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-0.5">
          <li><b>High (3):</b> ≥ 70%</li>
          <li><b>Moderate (2):</b> 40–69.9%</li>
          <li><b>Low (1):</b> 1–39.9%</li>
          <li><b>Not Mapped:</b> 0%</li>
        </ul>
      </div>
    </div>
  );
}
