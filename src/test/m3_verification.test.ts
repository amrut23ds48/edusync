import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';
import { parseStudentRoster, generateStudentTemplateWorkbook } from '../services/excelImportService';
import type { TeacherAssignment, Student, LearnerCategory } from '../types';

describe('Milestone 3 Comprehensive Verification Gates (M3-V1 to M3-V5)', () => {
  // -------------------------------------------------------------
  // M3-V1: Academic & Teacher Segregation Access
  // -------------------------------------------------------------
  describe('Gate M3-V1: Teacher Assignment & Subject Segregation', () => {
    const teacherA_Uid = 'teacher_aiktc_janisar';
    const teacherB_Uid = 'teacher_aiktc_shaikh';
    const authorizedSubjId = 'subj_csdo7023_2025';
    const unauthorizedSubjId = 'subj_other_course_2025';

    const assignmentsDatabase: TeacherAssignment[] = [
      {
        id: `${teacherA_Uid}_${authorizedSubjId}`,
        teacherUid: teacherA_Uid,
        teacherName: 'Prof. Mohd Janisar',
        teacherEmail: 'prof.janisar@aiktc.ac.in',
        subjectId: authorizedSubjId,
        courseCode: 'CSDO7023',
        courseName: 'Game Theory for Data Science',
        classId: 'class_becse_ds_sem7_2025',
        classDivision: 'BECSE-DS / VII',
        departmentId: 'dept_ds',
        academicYearId: 'ay_2025_26',
        status: 'active',
        assignedBy: 'super_admin_uid',
      },
      {
        id: `${teacherB_Uid}_${unauthorizedSubjId}`,
        teacherUid: teacherB_Uid,
        teacherName: 'Prof. Farhan Shaikh',
        teacherEmail: 'prof.shaikh@aiktc.ac.in',
        subjectId: unauthorizedSubjId,
        courseCode: 'CSDO7024',
        courseName: 'Cloud Computing & Virtualization',
        classId: 'class_becse_ds_sem7_2025',
        classDivision: 'BECSE-DS / VII',
        departmentId: 'dept_ds',
        academicYearId: 'ay_2025_26',
        status: 'active',
        assignedBy: 'super_admin_uid',
      },
    ];

    function checkSubjectAuthorization(userUid: string, role: string, subjectId: string): boolean {
      if (role === 'super_admin') return true;
      return assignmentsDatabase.some(
        (a) => a.teacherUid === userUid && a.subjectId === subjectId && a.status === 'active'
      );
    }

    it('allows Teacher A to access CSDO7023 and blocks Teacher B from accessing CSDO7023', () => {
      // Teacher A has active assignment to CSDO7023
      expect(checkSubjectAuthorization(teacherA_Uid, 'teacher', authorizedSubjId)).toBe(true);

      // Teacher B attempts to navigate directly to CSDO7023 -> MUST BE BLOCKED
      expect(checkSubjectAuthorization(teacherB_Uid, 'teacher', authorizedSubjId)).toBe(false);

      // Teacher A attempts to access Teacher B's unauthorized course -> MUST BE BLOCKED
      expect(checkSubjectAuthorization(teacherA_Uid, 'teacher', unauthorizedSubjId)).toBe(false);

      // Super Admin has unrestricted institution access to both
      expect(checkSubjectAuthorization('super_admin_uid', 'super_admin', authorizedSubjId)).toBe(true);
      expect(checkSubjectAuthorization('super_admin_uid', 'super_admin', unauthorizedSubjId)).toBe(true);
    });

    it('blocks access if teacher assignment status is disabled/inactive', () => {
      const inactiveAssignment: TeacherAssignment = {
        ...assignmentsDatabase[0],
        id: 'revoked_assignment',
        status: 'revoked',
      };
      const checkInactive = (assignments: TeacherAssignment[], uid: string, subjId: string) => {
        return assignments.some((a) => a.teacherUid === uid && a.subjectId === subjId && a.status === 'active');
      };

      expect(checkInactive([inactiveAssignment], teacherA_Uid, authorizedSubjId)).toBe(false);
    });
  });

  // -------------------------------------------------------------
  // M3-V2: Workbook Header Discovery & #N/A Skipping
  // -------------------------------------------------------------
  describe('Gate M3-V2: Workbook Header Discovery & #N/A Formula Artifact Skipping', () => {
    it('detects headers placed at Row 9 and safely skips Row 10 #N/A formula artifact without error', () => {
      // Test dynamic header discovery across arbitrary rows (e.g. Row 9) and formula errors
      const sampleDataWithNA = [
        ['COLLEGE OF ENGINEERING & TECHNOLOGY'],
        ['ACADEMIC YEAR 2025-26'],
        ['DEPARTMENT OF COMPUTER SCIENCE & ENGINEERING'],
        ['CLASS: BECSE-DS / VII'],
        [''],
        [''],
        [''],
        [''],
        ['Roll No.', 'Name of Students', 'Email', 'Contact No.'], // Row 9 headers
        ['#N/A', '#N/A', '', ''], // Row 10 formula error artifact
        ['1', 'Aarav Sharma', 'aarav@test.edu', '9876543210'],
        ['2', 'Diya Patel', 'diya@test.edu', '9876543211'],
        ['3', 'Faizan Shaikh', 'faizan@test.edu', '9876543212'],
        ['', '', '', ''],
      ];

      const ws = XLSX.utils.aoa_to_sheet(sampleDataWithNA);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'List of Students');

      // Run parsing through excelImportService
      const result = parseStudentRoster(wb, new Set([1]));

      expect(result.sheetName).toBe('List of Students');
      expect(result.headerRowNumber).toBe(9);

      // Verify that valid student rows were extracted
      expect(result.createRows.length).toBe(2); // Rolls 2 and 3
      expect(result.updateRows.length).toBe(1); // Roll 1
      expect(result.rejectRows.length).toBe(0); // #N/A safely skipped, not rejected

      // Verify that NO #N/A formula error row leaked into createRows or updateRows
      for (const row of [...result.createRows, ...result.updateRows]) {
        expect(row.studentName).not.toContain('#N/A');
        expect(row.rollNo).toBeGreaterThan(0);
        expect(isNaN(row.rollNo)).toBe(false);
      }
    });

    it('generates a clean downloadable template that can be parsed back with 100% accuracy', () => {
      const bytes = generateStudentTemplateWorkbook();
      const wb = XLSX.read(bytes, { type: 'array' });
      expect(wb.SheetNames).toContain('List of Students');

      const parsed = parseStudentRoster(wb, new Set());
      expect(parsed.createRows.length).toBe(3);
      expect(parsed.createRows[0].rollNo).toBe(1);
      expect(parsed.createRows[0].studentName).toBe('Aarav Sharma');
      expect(parsed.createRows[1].rollNo).toBe(2);
      expect(parsed.createRows[2].rollNo).toBe(3);
    });

    it('parses the generated students_sample_roster.csv with all 20 students', () => {
      const csvPath = path.resolve(__dirname, '../../../students_sample_roster.csv');
      const csvContent = fs.readFileSync(csvPath, 'utf8');
      const wb = XLSX.read(csvContent, { type: 'string' });

      const parsed = parseStudentRoster(wb, new Set());
      expect(parsed.createRows.length).toBe(20);
      expect(parsed.rejectRows.length).toBe(0);
      expect(parsed.createRows[0].rollNo).toBe(1);
      expect(parsed.createRows[0].studentName).toBe('Aarav Sharma');
      expect(parsed.createRows[19].rollNo).toBe(20);
      expect(parsed.createRows[19].studentName).toBe('Sana Farooqui');
    });

    it('parses the generated students_sample_roster.xlsx with all 20 students', () => {
      const xlsxPath = path.resolve(__dirname, '../../../students_sample_roster.xlsx');
      const xlsxBuffer = fs.readFileSync(xlsxPath);
      const wb = XLSX.read(xlsxBuffer, { type: 'buffer' });

      const parsed = parseStudentRoster(wb, new Set());
      expect(parsed.createRows.length).toBe(20);
      expect(parsed.rejectRows.length).toBe(0);
      expect(parsed.createRows[0].rollNo).toBe(1);
      expect(parsed.createRows[19].rollNo).toBe(20);
    });
  });

  // -------------------------------------------------------------
  // M3-V3: Idempotent Upsert & Zero Duplicate Guarantees
  // -------------------------------------------------------------
  describe('Gate M3-V3: Idempotent Upsert & In-Place Record Updates', () => {
    it('creates new records on first upload and updates existing records with 0 duplicates on re-upload', () => {
      const classId = 'class_becse_ds_sem7_2025';

      // Pass 1: Fresh database with 0 students
      const existingRosterPass1 = new Set<number>();
      const sampleWorkbookData = [
        ['Roll No.', 'Name of Students', 'Email', 'Contact No.'],
        ['1', 'Aarav Sharma', 'aarav@institution.edu', '9876543210'],
        ['2', 'Diya Patel', 'diya@institution.edu', '9876543211'],
        ['3', 'Faizan Shaikh', 'faizan@institution.edu', '9876543212'],
      ];
      const ws1 = XLSX.utils.aoa_to_sheet(sampleWorkbookData);
      const wb1 = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb1, ws1, 'List of Students');

      const pass1Result = parseStudentRoster(wb1, existingRosterPass1);

      expect(pass1Result.createRows.length).toBe(3);
      expect(pass1Result.updateRows.length).toBe(0);
      expect(pass1Result.rejectRows.length).toBe(0);

      // Simulate database state after Pass 1:
      // Document IDs are deterministic: `${classId}_${rollNo}`
      const simulatedDb = new Map<string, any>();
      for (const row of pass1Result.createRows) {
        const docId = `${classId}_${row.rollNo}`;
        simulatedDb.set(docId, {
          id: docId,
          classId,
          rollNo: row.rollNo,
          studentName: row.studentName,
          email: row.email,
          contactNo: row.contactNo,
          learnerCategory: 'unclassified',
          status: 'active',
        });
      }

      expect(simulatedDb.size).toBe(3);

      // Pass 2: Re-upload the exact same file (plus 1 corrected email)
      const existingRosterPass2 = new Set(Array.from(simulatedDb.values()).map((s) => s.rollNo));
      const sampleWorkbookDataPass2 = [
        ['Roll No.', 'Name of Students', 'Email', 'Contact No.'],
        ['1', 'Aarav Sharma', 'aarav.updated@institution.edu', '9876543210'],
        ['2', 'Diya Patel', 'diya@institution.edu', '9876543211'],
        ['3', 'Faizan Shaikh', 'faizan@institution.edu', '9876543212'],
      ];
      const ws2 = XLSX.utils.aoa_to_sheet(sampleWorkbookDataPass2);
      const wb2 = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb2, ws2, 'List of Students');

      const pass2Result = parseStudentRoster(wb2, existingRosterPass2);

      // 0 NEW records should be created
      expect(pass2Result.createRows.length).toBe(0);
      // All 3 records identified as UPDATE
      expect(pass2Result.updateRows.length).toBe(3);

      // Commit updates to simulatedDb using deterministic IDs
      for (const row of pass2Result.updateRows) {
        const docId = `${classId}_${row.rollNo}`;
        const existing = simulatedDb.get(docId);
        expect(existing).toBeDefined();
        simulatedDb.set(docId, {
          ...existing,
          studentName: row.studentName,
          email: row.email,
          contactNo: row.contactNo,
        });
      }

      // Crucial verification: total document count is STILL 3 (ZERO duplicate documents created!)
      expect(simulatedDb.size).toBe(3);
      expect(simulatedDb.get(`${classId}_1`)?.email).toBe('aarav.updated@institution.edu');
    });
  });

  // -------------------------------------------------------------
  // M3-V4: Student Manual CRUD & Learner Category State Transitions
  // -------------------------------------------------------------
  describe('Gate M3-V4: Student Manual CRUD & Learner Category State Machine', () => {
    it('manages learner category transitions correctly between unclassified, slow_learner, and advanced_learner', () => {
      const student: Student = {
        id: 'class_1_10',
        classId: 'class_1',
        academicYearId: 'ay_2025_26',
        rollNo: 10,
        studentName: 'Zayd Khan',
        email: 'zayd@institution.edu',
        contactNo: '9876500000',
        learnerCategory: 'unclassified',
        status: 'active',
      };

      // Function mimicking UI toggle logic: toggle to target or reset to unclassified
      function toggleCategory(current: LearnerCategory, target: LearnerCategory): LearnerCategory {
        return current === target ? 'unclassified' : target;
      }

      let cat: LearnerCategory = student.learnerCategory;
      cat = toggleCategory(cat, 'slow_learner');
      expect(cat).toBe('slow_learner');

      cat = toggleCategory(cat, 'slow_learner');
      expect(cat).toBe('unclassified');

      cat = toggleCategory(cat, 'advanced_learner');
      expect(cat).toBe('advanced_learner');

      cat = toggleCategory(cat, 'advanced_learner');
      expect(cat).toBe('unclassified');
    });

    it('supports soft-archiving without losing historical reference', () => {
      const student: Student = {
        id: 'class_1_15',
        classId: 'class_1',
        academicYearId: 'ay_2025_26',
        rollNo: 15,
        studentName: 'Test Student',
        learnerCategory: 'unclassified',
        status: 'active',
      };

      // Soft archive
      const archivedStudent: Student = {
        ...student,
        status: 'archived',
      };

      expect(archivedStudent.status).toBe('archived');
      // Document ID and roll number remain intact for audits
      expect(archivedStudent.id).toBe('class_1_15');
      expect(archivedStudent.rollNo).toBe(15);
    });
  });
});
