import type {
  CagsMatrix,
  CagsMappingCell,
  CagsPoSummaryItem,
  CourseOutcome,
  MappingLevel,
  MappingStrength,
} from '../types';

export const ALLOWED_COS = ['CO1', 'CO2', 'CO3', 'CO4'] as const;
export const ALLOWED_OUTCOMES = [
  'PO1', 'PO2', 'PO3', 'PO4', 'PO5', 'PO6',
  'PO7', 'PO8', 'PO9', 'PO10', 'PO11', 'PO12',
  'PSO1', 'PSO2',
] as const;

export const TOTAL_SYLLABUS_HOURS = 39;

export const STRENGTH_THRESHOLDS = {
  highMinPercent: 70,
  moderateMinPercent: 40,
  lowMinPercent: 1,
};

export const STRENGTH_LABELS: Record<MappingStrength, string> = {
  3: 'High',
  2: 'Moderate',
  1: 'Low',
  0: 'Not Mapped',
};

/** Rounds to 2 decimals for display/storage while keeping raw value for threshold checks. */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Table B strength rubric: >=70 -> 3, 40–69.99 -> 2, 1–39.99 -> 1, 0 -> 0. */
export function deriveStrength(percent: number): MappingStrength {
  if (percent >= STRENGTH_THRESHOLDS.highMinPercent) return 3;
  if (percent >= STRENGTH_THRESHOLDS.moderateMinPercent) return 2;
  if (percent >= STRENGTH_THRESHOLDS.lowMinPercent) return 1;
  return 0;
}

/** Table A: CO hours as a percentage of total syllabus hours. */
export function coPercentOfTotal(hours: number, totalHours = TOTAL_SYLLABUS_HOURS): number {
  if (!totalHours || totalHours <= 0) return 0;
  return (hours / totalHours) * 100;
}

export function isMapped(cell?: Pick<CagsMappingCell, 'level'> | null): boolean {
  return !!cell && (cell.level === 1 || cell.level === 2 || cell.level === 3);
}

export interface TableARow {
  coCode: string;
  description: string;
  syllabusHours: number;
  percentOfTotal: number;
  mappedOutcomes: string[];
}

export interface TableAResult {
  rows: TableARow[];
  totalHours: number;
  totalPercent: number;
}

export function calculateTableA(
  cos: Pick<CourseOutcome, 'coCode' | 'description' | 'syllabusHours'>[],
  matrix: CagsMatrix = {},
  totalHours = TOTAL_SYLLABUS_HOURS
): TableAResult {
  const sorted = [...cos].sort((a, b) => a.coCode.localeCompare(b.coCode));
  const rows: TableARow[] = sorted.map((co) => {
    const mappings = matrix[co.coCode]?.mappings || {};
    const mappedOutcomes = ALLOWED_OUTCOMES.filter((o) => isMapped(mappings[o]));
    return {
      coCode: co.coCode,
      description: co.description,
      syllabusHours: co.syllabusHours,
      percentOfTotal: coPercentOfTotal(co.syllabusHours, totalHours),
      mappedOutcomes: [...mappedOutcomes],
    };
  });
  return {
    rows,
    totalHours: rows.reduce((s, r) => s + r.syllabusHours, 0),
    totalPercent: rows.reduce((s, r) => s + r.percentOfTotal, 0),
  };
}

export interface TableBRow extends CagsPoSummaryItem {
  outcomeCode: string;
}

/**
 * Table B: for each PO/PSO sum syllabus hours of COs mapped at level 1–3,
 * convert to a percentage of total syllabus hours and derive strength.
 */
