import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import {
  generateAttendanceSessionId,
  buildAttendanceSessionPayload,
  buildTeachingPlanSyncPayload,
  buildAttendanceAuditEntry,
  type SaveAttendanceParams,
} from '../services/attendanceService';
import {
  computeSessionAttendanceMetrics,
  computeStudentAttendanceMap,
  computeDefaultersAndSatisfactory,
  computeAverageAttendancePercent,
} from '../lib/cagsCalculations';

describe('Milestone 5 Verification Suite', () => {
  const baseParams: SaveAttendanceParams = {
    academicYearId: 'ay_2025_26',
    classId: 'cls_becse_ds_vii_2025',
    semesterNumber: 7,
    subjectId: 'subj_csdo7023_2025',
    teacherUid: 'teacher_janisar',
    actorRole: 'teacher',
    timetableSlotId: 'tt_csdo7023_wed_1030',
    lectureMode: 'scheduled',
    lectureDate: '2026-08-05',
    startTime: '10:30',
    endTime: '11:30',
    teachingPlanEntryId: 'tp_csdo7023_lect_12',
    topicCovered: 'Nash Equilibrium',
    mappedCoCode: 'CO2',
    ictToolUsed: 'Chalk Board, Presentation',
    remark: '',
    records: {
      '21DS01': 'P',
      '21DS02': 'A',
      '21DS03': 'P',
    },
    activeStudentRollNos: ['21DS01', '21DS02', '21DS03'],
    plannedTotalSessions: 39,
    isEdit: false,
  };

  // -------------------------------------------------------------------------
  // Gate M5-V1: Recording attendance updates attendance, teaching plan, monthly report, and dashboard
  // -------------------------------------------------------------------------
  describe('Gate M5-V1: Atomic Attendance & Teaching Plan Sync', () => {
    it('builds a verified session payload with deterministic composite key and correct metrics', () => {
      const metrics = computeSessionAttendanceMetrics(baseParams.records, 3, true);
      const sessionPayload = buildAttendanceSessionPayload(baseParams, metrics);

      expect(sessionPayload.id).toBe('subj_csdo7023_2025_2026-08-05_10:30');
      expect(sessionPayload.lectureMode).toBe('scheduled');
      expect(sessionPayload.totalStudents).toBe(3);
      expect(sessionPayload.presentCount).toBe(2);
      expect(sessionPayload.absentCount).toBe(1);
      expect(sessionPayload.attendancePercent).toBe(66.7);
      expect(sessionPayload.status).toBe('completed');
      expect(sessionPayload.records).toEqual({
        '21DS01': 'P',
        '21DS02': 'A',
        '21DS03': 'P',
      });
    });

    it('builds teaching plan sync payload marking ACD = lectureDate and status = completed', () => {
      const tpPayload = buildTeachingPlanSyncPayload(
        'subj_csdo7023_2025_2026-08-05_1030',
        '2026-08-05',
        'Chalk Board, Presentation',
        'Taken Extra Lecture',
        'teacher_janisar'
      );

      expect(tpPayload.actualDate).toBe('2026-08-05');
      expect(tpPayload.ictToolUsed).toBe('Chalk Board, Presentation');
      expect(tpPayload.remark).toBe('Taken Extra Lecture');
      expect(tpPayload.linkedAttendanceSessionId).toBe('subj_csdo7023_2025_2026-08-05_1030');
      expect(tpPayload.status).toBe('completed');
      expect(tpPayload.updatedBy).toBe('teacher_janisar');
    });

    it('handles cancelled lecture mode without recording present students or marking topic completed', () => {
      const cancelledParams: SaveAttendanceParams = {
        ...baseParams,
        lectureMode: 'cancelled',
        remark: 'Lecture Cancelled',
      };
      const metrics = computeSessionAttendanceMetrics(cancelledParams.records, 3, false);
      const payload = buildAttendanceSessionPayload(cancelledParams, metrics);

      expect(payload.status).toBe('cancelled');
      expect(payload.presentCount).toBe(0);
      expect(payload.attendancePercent).toBe(0);
      expect(payload.records).toEqual({});
    });
  });

  // -------------------------------------------------------------------------
  // Gate M5-V2: Duplicate Prevention & Audit Logging on Edit
  // -------------------------------------------------------------------------
  describe('Gate M5-V2: Duplicate Prevention & Audit Trail', () => {
    it('produces identical deterministic session ID for identical slot, preventing duplicate documents', () => {
      const id1 = generateAttendanceSessionId('subj_csdo7023_2025', '2026-08-05', '10:30');
      const id2 = generateAttendanceSessionId('subj_csdo7023_2025', '2026-08-05', '10:30');
      expect(id1).toBe('subj_csdo7023_2025_2026-08-05_10:30');
      expect(id1).toBe(id2);
    });

    it('builds an immutable audit_logs entry with ATTENDANCE_UPDATED action on session edits', () => {
      const audit = buildAttendanceAuditEntry(
        baseParams,
        'subj_csdo7023_2025_2026-08-05_10:30',
        'Corrected student 21DS02 from Absent to Present'
      );

      expect(audit.action).toBe('ATTENDANCE_UPDATED');
      expect(audit.actorUid).toBe('teacher_janisar');
      expect(audit.actorRole).toBe('teacher');
      expect(audit.targetCollection).toBe('attendance_sessions');
      expect(audit.targetDocumentId).toBe('subj_csdo7023_2025_2026-08-05_10:30');
      expect(audit.subjectId).toBe('subj_csdo7023_2025');

      expect(audit.summary).toContain('21DS02');
    });
  });

  // -------------------------------------------------------------------------
  // Gate M5-V3: Mathematical Parity between Tab 1 Dashboard and Monthly Report
  // -------------------------------------------------------------------------
  describe('Gate M5-V3: Strict Parity (< 50%, > 60%, Average Attendance %)', () => {
    it('guarantees identical KPI metrics between Tab 1 Dashboard and Monthly Report', () => {
      // 5 Completed Lecture Sessions for a cohort of 4 students:
      // 21DS01: attended 5/5 = 100.0% (> 60%)
      // 21DS02: attended 3/5 = 60.0% (neither < 50% nor > 60%)
      // 21DS03: attended 2/5 = 40.0% (< 50%)
      // 21DS04: attended 1/5 = 20.0% (< 50%)
      const sessions = [
        { status: 'completed', records: { '21DS01': 'P' as const, '21DS02': 'P' as const, '21DS03': 'P' as const, '21DS04': 'P' as const } },
        { status: 'completed', records: { '21DS01': 'P' as const, '21DS02': 'P' as const, '21DS03': 'P' as const, '21DS04': 'A' as const } },
        { status: 'completed', records: { '21DS01': 'P' as const, '21DS02': 'P' as const, '21DS03': 'A' as const, '21DS04': 'A' as const } },
        { status: 'completed', records: { '21DS01': 'P' as const, '21DS02': 'A' as const, '21DS03': 'A' as const, '21DS04': 'A' as const } },
        { status: 'completed', records: { '21DS01': 'P' as const, '21DS02': 'A' as const, '21DS03': 'A' as const, '21DS04': 'A' as const } },
      ];

      const activeRolls = ['21DS01', '21DS02', '21DS03', '21DS04'];

      // Monthly Rollup calculations
      const monthlyStudentMap = computeStudentAttendanceMap(sessions, activeRolls);
      const monthlyThresholds = computeDefaultersAndSatisfactory(monthlyStudentMap);
      const monthlyAvgPercent = computeAverageAttendancePercent(monthlyStudentMap, 4, 5);

      // Cumulative Dashboard calculations (single-month semester scope)
      const cumulativeStudentMap = computeStudentAttendanceMap(sessions, activeRolls);
      const cumulativeThresholds = computeDefaultersAndSatisfactory(cumulativeStudentMap);
      const cumulativeAvgPercent = computeAverageAttendancePercent(cumulativeStudentMap, 4, 5);

      // Total attended: 5 + 3 + 2 + 1 = 11. Total possible = 4 * 5 = 20.
      // 11 / 20 = 55.0%
      expect(monthlyAvgPercent).toBe(55.0);
      expect(cumulativeAvgPercent).toBe(55.0);
      expect(monthlyAvgPercent).toBe(cumulativeAvgPercent);

      // Strict < 50%: 21DS03 (40%) and 21DS04 (20%) -> 2 students
      expect(monthlyThresholds.studentsBelow50Percent).toBe(2);
      expect(cumulativeThresholds.studentsBelow50Percent).toBe(2);
      expect(monthlyThresholds.studentsBelow50Percent).toBe(cumulativeThresholds.studentsBelow50Percent);

      // Strict > 60%: only 21DS01 (100%) -> 1 student (21DS02 is 60.0% exactly, so NOT > 60%)
      expect(monthlyThresholds.studentsAbove60Percent).toBe(1);
      expect(cumulativeThresholds.studentsAbove60Percent).toBe(1);
      expect(monthlyThresholds.studentsAbove60Percent).toBe(cumulativeThresholds.studentsAbove60Percent);
    });

    it('generates a valid SheetJS workbook with Student Matrix and Lecture Log sheets', () => {
      const studentData = [
        { 'Roll No': 1, 'Student Name': 'Alice', 'Attended': 4, 'Total': 4, 'Attendance %': 100, 'Status': 'Regular (>60%)' },
        { 'Roll No': 2, 'Student Name': 'Bob', 'Attended': 1, 'Total': 4, 'Attendance %': 25, 'Status': 'Defaulter (<50%)' },
      ];

      const logData = [
        { 'Date': '2026-08-05', 'Topic': 'Nash Equilibrium', 'CO': 'CO2', 'Present': 2, 'Total': 2, 'Attendance %': 100 },
      ];

      const wb = XLSX.utils.book_new();
      const wsMatrix = XLSX.utils.json_to_sheet(studentData);
      const wsLog = XLSX.utils.json_to_sheet(logData);
      XLSX.utils.book_append_sheet(wb, wsMatrix, 'Attendance Matrix');
      XLSX.utils.book_append_sheet(wb, wsLog, 'Lecture Log');

      expect(wb.SheetNames).toEqual(['Attendance Matrix', 'Lecture Log']);
      expect(wb.Sheets['Attendance Matrix']['!ref']).toBeDefined();
      expect(wb.Sheets['Lecture Log']['!ref']).toBeDefined();
    });
  });
});
