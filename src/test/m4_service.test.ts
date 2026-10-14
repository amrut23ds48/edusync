import { describe, it, expect } from 'vitest';
import {
  buildMappingPayload,
  validateMatrixForApproval,
  finalizeMatrix,
  buildAuditEntry,
  parseReviewerNames,
  averageOf,
  validateCoa04,
  buildActionPlans,
} from '../services/cagsService';
import { buildMatrix } from '../lib/cagsCalculations';
import type { AttainmentGoals, CourseOutcome } from '../types';

const cos: CourseOutcome[] = [
  { id: 's_CO1', coCode: 'CO1', coNumber: 1, description: 'd1', syllabusHours: 7 },
  { id: 's_CO2', coCode: 'CO2', coNumber: 2, description: 'd2', syllabusHours: 10 },
  { id: 's_CO3', coCode: 'CO3', coNumber: 3, description: 'd3', syllabusHours: 12 },
  { id: 's_CO4', coCode: 'CO4', coNumber: 4, description: 'd4', syllabusHours: 10 },
].map((c) => ({ ...c, academicYearId: 'ay', classId: 'cl', subjectId: 's', status: 'active' as const })) as CourseOutcome[];

const scope = { subjectId: 's', academicYearId: 'ay', classId: 'cl' };
const actor = { uid: 'u1', role: 'teacher' as const };

describe('M4-V4 approve & save payload', () => {
  it('rejects approval with an empty matrix or CO5', () => {
    const empty = buildMatrix(cos);
    expect(validateMatrixForApproval(empty, cos).valid).toBe(false);
    const withCo5 = { ...empty, CO5: empty.CO1 };
    expect(validateMatrixForApproval(withCo5, cos).errors.join(' ')).toMatch(/CO5/);
  });

  it('builds an approved payload with poSummary, thresholds and no undefined values', () => {
    const m = buildMatrix(cos);
    m.CO1.mappings.PO1 = { level: 3, aiSuggestedLevel: 3, rationale: 'core', status: 'suggested' };
    m.CO2.mappings.PO1 = { level: 2, aiSuggestedLevel: null, rationale: '', status: 'approved' };
    expect(validateMatrixForApproval(m, cos).valid).toBe(true);

    const p = buildMappingPayload(scope, actor, m, cos, {
      reviewMeetingLink: ' https://x.y ',
      reviewerNames: parseReviewerNames('A, B ,, C'),
      status: 'approved',
    });
    expect(p.approvalStatus).toBe('approved');
    expect(p.approvedBy).toBe('u1');
    expect(p.totalSyllabusHours).toBe(39);
    expect(p.thresholds).toEqual({ highMinPercent: 70, moderateMinPercent: 40, lowMinPercent: 1 });
    expect(p.reviewerNames).toEqual(['A', 'B', 'C']);
    expect(p.reviewMeetingLink).toBe('https://x.y');
    expect(p.matrix.CO1.mappings.PO1.status).toBe('approved'); // AI suggestion confirmed
    expect(p.matrix.CO1.mappings.PO2.status).toBe('unmapped');
    expect(p.poSummary.PO1).toMatchObject({ mappedCos: ['CO1', 'CO2'], mappedHours: 17, percentageMapping: 43.59, calculatedStrength: 2 });
    expect(JSON.stringify(p)).not.toContain('undefined');
  });

  it('draft payloads carry no approvedBy', () => {
    const p = buildMappingPayload(scope, actor, buildMatrix(cos), cos, {
      reviewMeetingLink: '',
      reviewerNames: [],
      status: 'draft',
    });
    expect(p.approvalStatus).toBe('draft');
    expect('approvedBy' in p).toBe(false);
  });

  it('finalizeMatrix does not mutate its input', () => {
    const m = buildMatrix(cos);
    m.CO1.mappings.PO1 = { level: 1, aiSuggestedLevel: 1, rationale: '', status: 'suggested' };
    finalizeMatrix(m);
    expect(m.CO1.mappings.PO1.status).toBe('suggested');
  });

  it('audit entry includes fields required by the security rules', () => {
    const a = buildAuditEntry(actor, scope, 'CO_PO_MAPPING_APPROVED', 'cags_mappings', 'x');
    expect(a).toMatchObject({ actorUid: 'u1', actorRole: 'teacher', action: 'CO_PO_MAPPING_APPROVED', subjectId: 's' });
  });
});

describe('M4-V5 COA-04 & action plan', () => {
  const goals = (s3: number, s2: number, s1: number, marks: number): AttainmentGoals => ({
    level3: { studentPercentThreshold: s3, marksPercentThreshold: marks },
    level2: { studentPercentThreshold: s2, marksPercentThreshold: marks },
    level1: { studentPercentThreshold: s1, marksPercentThreshold: marks },
    justification: '',
  });

  it('averages ignore blanks and return 0 when empty', () => {
    expect(averageOf([60, null, 70])).toBe(65);
    expect(averageOf([null, null])).toBe(0);
  });

  it('accepts workbook defaults and rejects bad thresholds', () => {
    expect(validateCoa04({ ciaAttainmentGoals: goals(60, 50, 40, 60), teeAttainmentGoals: goals(60, 50, 40, 55) })).toEqual([]);
    expect(validateCoa04({ ciaAttainmentGoals: goals(40, 50, 60, 60), teeAttainmentGoals: goals(60, 50, 40, 55) }).length).toBeGreaterThan(0);
    expect(validateCoa04({ ciaAttainmentGoals: goals(60, 50, 40, 120), teeAttainmentGoals: goals(60, 50, 40, 55) }).length).toBeGreaterThan(0);
  });

  it('builds action plans for CO1–CO4 preserving existing text', () => {
    const plans = buildActionPlans(cos, { CO1: { cayPlan: 'Keep me' } });
    expect(Object.keys(plans)).toEqual(['CO1', 'CO2', 'CO3', 'CO4']);
    expect(plans.CO1.cayPlan).toBe('Keep me');
    expect(plans.CO2).toMatchObject({ cayMinus1Plan: '', cayPlan: '', cayPlus1Plan: '', coId: 's_CO2' });
  });
});
