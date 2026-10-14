import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  writeBatch,
  serverTimestamp,
  updateDoc,
  setDoc,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type {
  AttendanceSession,
  MonthlyReportDocument,
  SubjectDashboardStats,
  LectureMode,
  MappedCoOption,
  UserRole,
} from '../types';

import {
  countScheduledLecturesInMonth,
  computeSessionAttendanceMetrics,
  computeStudentAttendanceMap,
  computeDefaultersAndSatisfactory,
  computeAverageAttendancePercent,
  formatMonthLabel,
} from '../lib/cagsCalculations';

export const ATTENDANCE_SESSIONS_COLLECTION = 'attendance_sessions';
export const MONTHLY_REPORTS_COLLECTION = 'monthly_reports';
export const DASHBOARD_STATS_COLLECTION = 'subject_dashboard_stats';

export interface SaveAttendanceParams {
  academicYearId: string;
  classId: string;
  semesterNumber: number;
  subjectId: string;
  teacherUid: string;
  actorRole: UserRole;
  timetableSlotId: string | null;
  lectureMode: LectureMode;
  lectureDate: string; // "YYYY-MM-DD"
  startTime: string; // "10:30"
  endTime: string; // "11:30"
  teachingPlanEntryId: string | null;
  topicCovered: string;
  mappedCoCode: MappedCoOption;
  ictToolUsed: string;
  remark: string;
  records: Record<string, 'P' | 'A'>; // Keyed by student rollNo
  activeStudentRollNos: string[];
  plannedTotalSessions: number;
  isEdit: boolean;
  editSummary?: string;
}

export function generateAttendanceSessionId(
  subjectId: string,
  lectureDate: string,
  startTime: string
): string {
  return `${subjectId}_${lectureDate}_${startTime}`;
}

export function buildAttendanceSessionPayload(
  params: SaveAttendanceParams,
  metrics: { presentCount: number; absentCount: number; attendancePercent: number }
) {
  const sessionId = generateAttendanceSessionId(params.subjectId, params.lectureDate, params.startTime);
  const monthKey = params.lectureDate.slice(0, 7);
  const isCompleted = params.lectureMode !== 'cancelled';
  const totalStudents = params.activeStudentRollNos.length;

  return {
    id: sessionId,
    academicYearId: params.academicYearId,
    classId: params.classId,
    semesterNumber: params.semesterNumber,
    subjectId: params.subjectId,
    teacherUid: params.teacherUid,
    timetableSlotId: params.timetableSlotId,
    lectureMode: params.lectureMode,
    lectureDate: params.lectureDate,
    monthKey,
    startTime: params.startTime,
    endTime: params.endTime,
    teachingPlanEntryId: params.teachingPlanEntryId,
    topicCovered: params.topicCovered,
    mappedCoCode: params.mappedCoCode,
    ictToolUsed: params.ictToolUsed,
    remark: params.remark,
    totalStudents,
    presentCount: metrics.presentCount,
    absentCount: metrics.absentCount,
    attendancePercent: metrics.attendancePercent,
    records: isCompleted ? params.records : {},
    status: isCompleted ? 'completed' : 'cancelled',
  };
}

export function buildTeachingPlanSyncPayload(
  sessionId: string,
  lectureDate: string,
  ictToolUsed: string,
  remark: string,
  teacherUid: string
) {
  return {
    actualDate: lectureDate,
    ictToolUsed,
    remark,
    linkedAttendanceSessionId: sessionId,
    status: 'completed' as const,
    updatedBy: teacherUid,
  };
}

export function buildAttendanceAuditEntry(
  params: Pick<SaveAttendanceParams, 'teacherUid' | 'actorRole' | 'academicYearId' | 'classId' | 'subjectId'>,
  sessionId: string,
  summary: string
) {
  return {
    actorUid: params.teacherUid,
    actorRole: params.actorRole,
    action: 'ATTENDANCE_UPDATED',
    targetCollection: 'attendance_sessions',
    targetDocumentId: sessionId,
    academicYearId: params.academicYearId,
    classId: params.classId,
    subjectId: params.subjectId,
    summary,
  };
}

/**
 * Atomic write saving lecture attendance session, syncing teaching plan ACD/ICT,
 * logging audit entries on edit, and deterministically updating monthly reports and dashboard stats.
 */
