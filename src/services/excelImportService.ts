import * as XLSX from 'xlsx';
import { doc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { Student, StudentImportBatch } from '../types';

export interface ParsedStudentRow {
  rowNumber: number;
  rollNo: number;
  studentName: string;
  email: string;
  contactNo: string;
  action: 'CREATE' | 'UPDATE';
  status: 'valid';
}

export interface RejectedStudentRow {
  rowNumber: number;
  rawRollNo: string;
  rawName: string;
  reason: string;
  action: 'REJECT';
  status: 'rejected';
}

export interface ParseRosterResult {
  sheetName: string;
  headerRowNumber: number;
  createRows: ParsedStudentRow[];
  updateRows: ParsedStudentRow[];
  rejectRows: RejectedStudentRow[];
  totalScannedRows: number;
}

/**
 * 1. Read File into SheetJS Workbook
 */
export async function readExcelFile(file: File): Promise<XLSX.WorkBook> {
  const buffer = await file.arrayBuffer();
  return XLSX.read(buffer, { type: 'array', cellFormula: false });
}

/**
 * 2. Parse Student Roster Sheet with Dynamic Header Discovery and #N/A Formula Skipping
 */
export function parseStudentRoster(
  workbook: XLSX.WorkBook,
  existingRollNumbers: Set<number>
): ParseRosterResult {
  // Find "List of Students" sheet or fallback to first sheet
  const targetSheetName =
    workbook.SheetNames.find((name) => /list.*student/i.test(name)) ||
    workbook.SheetNames[0];

  if (!targetSheetName) {
    throw new Error('Workbook contains no sheets.');
  }

  const sheet = workbook.Sheets[targetSheetName];
  if (!sheet) {
    throw new Error(`Sheet "${targetSheetName}" could not be loaded.`);
  }

  // Convert sheet to 2D array of rows
  const rawRows: any[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: '',
    blankrows: false,
  });

  if (rawRows.length === 0) {
    throw new Error('The selected Excel sheet is completely empty.');
  }

  // 2. Dynamic Header Scanner across Rows 1 to 15
  let headerRowIdx = -1;
  let rollColIdx = -1;
  let nameColIdx = -1;
  let emailColIdx = -1;
  let contactColIdx = -1;

  const maxScanRows = Math.min(15, rawRows.length);
  for (let r = 0; r < maxScanRows; r++) {
    const row = rawRows[r];
    if (!Array.isArray(row)) continue;

    let foundRoll = -1;
    let foundName = -1;
    let foundEmail = -1;
    let foundContact = -1;

    for (let c = 0; c < row.length; c++) {
      const cellVal = String(row[c] || '').trim().toLowerCase();
      const cleanVal = cellVal.replace(/[.:_-]/g, ' ').replace(/\s+/g, ' ').trim();

      // Roll Number Column match
      if (/^(roll\s*(no|num|number)|sr\s*no|seat\s*no)$/i.test(cleanVal) || cleanVal === 'roll') {
        foundRoll = c;
      }
      // Student Name Column match
      else if (/^(name\s*of\s*(the\s*)?students?|student\s*name|candidate\s*name|name)$/i.test(cleanVal)) {
        foundName = c;
      }
      // Email Column match
      else if (/email/i.test(cleanVal)) {
        foundEmail = c;
      }
      // Contact Column match
      else if (/contact|mobile|phone/i.test(cleanVal)) {
        foundContact = c;
      }
    }

    if (foundRoll !== -1 && foundName !== -1) {
      headerRowIdx = r;
      rollColIdx = foundRoll;
      nameColIdx = foundName;
      emailColIdx = foundEmail;
      contactColIdx = foundContact;
      break;
    }
  }

  if (headerRowIdx === -1 || rollColIdx === -1 || nameColIdx === -1) {
    throw new Error(
      'Could not detect "Roll No" and "Student Name" columns in Rows 1–15. Please ensure headers are present.'
    );
  }

  const createRows: ParsedStudentRow[] = [];
  const updateRows: ParsedStudentRow[] = [];
  const rejectRows: RejectedStudentRow[] = [];

  // 3. Scan data rows starting immediately after header row
  for (let r = headerRowIdx + 1; r < rawRows.length; r++) {
    const row = rawRows[r];
    const rowNum = r + 1; // 1-indexed for display

    if (!row || row.length === 0) continue;

    const rawRoll = String(row[rollColIdx] !== undefined ? row[rollColIdx] : '').trim();
    const rawName = String(row[nameColIdx] !== undefined ? row[nameColIdx] : '').trim();
    const rawEmail = emailColIdx !== -1 ? String(row[emailColIdx] || '').trim() : '';
    const rawContact = contactColIdx !== -1 ? String(row[contactColIdx] || '').trim() : '';

    // Ignore Excel formula errors (e.g. #N/A, #VALUE!, #REF!) or blank rows
    if (
      rawRoll.startsWith('#') ||
      rawName.startsWith('#') ||
      rawRoll === '#N/A' ||
      rawName === '#N/A' ||
      (!rawRoll && !rawName)
    ) {
      continue;
    }

    // Validate Roll Number
    const rollNo = parseInt(rawRoll, 10);
    if (isNaN(rollNo) || rollNo <= 0) {
      // If row has some stray text like table summary, skip or reject
      if (rawName.length > 0) {
        rejectRows.push({
          rowNumber: rowNum,
          rawRollNo: rawRoll,
          rawName: rawName,
          reason: `Invalid numeric Roll Number: "${rawRoll}"`,
          action: 'REJECT',
          status: 'rejected',
        });
      }
      continue;
    }

    // Validate Student Name
    if (!rawName || rawName.length < 2) {
      rejectRows.push({
        rowNumber: rowNum,
        rawRollNo: rawRoll,
        rawName: rawName,
        reason: 'Student name is missing or too short',
        action: 'REJECT',
        status: 'rejected',
      });
      continue;
    }

    // Determine Action: Create or Update
    const isUpdate = existingRollNumbers.has(rollNo);
    const parsedItem: ParsedStudentRow = {
      rowNumber: rowNum,
      rollNo,
      studentName: rawName,
      email: rawEmail,
      contactNo: rawContact,
      action: isUpdate ? 'UPDATE' : 'CREATE',
      status: 'valid',
    };

    if (isUpdate) {
      updateRows.push(parsedItem);
    } else {
      createRows.push(parsedItem);
    }
  }

  return {
    sheetName: targetSheetName,
    headerRowNumber: headerRowIdx + 1,
    createRows,
    updateRows,
    rejectRows,
    totalScannedRows: createRows.length + updateRows.length + rejectRows.length,
  };
}