export function calculatePoSummary(
  matrix: CagsMatrix,
  cos: Pick<CourseOutcome, 'coCode' | 'syllabusHours'>[],
  outcomeCodes: readonly string[] = ALLOWED_OUTCOMES,
  totalHours = TOTAL_SYLLABUS_HOURS
): Record<string, CagsPoSummaryItem> {
  const result: Record<string, CagsPoSummaryItem> = {};
  const sorted = [...cos].sort((a, b) => a.coCode.localeCompare(b.coCode));
  for (const outcome of outcomeCodes) {
    const mappedCos: string[] = [];
    let mappedHours = 0;
    for (const co of sorted) {
      const cell = matrix[co.coCode]?.mappings?.[outcome];
      if (isMapped(cell)) {
        mappedCos.push(co.coCode);
        mappedHours += co.syllabusHours;
      }
    }
    const percentageMapping = totalHours > 0 ? (mappedHours / totalHours) * 100 : 0;
    result[outcome] = {
      mappedCos,
      mappedHours,
      totalHours,
      percentageMapping: round2(percentageMapping),
      // use the raw percentage so boundaries like 39.999 aren't rounded up
      calculatedStrength: deriveStrength(percentageMapping),
    };
  }
  return result;
}

/** Formats CO list like the workbook: "CO1–CO4", "CO2, CO3", or "—". */
export function formatMappedCos(mappedCos: string[]): string {
  if (mappedCos.length === 0) return '—';
  const nums = mappedCos.map((c) => parseInt(c.replace('CO', ''), 10));
  const contiguous = nums.every((n, i) => i === 0 || n === nums[i - 1] + 1);
  if (mappedCos.length >= 3 && contiguous) {
    return `${mappedCos[0]}–${mappedCos[mappedCos.length - 1]}`;
  }
  return mappedCos.join(', ');
}

export function emptyCell(): CagsMappingCell {
  return { level: null, aiSuggestedLevel: null, rationale: '', status: 'unmapped' };
}

/** Builds a complete CO1–CO4 × 14 matrix, preserving any existing cell values. */
export function buildMatrix(
  cos: Pick<CourseOutcome, 'id' | 'coCode' | 'syllabusHours'>[],
  existing: CagsMatrix = {},
  totalHours = TOTAL_SYLLABUS_HOURS
): CagsMatrix {
  const matrix: CagsMatrix = {};
  for (const co of cos) {
    if (!(ALLOWED_COS as readonly string[]).includes(co.coCode)) continue;
    const prev = existing[co.coCode]?.mappings || {};
    const mappings: Record<string, CagsMappingCell> = {};
    for (const o of ALLOWED_OUTCOMES) {
      mappings[o] = prev[o] ? { ...prev[o] } : emptyCell();
    }
    matrix[co.coCode] = {
      coId: co.id,
      syllabusHours: co.syllabusHours,
      percentageOfTotalHours: round2(coPercentOfTotal(co.syllabusHours, totalHours)),
      mappings,
    };
  }
  return matrix;
}

/** Gate M4-V1: CO1–CO4 only, positive hours, sum equals total syllabus hours. */
export function validateCourseOutcomes(
  cos: { coCode: string; syllabusHours: number; description?: string }[],
  totalHours = TOTAL_SYLLABUS_HOURS
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  for (const co of cos) {
    if (!(ALLOWED_COS as readonly string[]).includes(co.coCode)) {
      errors.push(`${co.coCode} is not allowed. Only CO1–CO4 are supported.`);
    }
    if (!(co.syllabusHours > 0)) errors.push(`${co.coCode} must have syllabus hours greater than 0.`);
  }
  const codes = new Set(cos.map((c) => c.coCode));
  for (const required of ALLOWED_COS) {
    if (!codes.has(required)) errors.push(`${required} is missing.`);
  }
  const sum = cos.reduce((s, c) => s + (Number(c.syllabusHours) || 0), 0);
  if (sum !== totalHours) errors.push(`Syllabus hours sum to ${sum}, expected ${totalHours}.`);
  return { valid: errors.length === 0, errors };
}

export function levelLabel(level: MappingLevel): string {
  return level === 3 ? 'High' : level === 2 ? 'Moderate' : level === 1 ? 'Low' : 'Not mapped';
}

export const OUTCOME_PRIORITY_ORDER = [
  'PO1', 'PO2', 'PO3', 'PO4', 'PO5', 'PO12',
  'PSO1', 'PSO2', 'PO10', 'PO9', 'PO11', 'PO6', 'PO8', 'PO7',
] as const;

