import { doc, serverTimestamp, writeBatch, collection } from 'firebase/firestore';
import { db } from '../lib/firebase';
import {
  ALLOWED_COS,
  STRENGTH_THRESHOLDS,
  TOTAL_SYLLABUS_HOURS,
  calculatePoSummary,
  isMapped,
  round2,
} from '../lib/cagsCalculations';
import type {
  CagsActionPlanDocument,
  CagsCoa04Document,
  CagsMappingDocument,
  CagsMatrix,
  CoActionPlanItem,
  CourseOutcome,
} from '../types';

export interface CagsActor {
  uid: string;
  role: 'super_admin' | 'teacher';
}

export interface SubjectScope {
  subjectId: string;
  academicYearId: string;
  classId: string;
}

// ---------------------------------------------------------------------------
// Pure builders (unit-tested; contain no undefined values so Firestore accepts them)
// ---------------------------------------------------------------------------

/** Validates a matrix before approval: only CO1–CO4 rows, levels in {1,2,3,null}. */
export function validateMatrixForApproval(
  matrix: CagsMatrix,
  cos: Pick<CourseOutcome, 'coCode'>[]
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  for (const code of Object.keys(matrix)) {
    if (!(ALLOWED_COS as readonly string[]).includes(code)) errors.push(`${code} is not allowed.`);
  }
  if (cos.length !== ALLOWED_COS.length) errors.push('CO1–CO4 must all be defined before approval.');
  let anyMapped = false;
  for (const row of Object.values(matrix)) {
    for (const [outcome, cell] of Object.entries(row.mappings)) {
      if (![1, 2, 3, null].includes(cell.level as number | null)) {
        errors.push(`Invalid level for ${outcome}.`);
      }
      if (isMapped(cell)) anyMapped = true;
    }
  }
  if (!anyMapped) errors.push('Map at least one CO to a PO/PSO before approving.');
  return { valid: errors.length === 0, errors };
}

/** Marks mapped cells as approved and unmapped cells as unmapped. */
export function finalizeMatrix(matrix: CagsMatrix): CagsMatrix {
  const out: CagsMatrix = {};
  for (const [coCode, row] of Object.entries(matrix)) {
    const mappings: CagsMatrix[string]['mappings'] = {};
    for (const [outcome, cell] of Object.entries(row.mappings)) {
      mappings[outcome] = {
        level: cell.level ?? null,
        aiSuggestedLevel: cell.aiSuggestedLevel ?? null,
        rationale: cell.rationale || '',
        status: isMapped(cell) ? 'approved' : 'unmapped',
      };
    }
    out[coCode] = { ...row, mappings };
  }
  return out;
}

export function buildMappingPayload(
  scope: SubjectScope,
  actor: CagsActor,
  matrix: CagsMatrix,
  cos: CourseOutcome[],
  opts: {
    reviewMeetingLink: string;
    reviewerNames: string[];
    status: 'draft' | 'approved';
    lastAiGenerated?: boolean;
  }
): Omit<CagsMappingDocument, 'updatedAt' | 'approvedAt' | 'lastAiGeneratedAt'> {
  const finalMatrix = opts.status === 'approved' ? finalizeMatrix(matrix) : matrix;
  const payload: Omit<CagsMappingDocument, 'updatedAt' | 'approvedAt' | 'lastAiGeneratedAt'> = {
    subjectId: scope.subjectId,
    academicYearId: scope.academicYearId,
    classId: scope.classId,
    teacherUid: actor.uid,
    totalSyllabusHours: TOTAL_SYLLABUS_HOURS,
    thresholds: { ...STRENGTH_THRESHOLDS },
    matrix: finalMatrix,
    poSummary: calculatePoSummary(finalMatrix, cos),
    reviewMeetingLink: opts.reviewMeetingLink.trim(),
    reviewerNames: opts.reviewerNames,
    cdcApproved: false,
    approvalStatus: opts.status,
  };
  if (opts.status === 'approved') payload.approvedBy = actor.uid;
  return payload;
}