/**
 * 3. Commit Parsed Roster to Firestore Idempotently
 */
export async function commitStudentImportBatch({
  classId,
  subjectId,
  academicYearId,
  fileName,
  uploadedBy,
  createRows,
  updateRows,
  rejectRows,
}: {
  classId: string;
  subjectId: string;
  academicYearId: string;
  fileName: string;
  uploadedBy: string;
  createRows: ParsedStudentRow[];
  updateRows: ParsedStudentRow[];
  rejectRows: RejectedStudentRow[];
}): Promise<{ created: number; updated: number; batchId: string }> {
  const batchId = `batch_${classId}_${Date.now()}`;
  const rowsToSave = [...createRows, ...updateRows];

  // Chunk operations in slices of 400 to strictly observe Firestore's 500-op limit
  const CHUNK_SIZE = 400;
  for (let i = 0; i < rowsToSave.length; i += CHUNK_SIZE) {
    const chunk = rowsToSave.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);

    for (const row of chunk) {
      const studentId = `${classId}_${row.rollNo}`;
      const ref = doc(db, 'students', studentId);

      const studentData: Partial<Student> & Record<string, any> = {
        id: studentId,
        classId,
        academicYearId,
        rollNo: Number(row.rollNo),
        studentName: row.studentName,
        email: row.email || '',
        contactNo: row.contactNo || '',
        authorizedSubjectId: subjectId, // Used by firestore.rules for teacher assignment validation
        status: 'active',
        updatedBy: uploadedBy,
        updatedAt: serverTimestamp(),
      };

      if (row.action === 'CREATE') {
        studentData.learnerCategory = 'unclassified';
        studentData.createdAt = serverTimestamp();
        studentData.createdBy = uploadedBy;
      }

      batch.set(ref, studentData, { merge: true });
    }

    await batch.commit();
  }

  // Record the Batch Audit Log in `student_import_batches`
  const batchRef = doc(db, 'student_import_batches', batchId);
  const batchMeta: StudentImportBatch & Record<string, any> = {
    id: batchId,
    classId,
    subjectId,
    authorizedSubjectId: subjectId,
    academicYearId,
    fileName,
    uploadedBy,
    importedBy: uploadedBy,
    totalRowsFound: rowsToSave.length + rejectRows.length,
    createdCount: createRows.length,
    updatedCount: updateRows.length,
    rejectedCount: rejectRows.length,
    rejectionReasons: rejectRows.map((r) => ({
      rowNumber: r.rowNumber,
      reason: r.reason,
    })),
    uploadedAt: serverTimestamp(),
  };

  try {
    const finalBatch = writeBatch(db);
    finalBatch.set(batchRef, batchMeta);
    await finalBatch.commit();
  } catch (batchErr) {
    console.warn('[CAGS] Notice: student_import_batches audit write notice:', batchErr);
  }

  return {
    created: createRows.length,
    updated: updateRows.length,
    batchId,
  };
}

/**
 * 4. Generate Sample Student Template Workbook (.xlsx)
 */
export function generateStudentTemplateWorkbook(): Uint8Array {
  const wsData = [
    ['INSTITUTION STUDENT ROSTER TEMPLATE'],
    ['Instructions: Fill Roll Number, Student Name, Email, and Contact Number below. Do not delete the header row.'],
    [''],
    ['Roll No.', 'Name of Students', 'Email', 'Contact No.'],
    [1, 'Aarav Sharma', 'aarav.sharma@example.edu', '9876543210'],
    [2, 'Diya Patel', 'diya.patel@example.edu', '9876543211'],
    [3, 'Faizan Shaikh', 'faizan.shaikh@example.edu', '9876543212'],
  ];

  const ws = XLSX.utils.aoa_to_sheet(wsData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'List of Students');

  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return new Uint8Array(out);
}
