import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { parseStudentRoster, generateStudentTemplateWorkbook } from '../services/excelImportService';

describe('Milestone 3: SheetJS Excel Import Engine (excelImportService)', () => {
  it('detects headers placed at Row 9 and parses valid students', () => {
    // Mimic cags-theory.xlsx "List of Students" structure where headers are at row 9
    const rawData = [
      ['COLLEGE OF ENGINEERING & TECHNOLOGY'],
      ['ACADEMIC YEAR 2025-26'],
      ['DEPARTMENT OF COMPUTER SCIENCE & ENGINEERING'],
      ['CLASS: BECSE-DS / VII'],
      [''],
      [''],
      [''],
      [''],
      ['Roll No.', 'Name of Students', 'Email', 'Contact No.'], // Row 9 (index 8)
      ['#N/A', '#N/A', '', ''], // Row 10 formula error artifact
      ['1', 'Aarav Sharma', 'aarav@test.edu', '9876543210'],
      ['2', 'Diya Patel', 'diya@test.edu', '9876543211'],
      ['3', 'Faizan Shaikh', 'faizan@test.edu', '9876543212'],
      ['', '', '', ''], // Blank row
    ];

    const ws = XLSX.utils.aoa_to_sheet(rawData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'List of Students');

    const result = parseStudentRoster(wb, new Set([1]));

    expect(result.headerRowNumber).toBe(9);
    expect(result.sheetName).toBe('List of Students');

    // Roll 1 was in existing set -> should be UPDATE
    expect(result.updateRows.length).toBe(1);
    expect(result.updateRows[0].rollNo).toBe(1);
    expect(result.updateRows[0].studentName).toBe('Aarav Sharma');
    expect(result.updateRows[0].action).toBe('UPDATE');

    // Rolls 2 and 3 -> should be CREATE
    expect(result.createRows.length).toBe(2);
    expect(result.createRows[0].rollNo).toBe(2);
    expect(result.createRows[1].rollNo).toBe(3);
    expect(result.createRows[0].action).toBe('CREATE');

    // Row 10 #N/A and blank row should be skipped cleanly (not in rejectRows)
    expect(result.rejectRows.length).toBe(0);
  });

  it('rejects malformed rows with missing names or invalid roll numbers', () => {
    const rawData = [
      ['Roll No', 'Student Name', 'Email'],
      ['abc', 'Valid Name but Bad Roll', 'bad@test.edu'], // Bad roll
      ['4', 'A', 'short@test.edu'], // Name too short (<2 chars)
      ['5', 'Zoya Akhtar', 'zoya@test.edu'], // Valid
    ];

    const ws = XLSX.utils.aoa_to_sheet(rawData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Students');

    const result = parseStudentRoster(wb, new Set());

    expect(result.createRows.length).toBe(1);
    expect(result.createRows[0].rollNo).toBe(5);
    expect(result.rejectRows.length).toBe(2);
    expect(result.rejectRows[0].reason).toContain('Invalid numeric Roll Number');
    expect(result.rejectRows[1].reason).toContain('missing or too short');
  });

  it('throws error when no headers are found in rows 1-15', () => {
    const rawData = [
      ['Random Data 1', 'Random Data 2'],
      ['Random Data 3', 'Random Data 4'],
    ];

    const ws = XLSX.utils.aoa_to_sheet(rawData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');

    expect(() => parseStudentRoster(wb, new Set())).toThrowError(/Could not detect "Roll No" and "Student Name"/);
  });

  it('generates a valid downloadable student template workbook', () => {
    const bytes = generateStudentTemplateWorkbook();
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(0);

    const wb = XLSX.read(bytes, { type: 'array' });
    expect(wb.SheetNames).toContain('List of Students');
    const ws = wb.Sheets['List of Students'];
    const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
    expect(rows[3]).toEqual(['Roll No.', 'Name of Students', 'Email', 'Contact No.']);
  });
});
