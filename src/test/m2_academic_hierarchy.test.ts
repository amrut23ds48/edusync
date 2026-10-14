import { describe, expect, it } from 'vitest';
import type { 
  Department, 
  AcademicYear, 
  ClassCohort, 
  Subject, 
  TeacherAssignment, 
  TimetableSlot, 
  GlobalOutcome, 
  YearGroup 
} from '../types';
import { OFFICIAL_GLOBAL_OUTCOMES } from '../services/seedService';

describe('Milestone 2: Academic Hierarchy & Management', () => {
  describe('Step 2: Department Models & ID Generation', () => {
    function generateDeptId(code: string): string {
      return `dept_${code.trim().toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
    }

    it('generates consistent, sanitized IDs for departments', () => {
      expect(generateDeptId('CSE-DS')).toBe('dept_cse_ds');
      expect(generateDeptId('AI & ML')).toBe('dept_ai___ml');
      expect(generateDeptId('EXTC')).toBe('dept_extc');
    });

    it('validates Department status and properties', () => {
      const dept: Department = {
        id: generateDeptId('CSE-DS'),
        code: 'CSE-DS',
        name: 'Computer Science and Engineering (Data Science)',
        status: 'active',
      };
      expect(dept.status).toBe('active');
      expect(dept.code).toBe('CSE-DS');
      expect(['active', 'archived']).toContain(dept.status);
    });
  });

  describe('Step 3: Academic Setup Models (Years, Classes, Subjects)', () => {
    it('validates AcademicYear date range and current flag', () => {
      const year: AcademicYear = {
        id: 'ay_2025_26',
        yearLabel: '2025-26',
        curriculumScheme: '2023-27',
        startDate: '2025-07-01',
        endDate: '2026-06-30',
        isCurrent: true,
        status: 'active',
      };
      expect(new Date(year.startDate).getTime()).toBeLessThan(new Date(year.endDate).getTime());
      expect(year.isCurrent).toBe(true);
    });

    it('validates Class Cohort constraints according to specification', () => {
      const validYearGroups: YearGroup[] = ['First Year', 'Second Year', 'Third Year', 'Final Year'];
      const classCohort: ClassCohort = {
        id: 'cls_2025_26_final_yr_sem7_becse_ds',
        departmentId: 'dept_cse_ds',
        departmentName: 'Computer Science & Engineering (Data Science)',
        academicYearId: 'ay_2025_26',
        academicYearLabel: '2025-26',
        yearGroup: 'Final Year',
        semesterNumber: 7,
        division: 'BECSE-DS / VII',
        status: 'active',
      };

      expect(validYearGroups).toContain(classCohort.yearGroup);
      expect(classCohort.semesterNumber).toBeGreaterThanOrEqual(1);
      expect(classCohort.semesterNumber).toBeLessThanOrEqual(8);
      expect(classCohort.division).toContain('BECSE-DS');
    });

    it('validates Subject hours and sessions according to CAGS specification', () => {
      const subject: Subject = {
        id: 'subj_csdo7023_202526',
        departmentId: 'dept_cse_ds',
        classId: 'cls_2025_26_final_yr_sem7_becse_ds',
        classDivision: 'BECSE-DS / VII',
        academicYearId: 'ay_2025_26',
        courseCode: 'CSDO7023',
        courseName: 'Game Theory for Data Science (TH)',
        courseType: 'theory',
        totalSyllabusHours: 39,
        plannedTotalSessions: 44,
        conductedSessionsCount: 0,
        status: 'active',
      };

      expect(subject.courseType).toBe('theory');
      expect(subject.totalSyllabusHours).toBe(39);
      expect(subject.plannedTotalSessions).toBeGreaterThanOrEqual(subject.totalSyllabusHours);
      expect(subject.conductedSessionsCount).toBe(0);
    });

    it('validates Course Outcomes (CO1-CO4) structure and syllabus hours sum', () => {
      const cos: Array<{ coNumber: number; coCode: string; description: string; syllabusHours: number }> = [
        { coNumber: 1, coCode: 'CO1', description: 'Analyze and Discuss strategic games', syllabusHours: 7 },
        { coNumber: 2, coCode: 'CO2', description: 'Discuss Nash Equilibrium', syllabusHours: 10 },
        { coNumber: 3, coCode: 'CO3', description: 'Bayesian Games', syllabusHours: 12 },
        { coNumber: 4, coCode: 'CO4', description: 'Non-Cooperative Games', syllabusHours: 10 },
      ];

      expect(cos.length).toBe(4);
      expect(cos.map(c => c.coCode)).toEqual(['CO1', 'CO2', 'CO3', 'CO4']);
      const totalHours = cos.reduce((acc, c) => acc + c.syllabusHours, 0);
      expect(totalHours).toBe(39); // Matches CSDO7023 total syllabus hours

      // Verify deterministic document ID format: ${subjectId}_${coCode}
      const subjectId = 'subj_csdo7023_202526';
      const docIds = cos.map(c => `${subjectId}_${c.coCode}`);
      expect(docIds[0]).toBe('subj_csdo7023_202526_CO1');
      expect(docIds[3]).toBe('subj_csdo7023_202526_CO4');
    });
  });

  describe('Step 4: Teacher Provisioning & Assignments', () => {
    function generateAssignmentId(teacherUid: string, subjectId: string): string {
      return `${teacherUid}_${subjectId}`;
    }

    it('generates composite assignment ID conforming to teacherUid_subjectId', () => {
      const teacherUid = 'teacher_uid_123';
      const subjectId = 'subj_csdo7023_202526';
      const assignmentId = generateAssignmentId(teacherUid, subjectId);

      expect(assignmentId).toBe('teacher_uid_123_subj_csdo7023_202526');
    });

    it('validates teacher assignment record fields', () => {
      const assignment: TeacherAssignment = {
        id: 'teacher_1_subj_csdo7023_202526',
        teacherUid: 'teacher_1',
        teacherName: 'Prof. Janisar',
        teacherEmail: 'prof.janisar@aiktc.ac.in',
        subjectId: 'subj_csdo7023_202526',
        courseCode: 'CSDO7023',
        courseName: 'Game Theory for Data Science (TH)',
        classId: 'cls_2025_26_final_yr_sem7_becse_ds',
        classDivision: 'BECSE-DS / VII',
        academicYearId: 'ay_2025_26',
        departmentId: 'dept_cse_ds',
        status: 'active',
      };

      expect(assignment.status).toBe('active');
      expect(assignment.teacherEmail).toBe('prof.janisar@aiktc.ac.in');
      expect(assignment.courseCode).toBe('CSDO7023');
    });
  });

  describe('Step 5: Per-Department Global Outcomes', () => {
    it('verifies all 19 official outcomes exist and can be scoped per department', () => {
      expect(OFFICIAL_GLOBAL_OUTCOMES.length).toBe(19);

      const pos = OFFICIAL_GLOBAL_OUTCOMES.filter((o) => o.type === 'PO');
      const peos = OFFICIAL_GLOBAL_OUTCOMES.filter((o) => o.type === 'PEO');
      const psos = OFFICIAL_GLOBAL_OUTCOMES.filter((o) => o.type === 'PSO');

      expect(pos.length).toBe(12);
      expect(peos.length).toBe(5);
      expect(psos.length).toBe(2);

      // Verify department scoping composite ID
      const deptId = 'dept_aiml';
      const scopedOutcomes: GlobalOutcome[] = OFFICIAL_GLOBAL_OUTCOMES.map((o) => ({
        ...o,
        id: `${deptId}_${o.id}`,
        departmentId: deptId,
        status: 'active' as const,
      }));

      expect(scopedOutcomes.every((o) => o.departmentId === deptId)).toBe(true);
      expect(scopedOutcomes.find((o) => o.shortLabel === 'PO1')?.id).toBe('dept_aiml_PO1');
    });
  });

  describe('Step 6: Timetable Manager Models & Slot Validation', () => {
    function generateSlotId(classId: string, dayOfWeek: number, startTime: string): string {
      const cleanTime = startTime.replace(/[^0-9]/g, '');
      return `slot_${classId}_day${dayOfWeek}_${cleanTime}`;
    }

    it('generates unique timetable slot IDs', () => {
      const slotId = generateSlotId('cls_becse_ds', 1, '10:15');
      expect(slotId).toBe('slot_cls_becse_ds_day1_1015');
    });

    it('validates timetable slot time ordering and day bounds', () => {
      const slot: TimetableSlot = {
        id: 'slot_cls_becse_ds_day1_1015',
        academicYearId: 'ay_2025_26',
        classId: 'cls_becse_ds',
        classDivision: 'BECSE-DS / VII',
        subjectId: 'subj_csdo7023_202526',
        courseCode: 'CSDO7023',
        courseName: 'Game Theory for Data Science (TH)',
        teacherUid: 'teacher_1',
        teacherName: 'Prof. Janisar',
        dayOfWeek: 1, // Monday
        dayName: 'Monday',
        startTime: '10:15',
        endTime: '11:15',
        roomNumber: 'Lab 402',
        effectiveFrom: '2025-07-01',
        effectiveTo: '2026-06-30',
        status: 'active',
      };

      expect(slot.dayOfWeek).toBeGreaterThanOrEqual(1);
      expect(slot.dayOfWeek).toBeLessThanOrEqual(6);
      expect(slot.startTime < slot.endTime).toBe(true);
      expect(slot.status).toBe('active');
    });
  });
});
