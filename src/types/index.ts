import type { Timestamp, FieldValue } from 'firebase/firestore';

export type UserRole = 'super_admin' | 'teacher';
export type AccountStatus = 'active' | 'disabled';
export type FirestoreDate = Timestamp | FieldValue;

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  departmentId?: string;
  departmentName?: string;
  department?: string;
  status: AccountStatus;
  createdAt?: FirestoreDate;
  updatedAt?: FirestoreDate;
  createdBy?: string;
}

export interface Department {
  id: string; // e.g. "dept_cseds"
  code: string; // e.g. "CSE-DS"
  name: string; // e.g. "Computer Science & Engineering (Data Science)"
  status: 'active' | 'archived';
  createdAt?: FirestoreDate;
  updatedAt?: FirestoreDate;
  createdBy?: string;
}

export interface AcademicYear {
  id: string; // e.g. "ay_2025_26"
  yearLabel: string; // e.g. "2025-26"
  curriculumScheme: string; // e.g. "2023-27"
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  status: 'active' | 'archived';
  isCurrent: boolean;
  createdAt?: FirestoreDate;
  updatedAt?: FirestoreDate;
}

export type YearGroup = 'First Year' | 'Second Year' | 'Third Year' | 'Final Year';

export interface ClassCohort {
  id: string; // e.g. "cls_becse_ds_vii_2025"
  academicYearId: string;
  academicYearLabel: string;
  departmentId: string;
  departmentName: string;
  yearGroup: YearGroup;
  semesterNumber: number; // 1 to 8
  division: string; // e.g. "BECSE-DS / VII"
  status: 'active' | 'archived';
  createdAt?: FirestoreDate;
  updatedAt?: FirestoreDate;
}

export interface Subject {
  id: string; // e.g. "subj_csdo7023_2025"
  departmentId: string;
  classId: string;
  classDivision: string;
  academicYearId: string;
  courseCode: string; // e.g. "CSDO7023"
  courseName: string; // e.g. "Game Theory for Data Science (TH)"
  courseType: 'theory' | 'practical';
  totalSyllabusHours: number; // e.g. 39
  plannedTotalSessions: number; // e.g. 44
  conductedSessionsCount: number;
  assignedTeacherUid?: string;
  assignedTeacherName?: string;
  status: 'active' | 'archived';
  createdAt?: FirestoreDate;
  updatedAt?: FirestoreDate;
}

export interface TeacherAssignment {
  id: string; // ${teacherUid}_${subjectId}
  teacherUid: string;
  teacherName: string;
  teacherEmail: string;
  subjectId: string;
  courseCode: string;
  courseName: string;
  classId: string;
  classDivision: string;
  academicYearId: string;
  departmentId: string;
  status: 'active' | 'revoked';
  assignedAt?: FirestoreDate;
  assignedBy?: string;
}

export type OutcomeType = 'PO' | 'PEO' | 'PSO';

export interface GlobalOutcome {
  id: string;
  departmentId?: string; // Scoped per department
  type: OutcomeType;
  code: string;
  shortLabel: string;
  sortOrder: number;
  description: string;
  status: 'active' | 'archived';
  updatedAt?: FirestoreDate;
  updatedBy?: string;
}

export interface TimetableSlot {
  id: string;
  academicYearId: string;
  classId: string;
  classDivision: string;
  subjectId: string;
  courseCode: string;
  courseName: string;
  teacherUid: string;
  teacherName: string;
  dayOfWeek: number; // 1 = Monday ... 6 = Saturday
  dayName: string; // "Monday", etc.
  startTime: string; // "10:15"
  endTime: string; // "11:15"
  roomNumber: string;
  effectiveFrom: string; // YYYY-MM-DD
  effectiveTo: string; // YYYY-MM-DD
  status: 'active' | 'cancelled';
  createdAt?: FirestoreDate;
  updatedAt?: FirestoreDate;
}

export interface CourseOutcome {
  id: string; // ${subjectId}_CO${coNumber}
  academicYearId: string;
  classId: string;
  subjectId: string;
  teacherUid?: string;
  coNumber: 1 | 2 | 3 | 4;
  coCode: 'CO1' | 'CO2' | 'CO3' | 'CO4';
  description: string;
  syllabusHours: number;
  status: 'active' | 'archived';
  createdAt?: FirestoreDate;
  updatedAt?: FirestoreDate;
  createdBy?: string;
}

export type LearnerCategory = 'slow_learner' | 'advanced_learner' | 'unclassified';

export interface Student {
  id: string; // ${classId}_${rollNo}
  classId: string;
  academicYearId: string;
  rollNo: number;
  studentName: string;
  email?: string;
  contactNo?: string;
  learnerCategory: LearnerCategory;
  status: 'active' | 'archived';
  authorizedSubjectId?: string; // used for security rule validation on writes
  createdAt?: FirestoreDate;
  updatedAt?: FirestoreDate;
  createdBy?: string;
}

export interface StudentImportBatch {
  id: string; // `batch_${classId}_${timestamp}`
  classId: string;
  subjectId: string;
  academicYearId: string;
  fileName: string;
  uploadedBy: string;
  totalRowsFound: number;
  createdCount: number;
  updatedCount: number;
  rejectedCount: number;
  rejectionReasons: Array<{ rowNumber: number; reason: string }>;
  uploadedAt: FirestoreDate;
}