export const OUTCOME_DEFAULT_MAPPING: Record<string, { level: 1 | 2 | 3; rationale: string }> = {
  PO1: { level: 3, rationale: 'Applies foundational engineering and mathematical models to core concepts.' },
  PO2: { level: 3, rationale: 'Formulates and analyzes complex problem structures using first principles.' },
  PO3: { level: 2, rationale: 'Designs algorithmic solutions and structured processes for problem domain.' },
  PO4: { level: 2, rationale: 'Investigates complex scenarios through simulation and analytical evaluation.' },
  PO5: { level: 2, rationale: 'Employs computational modeling techniques and modern analytical tools.' },
  PO6: { level: 1, rationale: 'Considers contextual societal and domain implications of technical solutions.' },
  PO7: { level: 1, rationale: 'Considers sustainability and resource efficiency in algorithmic computing.' },
  PO8: { level: 1, rationale: 'Follows academic integrity and ethical professional norms in modeling.' },
  PO9: { level: 1, rationale: 'Fosters collaborative problem solving through team tutorials and peer reviews.' },
  PO10: { level: 2, rationale: 'Communicates technical formulations effectively through structured writeups.' },
  PO11: { level: 1, rationale: 'Applies basic project planning and milestone tracking in tutorial exercises.' },
  PO12: { level: 2, rationale: 'Prepares students for lifelong continuous learning in evolving tech domains.' },
  PSO1: { level: 3, rationale: 'Directly applies data-centric modeling and analytical formulation.' },
  PSO2: { level: 2, rationale: 'Contributes to design and deployment of intelligent algorithmic systems.' },
};

/**
 * Guarantees that at least minPercent (default 0.8, i.e. 12 of 14 = 85.7%) of cells
 * are filled for every Course Outcome. If AI or manual input left too many unmapped,
 * the remaining high-priority outcomes are populated with valid correlation levels.
 */
export function enforceMinimumMappingCoverage(matrix: CagsMatrix, minPercent = 0.8): CagsMatrix {
  const targetCount = Math.ceil(ALLOWED_OUTCOMES.length * minPercent); // 12 of 14 = 85.7%
  const updated: CagsMatrix = {};

  for (const [coCode, row] of Object.entries(matrix)) {
    const mappings = { ...row.mappings };
    let mappedCount = Object.values(mappings).filter((c) => isMapped(c)).length;

    if (mappedCount < targetCount) {
      for (const outcome of OUTCOME_PRIORITY_ORDER) {
        if (mappedCount >= targetCount) break;
        const current = mappings[outcome];
        if (!isMapped(current)) {
          const fallback = OUTCOME_DEFAULT_MAPPING[outcome] || { level: 2, rationale: 'Addresses curriculum outcome competency.' };
          mappings[outcome] = {
            level: fallback.level,
            aiSuggestedLevel: fallback.level,
            rationale: current?.rationale?.trim() || fallback.rationale,
            status: 'suggested',
          };
          mappedCount++;
        }
      }
    }

    updated[coCode] = {
      ...row,
      mappings,
    };
  }

  return updated;
}

// ---------------------------------------------------------------------------
// Milestone 5: Lecture Attendance & Monthly Reporting Calculations
// ---------------------------------------------------------------------------

export interface TimetableSlotLike {
  dayOfWeek: number;
  effectiveFrom: string;
  effectiveTo: string;
  status: string;
}

/**
 * Counts the scheduled lecture slots in a month based on active timetable entries.
 * Skips Sundays (dayOfWeek === 0).
 */
export function countScheduledLecturesInMonth(
  timetableSlots: TimetableSlotLike[],
  monthKey: string // "YYYY-MM"
): number {
  if (!monthKey || !/^\d{4}-\d{2}$/.test(monthKey)) return 0;
  const [yearStr, monthStr] = monthKey.split('-');
  const year = Number(yearStr);
  const monthIndex = Number(monthStr) - 1; // 0-indexed for JS Date
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

  let scheduledCount = 0;

  for (let day = 1; day <= daysInMonth; day++) {
    const dateObj = new Date(year, monthIndex, day);
    const isoDate = `${monthKey}-${String(day).padStart(2, '0')}`;
    const jsDay = dateObj.getDay(); // 0 = Sun, 1 = Mon ... 6 = Sat
    if (jsDay === 0) continue; // Skip Sundays

    for (const slot of timetableSlots) {
      if (
        slot.status === 'active' &&
        slot.dayOfWeek === jsDay &&
        isoDate >= slot.effectiveFrom &&
        isoDate <= slot.effectiveTo
      ) {
        scheduledCount++;
      }
    }
  }
  return scheduledCount;
}