export async function saveAttendanceAndSyncReports(params: SaveAttendanceParams): Promise<string> {
  const sessionId = generateAttendanceSessionId(params.subjectId, params.lectureDate, params.startTime);
  const monthKey = params.lectureDate.slice(0, 7); // "YYYY-MM"
  const totalStudents = params.activeStudentRollNos.length;
  const isCompleted = params.lectureMode !== 'cancelled';

  const metrics = computeSessionAttendanceMetrics(params.records, totalStudents, isCompleted);
  const sessionPayload = buildAttendanceSessionPayload(params, metrics);

  const batch = writeBatch(db);

  // 1. Upsert attendance_sessions document
  const sessionRef = doc(db, ATTENDANCE_SESSIONS_COLLECTION, sessionId);
  batch.set(
    sessionRef,
    {
      ...sessionPayload,
      updatedBy: params.teacherUid,
      updatedAt: serverTimestamp(),
      ...(params.isEdit ? {} : { createdAt: serverTimestamp(), createdBy: params.teacherUid }),
    },
    { merge: true }
  );


  // 2. Sync linked Teaching Plan entry if completed
  if (params.teachingPlanEntryId && isCompleted) {
    const tpRef = doc(db, 'teaching_plan_entries', params.teachingPlanEntryId);
    batch.update(tpRef, {
      actualDate: params.lectureDate,
      ictToolUsed: params.ictToolUsed,
      remark: params.remark,
      linkedAttendanceSessionId: sessionId,
      status: 'completed',
      updatedBy: params.teacherUid,
      updatedAt: serverTimestamp(),
    });
  }

  // 3. If editing an existing session, append an immutable audit_logs entry
  if (params.isEdit) {
    const auditRef = doc(collection(db, 'audit_logs'));
    batch.set(auditRef, {
      id: auditRef.id,
      actorUid: params.teacherUid,
      actorRole: params.actorRole,
      action: 'ATTENDANCE_UPDATED',
      targetCollection: 'attendance_sessions',
      targetDocumentId: sessionId,
      academicYearId: params.academicYearId,
      classId: params.classId,
      subjectId: params.subjectId,
      summary:
        params.editSummary ||
        `Updated attendance session for ${params.lectureDate} (${params.startTime})`,
      timestamp: serverTimestamp(),
    });
  }

  await batch.commit();

  // 4. Deterministically recompute Monthly Report & Subject Dashboard Stats
  await recomputeSubjectRollups({
    academicYearId: params.academicYearId,
    classId: params.classId,
    subjectId: params.subjectId,
    teacherUid: params.teacherUid,
    monthKey,
    activeStudentRollNos: params.activeStudentRollNos,
    plannedTotalSessions: params.plannedTotalSessions,
  });

  return sessionId;
}

/**
 * Recomputes monthly report and cumulative subject dashboard stats from authoritative sessions.
 */