export function parseReviewerNames(raw: string): string[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function buildAuditEntry(
  actor: CagsActor,
  scope: SubjectScope,
  action: string,
  targetCollection: string,
  summary: string
) {
  return {
    actorUid: actor.uid,
    actorRole: actor.role,
    action,
    targetCollection,
    targetDocumentId: scope.subjectId,
    academicYearId: scope.academicYearId,
    classId: scope.classId,
    subjectId: scope.subjectId,
    summary,
  };
}

// ---------------------------------------------------------------------------
// Firestore writes (atomic batches)
// ---------------------------------------------------------------------------

/** Gate M4-V4: approve mapping, flip dashboard checklist, and append an audit entry atomically. */
export async function approveCoPoMapping(
  scope: SubjectScope,
  actor: CagsActor,
  matrix: CagsMatrix,
  cos: CourseOutcome[],
  opts: { reviewMeetingLink: string; reviewerNames: string; hadAiSuggestions: boolean }
): Promise<void> {
  const check = validateMatrixForApproval(matrix, cos);
  if (!check.valid) throw new Error(check.errors.join(' '));

  const payload = buildMappingPayload(scope, actor, matrix, cos, {
    reviewMeetingLink: opts.reviewMeetingLink,
    reviewerNames: parseReviewerNames(opts.reviewerNames),
    status: 'approved',
  });

  const batch = writeBatch(db);
  batch.set(
    doc(db, 'cags_mappings', scope.subjectId),
    {
      ...payload,
      ...(opts.hadAiSuggestions ? { lastAiGeneratedAt: serverTimestamp() } : {}),
      approvedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
  batch.set(
    doc(db, 'subject_dashboard_stats', scope.subjectId),
    {
      subjectId: scope.subjectId,
      academicYearId: scope.academicYearId,
      classId: scope.classId,
      teacherUid: actor.uid,
      cagsCompletionChecklist: { coPoMappingApproved: true, mappingCalculationVerified: true },
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
  batch.set(doc(collection(db, 'audit_logs')), {
    ...buildAuditEntry(
      actor,
      scope,
      'CO_PO_MAPPING_APPROVED',
      'cags_mappings',
      `Approved CO–PO mapping for ${scope.subjectId}`
    ),
    timestamp: serverTimestamp(),
  });
  await batch.commit();
}

/** Saves an unapproved working copy (does not touch the dashboard checklist). */
export async function saveMappingDraft(
  scope: SubjectScope,
  actor: CagsActor,
  matrix: CagsMatrix,
  cos: CourseOutcome[],
  opts: { reviewMeetingLink: string; reviewerNames: string; hadAiSuggestions: boolean }
): Promise<void> {
  const payload = buildMappingPayload(scope, actor, matrix, cos, {
    reviewMeetingLink: opts.reviewMeetingLink,
    reviewerNames: parseReviewerNames(opts.reviewerNames),
    status: 'draft',
  });
  const batch = writeBatch(db);
  batch.set(
    doc(db, 'cags_mappings', scope.subjectId),
    {
      ...payload,
      ...(opts.hadAiSuggestions ? { lastAiGeneratedAt: serverTimestamp() } : {}),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
  await batch.commit();
}

// ---------------------------------------------------------------------------
// COA-04
// ---------------------------------------------------------------------------
export function averageOf(values: (number | null)[]): number {
  const nums = values.filter((v): v is number => typeof v === 'number' && !Number.isNaN(v));
  if (nums.length === 0) return 0;
  return round2(nums.reduce((s, n) => s + n, 0) / nums.length);
}

export function validateCoa04(doc: Pick<CagsCoa04Document, 'ciaAttainmentGoals' | 'teeAttainmentGoals'>): string[] {
  const errors: string[] = [];
  for (const [label, goals] of [
    ['CIA', doc.ciaAttainmentGoals],
    ['TEE', doc.teeAttainmentGoals],
  ] as const) {
    for (const lvl of ['level1', 'level2', 'level3'] as const) {
      const g = goals[lvl];
      for (const v of [g.studentPercentThreshold, g.marksPercentThreshold]) {
        if (typeof v !== 'number' || Number.isNaN(v) || v < 0 || v > 100) {
          errors.push(`${label} ${lvl}: percentages must be between 0 and 100.`);
          break;
        }
      }
    }
    if (
      !(
        goals.level3.studentPercentThreshold >= goals.level2.studentPercentThreshold &&
        goals.level2.studentPercentThreshold >= goals.level1.studentPercentThreshold
      )
    ) {
      errors.push(`${label}: student % thresholds must be Level 3 ≥ Level 2 ≥ Level 1.`);
    }
  }
  return errors;
}

export async function saveCoa04(
  scope: SubjectScope,
  actor: CagsActor,
  data: Omit<CagsCoa04Document, 'subjectId' | 'academicYearId' | 'classId' | 'teacherUid' | 'updatedAt' | 'updatedBy'>
): Promise<void> {
  const errors = validateCoa04(data);
  if (errors.length) throw new Error(errors[0]);
  const batch = writeBatch(db);
  batch.set(
    doc(db, 'cags_coa04', scope.subjectId),
    {
      ...data,
      subjectId: scope.subjectId,
      academicYearId: scope.academicYearId,
      classId: scope.classId,
      teacherUid: actor.uid,
      updatedBy: actor.uid,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
  batch.set(
    doc(db, 'subject_dashboard_stats', scope.subjectId),
    {
      subjectId: scope.subjectId,
      academicYearId: scope.academicYearId,
      classId: scope.classId,
      teacherUid: actor.uid,
      cagsCompletionChecklist: { coa04Configured: true },
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
  batch.set(doc(collection(db, 'audit_logs')), {
    ...buildAuditEntry(actor, scope, 'COA04_SAVED', 'cags_coa04', `Saved COA-04 settings for ${scope.subjectId}`),
    timestamp: serverTimestamp(),
  });
  await batch.commit();
}

// ---------------------------------------------------------------------------
// COs Action Plan
// ---------------------------------------------------------------------------
export function buildActionPlans(
  cos: Pick<CourseOutcome, 'id' | 'coCode' | 'description'>[],
  existing: Record<string, Partial<CoActionPlanItem>> = {}
): Record<string, CoActionPlanItem> {
  const plans: Record<string, CoActionPlanItem> = {};
  for (const co of cos) {
    if (!(ALLOWED_COS as readonly string[]).includes(co.coCode)) continue;
    const prev = existing[co.coCode] || {};
    plans[co.coCode] = {
      coId: co.id,
      coDescription: co.description,
      cayMinus1Plan: prev.cayMinus1Plan || '',
      cayPlan: prev.cayPlan || '',
      cayPlus1Plan: prev.cayPlus1Plan || '',
    };
  }
  return plans;
}

export async function saveActionPlan(
  scope: SubjectScope,
  actor: CagsActor,
  plans: Record<string, CoActionPlanItem>
): Promise<void> {
  for (const code of Object.keys(plans)) {
    if (!(ALLOWED_COS as readonly string[]).includes(code)) throw new Error(`${code} is not allowed.`);
  }
  const doc_: Omit<CagsActionPlanDocument, 'updatedAt'> = {
    subjectId: scope.subjectId,
    academicYearId: scope.academicYearId,
    classId: scope.classId,
    teacherUid: actor.uid,
    plans,
    cdcApprovalStatus: 'pending',
    updatedBy: actor.uid,
  };
  const hasContent = Object.values(plans).every((p) => p.cayPlan.trim().length > 0);
  const batch = writeBatch(db);
  batch.set(doc(db, 'cags_action_plans', scope.subjectId), { ...doc_, updatedAt: serverTimestamp() }, { merge: true });
  if (hasContent) {
    batch.set(
      doc(db, 'subject_dashboard_stats', scope.subjectId),
      {
        subjectId: scope.subjectId,
        academicYearId: scope.academicYearId,
        classId: scope.classId,
        teacherUid: actor.uid,
        cagsCompletionChecklist: { actionPlanCompleted: true },
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }
  batch.set(doc(collection(db, 'audit_logs')), {
    ...buildAuditEntry(actor, scope, 'ACTION_PLAN_SAVED', 'cags_action_plans', `Saved COs action plan for ${scope.subjectId}`),
    timestamp: serverTimestamp(),
  });
  await batch.commit();
}