export interface SessionMetrics {
  presentCount: number;
  absentCount: number;
  attendancePercent: number;
}

/**
 * Computes single lecture session attendance metrics.
 */
export function computeSessionAttendanceMetrics(
  records: Record<string, 'P' | 'A'>,
  totalStudents: number,
  isCompleted: boolean = true
): SessionMetrics {
  if (!isCompleted || totalStudents <= 0) {
    return { presentCount: 0, absentCount: 0, attendancePercent: 0 };
  }
  const presentCount = Object.values(records).filter((v) => v === 'P').length;
  const absentCount = Math.max(0, totalStudents - presentCount);
  const attendancePercent = Number(((presentCount / totalStudents) * 100).toFixed(1));
  return { presentCount, absentCount, attendancePercent };
}

export interface StudentAttendanceSummary {
  attended: number;
  conducted: number;
  percent: number;
}

export interface AttendanceSessionLike {
  status: string;
  records?: Record<string, 'P' | 'A'>;
}

/**
 * Computes student-wise attendance records and percentages across completed sessions.
 */
export function computeStudentAttendanceMap(
  sessions: AttendanceSessionLike[],
  activeStudentRollNos: string[]
): Record<string, StudentAttendanceSummary> {
  const completedSessions = sessions.filter((s) => s.status === 'completed');
  const conducted = completedSessions.length;
  const summary: Record<string, StudentAttendanceSummary> = {};

  for (const rollNo of activeStudentRollNos) {
    if (conducted === 0) {
      summary[rollNo] = { attended: 0, conducted: 0, percent: 0 };
      continue;
    }
    let attended = 0;
    for (const s of completedSessions) {
      if (s.records && s.records[rollNo] === 'P') {
        attended++;
      }
    }
    const percent = Number(((attended / conducted) * 100).toFixed(2));
    summary[rollNo] = { attended, conducted, percent };
  }

  return summary;
}

export interface ThresholdCounters {
  studentsBelow50Percent: number; // strictly < 50.0%
  studentsAbove60Percent: number; // strictly > 60.0%
}

/**
 * Computes defaulters (< 50%) and satisfactory (> 60%) counts from student summary map.
 */
export function computeDefaultersAndSatisfactory(
  studentMap: Record<string, { percent: number }>
): ThresholdCounters {
  let studentsBelow50Percent = 0;
  let studentsAbove60Percent = 0;

  for (const student of Object.values(studentMap)) {
    if (student.percent < 50.0) {
      studentsBelow50Percent++;
    }
    if (student.percent > 60.0) {
      studentsAbove60Percent++;
    }
  }

  return { studentsBelow50Percent, studentsAbove60Percent };
}

/**
 * Computes average attendance percentage across all enrolled students and completed sessions.
 */
export function computeAverageAttendancePercent(
  studentMap: Record<string, { attended: number }>,
  totalStudents: number,
  conductedSessions: number
): number {
  if (totalStudents <= 0 || conductedSessions <= 0) return 0;
  const totalAttended = Object.values(studentMap).reduce((sum, s) => sum + s.attended, 0);
  const totalPossible = totalStudents * conductedSessions;
  return Number(((totalAttended / totalPossible) * 100).toFixed(1));
}

/**
 * Formats "YYYY-MM" into a readable month label like "August 2026".
 */
export function formatMonthLabel(monthKey: string): string {
  if (!monthKey || !/^\d{4}-\d{2}$/.test(monthKey)) return monthKey || '';
  const [yearStr, monthStr] = monthKey.split('-');
  const year = Number(yearStr);
  const monthIndex = Number(monthStr) - 1;
  const date = new Date(year, monthIndex, 1);
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}