export async function recomputeSubjectRollups(params: {
  academicYearId: string;
  classId: string;
  subjectId: string;
  teacherUid: string;
  monthKey: string;
  activeStudentRollNos: string[];
  plannedTotalSessions: number;
}): Promise<void> {
  const { subjectId, monthKey, activeStudentRollNos } = params;

  // 1. Fetch all attendance sessions for this subject
  const sessionsQ = query(
    collection(db, ATTENDANCE_SESSIONS_COLLECTION),
    where('subjectId', '==', subjectId)
  );
  const sessionsSnap = await getDocs(sessionsQ);
  const allSessions = sessionsSnap.docs.map((d) => d.data() as AttendanceSession);

  // 2. Fetch timetable slots to compute scheduled counts
  const ttQ = query(
    collection(db, 'timetables'),
    where('subjectId', '==', subjectId),
    where('status', '==', 'active')
  );
  const ttSnap = await getDocs(ttQ);
  const timetableSlots = ttSnap.docs.map((d) => d.data() as any);

  // Filter sessions for the target month
  const monthSessions = allSessions.filter((s) => s.monthKey === monthKey);
  const monthCompleted = monthSessions.filter((s) => s.status === 'completed');
  const monthCancelled = monthSessions.filter((s) => s.status === 'cancelled');
  const monthExtra = monthSessions.filter((s) => s.lectureMode === 'extra');

  // Compute student-wise totals for the month
  const monthStudentMap = computeStudentAttendanceMap(monthCompleted, activeStudentRollNos);
  const monthThresholds = computeDefaultersAndSatisfactory(monthStudentMap);
  const monthAvgAttendance = computeAverageAttendancePercent(
    monthStudentMap,
    activeStudentRollNos.length,
    monthCompleted.length
  );
  const scheduledLecturesCount = countScheduledLecturesInMonth(timetableSlots, monthKey);

  // Count distinct topics completed in this month
  const topicsCompletedSet = new Set<string>();
  for (const s of monthCompleted) {
    if (s.teachingPlanEntryId) topicsCompletedSet.add(s.teachingPlanEntryId);
  }

  const reportId = `${subjectId}_${monthKey}`;
  const reportRef = doc(db, MONTHLY_REPORTS_COLLECTION, reportId);

  const reportData: MonthlyReportDocument = {
    id: reportId,
    academicYearId: params.academicYearId,
    classId: params.classId,
    subjectId,
    teacherUid: params.teacherUid,
    monthKey,
    monthLabel: formatMonthLabel(monthKey),
    scheduledLecturesCount,
    conductedLecturesCount: monthCompleted.length,
    extraLecturesCount: monthExtra.length,
    cancelledLecturesCount: monthCancelled.length,
    averageAttendancePercent: monthAvgAttendance,
    topicsCompletedCount: topicsCompletedSet.size,
    studentTotals: monthStudentMap,
    studentsBelow50Percent: monthThresholds.studentsBelow50Percent,
    studentsAbove60Percent: monthThresholds.studentsAbove60Percent,
    updatedBy: params.teacherUid,
  };

  await updateDoc(reportRef, {
    ...reportData,
    lastCalculatedAt: serverTimestamp(),
  }).catch(async () => {
    // If doc doesn't exist yet, write with setDoc
    await setDoc(reportRef, {
      ...reportData,
      lastCalculatedAt: serverTimestamp(),
    });
  });

  // 3. Cumulative Semester Rollup for Subject Dashboard Stats
  const allCompletedSessions = allSessions.filter((s) => s.status === 'completed');
  const cumulativeStudentMap = computeStudentAttendanceMap(
    allCompletedSessions,
    activeStudentRollNos
  );
  const cumulativeThresholds = computeDefaultersAndSatisfactory(cumulativeStudentMap);
  const cumulativeAvgAttendance = computeAverageAttendancePercent(
    cumulativeStudentMap,
    activeStudentRollNos.length,
    allCompletedSessions.length
  );

  const totalPlanned = params.plannedTotalSessions || 39;
  const conducted = allCompletedSessions.length;
  const pending = Math.max(0, totalPlanned - conducted);
  const completionPercent =
    totalPlanned > 0 ? Number(((conducted / totalPlanned) * 100).toFixed(1)) : 0;

  const dashboardRef = doc(db, DASHBOARD_STATS_COLLECTION, subjectId);
  const dashboardSnap = await getDoc(dashboardRef);
  const prevDashboard = dashboardSnap.exists()
    ? (dashboardSnap.data() as SubjectDashboardStats)
    : null;

  const updatedDashboardData: Partial<SubjectDashboardStats> = {
    subjectId,
    academicYearId: params.academicYearId,
    classId: params.classId,
    teacherUid: params.teacherUid,
    syllabusCompletion: {
      totalPlannedSessions: totalPlanned,
      conductedSessions: conducted,
      pendingSessions: pending,
      completionPercent,
    },
    cumulativeAttendance: {
      totalConducted: conducted,
      averageAttendancePercent: cumulativeAvgAttendance,
      totalStudents: activeStudentRollNos.length,
      studentsBelow50Percent: cumulativeThresholds.studentsBelow50Percent,
      studentsAbove60Percent: cumulativeThresholds.studentsAbove60Percent,
      studentCumulativeMap: cumulativeStudentMap,
    },
    cagsCompletionChecklist: prevDashboard?.cagsCompletionChecklist || {
      studentListImported: activeStudentRollNos.length > 0,
      coPoMappingApproved: false,
      mappingCalculationVerified: false,
      coa04Configured: false,
      actionPlanCompleted: false,
    },
    unitTestStatus: prevDashboard?.unitTestStatus || {
      ut1: { averageMarks: 14.5, studentsAbove15: 25, studentsBelow8: 3, percentPassed: 92.0 },
      ut2: { averageMarks: 13.8, studentsAbove12: 38, studentsBelow10: 5, percentPassed: 89.5 },
    },
    updatedAt: serverTimestamp(),
  };

  await setDoc(dashboardRef, updatedDashboardData, { merge: true });

  // 4. Update conductedSessionsCount on the subjects document
  const subjectRef = doc(db, 'subjects', subjectId);
  await updateDoc(subjectRef, {
    conductedSessionsCount: conducted,
    updatedAt: serverTimestamp(),
  }).catch(() => {});
}

export async function fetchAttendanceSession(
  sessionId: string
): Promise<AttendanceSession | null> {
  const docRef = doc(db, ATTENDANCE_SESSIONS_COLLECTION, sessionId);
  const snap = await getDoc(docRef);
  if (!snap.exists()) return null;
  return snap.data() as AttendanceSession;
}

export async function fetchSubjectAttendanceSessions(
  subjectId: string
): Promise<AttendanceSession[]> {
  const q = query(
    collection(db, ATTENDANCE_SESSIONS_COLLECTION),
    where('subjectId', '==', subjectId)
  );
  const snap = await getDocs(q);
  const list = snap.docs.map((d) => d.data() as AttendanceSession);
  return list.sort((a, b) => b.lectureDate.localeCompare(a.lectureDate));
}

export async function fetchMonthlyReport(
  subjectId: string,
  monthKey: string
): Promise<MonthlyReportDocument | null> {
  const docRef = doc(db, MONTHLY_REPORTS_COLLECTION, `${subjectId}_${monthKey}`);
  const snap = await getDoc(docRef);
  if (!snap.exists()) return null;
  return snap.data() as MonthlyReportDocument;
}

export async function fetchSubjectDashboardStats(
  subjectId: string
): Promise<SubjectDashboardStats | null> {
  const docRef = doc(db, DASHBOARD_STATS_COLLECTION, subjectId);
  const snap = await getDoc(docRef);
  if (!snap.exists()) return null;
  return snap.data() as SubjectDashboardStats;
}
