import { describe, it, expect } from 'vitest';
import {
  countScheduledLecturesInMonth,
  computeSessionAttendanceMetrics,
  computeStudentAttendanceMap,
  computeDefaultersAndSatisfactory,
  computeAverageAttendancePercent,
  formatMonthLabel,
} from '../lib/cagsCalculations';

describe('Milestone 5 Attendance & Reporting Calculations', () => {
  it('counts scheduled lectures in a month according to timetable rules (skipping Sundays)', () => {
    // 2026-08: 31 days. August 1 is Saturday, August 2 is Sunday...
    // Timetable slot for Monday (dayOfWeek = 1) and Wednesday (dayOfWeek = 3)
    const timetable = [
      {
        dayOfWeek: 1, // Monday
        effectiveFrom: '2026-08-01',
        effectiveTo: '2026-08-31',
        status: 'active',
      },
      {
        dayOfWeek: 3, // Wednesday
        effectiveFrom: '2026-08-01',
        effectiveTo: '2026-08-31',
        status: 'active',
      },
      {
        dayOfWeek: 0, // Sunday slot should be ignored
        effectiveFrom: '2026-08-01',
        effectiveTo: '2026-08-31',
        status: 'active',
      },
      {
        dayOfWeek: 5, // Inactive slot
        effectiveFrom: '2026-08-01',
        effectiveTo: '2026-08-31',
        status: 'cancelled',
      },
    ];

    // In August 2026:
    // Mondays: Aug 3, 10, 17, 24, 31 = 5 Mondays
    // Wednesdays: Aug 5, 12, 19, 26 = 4 Wednesdays
    // Total scheduled = 5 + 4 = 9
    const count = countScheduledLecturesInMonth(timetable, '2026-08');
    expect(count).toBe(9);
  });

  it('computes single lecture session attendance metrics', () => {
    const records: Record<string, 'P' | 'A'> = {
      '21DS01': 'P',
      '21DS02': 'P',
      '21DS03': 'A',
      '21DS04': 'P',
    };
    const metrics = computeSessionAttendanceMetrics(records, 4, true);
    expect(metrics.presentCount).toBe(3);
    expect(metrics.absentCount).toBe(1);
    expect(metrics.attendancePercent).toBe(75.0);

    const cancelledMetrics = computeSessionAttendanceMetrics(records, 4, false);
    expect(cancelledMetrics.presentCount).toBe(0);
    expect(cancelledMetrics.attendancePercent).toBe(0);
  });

  it('computes student-wise percentages, strictly matching ATTENDANCE_AND_REPORTING.md §6.3', () => {
    // Scenario from spec §6.3:
    // Class of 3 students (21DS01, 21DS02, 21DS03) across 4 conducted lectures:
    // 21DS01 attends 4/4 (100%) -> counted in studentsAbove60Percent
    // 21DS02 attends 2/4 (50%) -> 50.0% exactly, neither < 50% nor > 60%
    // 21DS03 attends 1/4 (25%) -> counted in studentsBelow50Percent
    const sessions = [
      { status: 'completed', records: { '21DS01': 'P' as const, '21DS02': 'P' as const, '21DS03': 'P' as const } },
      { status: 'completed', records: { '21DS01': 'P' as const, '21DS02': 'P' as const, '21DS03': 'A' as const } },
      { status: 'completed', records: { '21DS01': 'P' as const, '21DS02': 'A' as const, '21DS03': 'A' as const } },
      { status: 'completed', records: { '21DS01': 'P' as const, '21DS02': 'A' as const, '21DS03': 'A' as const } },
    ];

    const studentRolls = ['21DS01', '21DS02', '21DS03'];
    const map = computeStudentAttendanceMap(sessions, studentRolls);

    expect(map['21DS01']).toEqual({ attended: 4, conducted: 4, percent: 100.0 });
    expect(map['21DS02']).toEqual({ attended: 2, conducted: 4, percent: 50.0 });
    expect(map['21DS03']).toEqual({ attended: 1, conducted: 4, percent: 25.0 });

    const thresholds = computeDefaultersAndSatisfactory(map);
    // Strictly < 50: only 21DS03 (25%)
    expect(thresholds.studentsBelow50Percent).toBe(1);
    // Strictly > 60: only 21DS01 (100%)
    expect(thresholds.studentsAbove60Percent).toBe(1);

    // Average attendance: (4 + 2 + 1) / (3 * 4) = 7 / 12 = 58.333% -> 58.3%
    const avg = computeAverageAttendancePercent(map, 3, 4);
    expect(avg).toBe(58.3);
  });

  it('formats month labels properly', () => {
    expect(formatMonthLabel('2026-08')).toBe('August 2026');
    expect(formatMonthLabel('2025-01')).toBe('January 2025');
  });
});
