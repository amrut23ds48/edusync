import { useState, useEffect, useMemo, type FormEvent, type ChangeEvent } from 'react';
import { 
  collection, 
  doc, 
  onSnapshot, 
  query, 
  where, 
  setDoc, 
  updateDoc, 
  serverTimestamp 
} from 'firebase/firestore';
import * as XLSX from 'xlsx';
import toast from 'react-hot-toast';
import { 
  Users, 
  Upload, 
  Plus, 
  Download, 
  Search, 
  Edit2, 
  Archive, 
  FileSpreadsheet, 
  CheckCircle2, 
  X, 
  Loader2, 
  Filter
} from 'lucide-react';
import { db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { useAcademic } from '../../context/AcademicContext';
import { 
  readExcelFile, 
  parseStudentRoster, 
  commitStudentImportBatch, 
  generateStudentTemplateWorkbook,
  type ParseRosterResult 
} from '../../services/excelImportService';
import type { Student, LearnerCategory } from '../../types';

export default function Tab2StudentList() {
  const { user } = useAuth();
  const { activeSubject, activeClass, activeAcademicYear } = useAcademic();

  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');

  // Modals
  const [showImportModal, setShowImportModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);

  // Manual Form State
  const [formRollNo, setFormRollNo] = useState<number | ''>('');
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formContact, setFormContact] = useState('');
  const [formCategory, setFormCategory] = useState<LearnerCategory>('unclassified');
  const [submittingManual, setSubmittingManual] = useState(false);

  // Import Modal State
  const [importFile, setImportFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseResult, setParseResult] = useState<ParseRosterResult | null>(null);
  const [previewTab, setPreviewTab] = useState<'create' | 'update' | 'reject'>('create');
  const [importing, setImporting] = useState(false);

  // 1. Real-time subscription to class students
  useEffect(() => {
    if (!activeClass?.id) {
      setStudents([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const q = query(
      collection(db, 'students'),
      where('classId', '==', activeClass.id),
      where('status', '==', 'active')
    );

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const list: Student[] = [];
        snapshot.forEach((d) => list.push(d.data() as Student));
        list.sort((a, b) => a.rollNo - b.rollNo);
        setStudents(list);
        setLoading(false);
      },
      (err) => {
        console.error('[EduSync] Error listening to students:', err);
        toast.error('Failed to load students roster.');
        setLoading(false);
      }
    );

    return () => unsub();
  }, [activeClass?.id]);

  // Existing Roll Numbers Set for fast lookup
  const existingRollSet = useMemo(() => {
    return new Set(students.map((s) => s.rollNo));
  }, [students]);

  // Filtered Roster
  const filteredStudents = useMemo(() => {
    return students.filter((s) => {
      const matchSearch =
        s.rollNo.toString().includes(search) ||
        s.studentName.toLowerCase().includes(search.toLowerCase()) ||
        (s.email && s.email.toLowerCase().includes(search.toLowerCase())) ||
        (s.contactNo && s.contactNo.includes(search));

      const matchCategory =
        categoryFilter === 'ALL' || s.learnerCategory === categoryFilter;

      return matchSearch && matchCategory;
    });
  }, [students, search, categoryFilter]);

  // 2. Handle File Upload & Parsing
  async function handleFileSelect(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportFile(file);
    setParsing(true);
    setParseResult(null);

    try {
      const wb = await readExcelFile(file);
      const parsed = parseStudentRoster(wb, existingRollSet);
      setParseResult(parsed);

      if (parsed.createRows.length > 0) {
        setPreviewTab('create');
      } else if (parsed.updateRows.length > 0) {
        setPreviewTab('update');
      } else {
        setPreviewTab('reject');
      }

      toast.success(
        `Parsed ${parsed.totalScannedRows} rows: ${parsed.createRows.length} new, ${parsed.updateRows.length} updates.`
      );
    } catch (err: any) {
      console.error('[EduSync] Excel parse error:', err);
      toast.error(err?.message || 'Failed to parse Excel file.');
    } finally {
      setParsing(false);
    }
  }

  // 3. Confirm and Commit Import Batch
  async function handleCommitImport() {
    if (!parseResult || !activeClass || !activeSubject || !user) return;

    setImporting(true);
    try {
      const res = await commitStudentImportBatch({
        classId: activeClass.id,
        subjectId: activeSubject.id,
        academicYearId: activeSubject.academicYearId || activeClass.academicYearId,
        fileName: importFile?.name || 'roster.xlsx',
        uploadedBy: user.uid,
        createRows: parseResult.createRows,
        updateRows: parseResult.updateRows,
        rejectRows: parseResult.rejectRows,
      });

      toast.success(
        `Import complete! Created ${res.created} and updated ${res.updated} students.`
      );
      setShowImportModal(false);
      setImportFile(null);
      setParseResult(null);
    } catch (err: any) {
      console.error('[EduSync] Batch commit error:', err);
      toast.error(err?.message || 'Failed to commit student batch.');
    } finally {
      setImporting(false);
    }
  }

  // 4. Download Blank Template
  function handleDownloadTemplate() {
    const bytes = generateStudentTemplateWorkbook();
    const blob = new Blob([bytes.buffer as ArrayBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `student_roster_template_${activeSubject?.courseCode || 'course'}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Downloaded student roster template.');
  }

  // 5. Export Current Roster
  function handleExportRoster() {
    if (students.length === 0) {
      toast.error('No students to export.');
      return;
    }

    const exportRows = students.map((s) => ({
      'Roll No.': s.rollNo,
      'Student Name': s.studentName,
      'Email': s.email || '',
      'Contact No.': s.contactNo || '',
      'Learner Category': s.learnerCategory,
      'Class': activeClass?.division || '',
      'Course': `${activeSubject?.courseCode || ''} - ${activeSubject?.courseName || ''}`,
    }));

    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'List of Students');
    XLSX.writeFile(wb, `Students_${activeClass?.division.replace(/[^a-z0-9]/gi, '_')}.xlsx`);
    toast.success('Roster exported successfully.');
  }

  // 6. Manual Student Addition / Edit
  function openAddModal() {
    setEditingStudent(null);
    setFormRollNo(students.length > 0 ? Math.max(...students.map((s) => s.rollNo)) + 1 : 1);
    setFormName('');
    setFormEmail('');
    setFormContact('');
    setFormCategory('unclassified');
    setShowAddModal(true);
  }

  function openEditModal(student: Student) {
    setEditingStudent(student);
    setFormRollNo(student.rollNo);
    setFormName(student.studentName);
    setFormEmail(student.email || '');
    setFormContact(student.contactNo || '');
    setFormCategory(student.learnerCategory);
    setShowAddModal(true);
  }

  async function handleSaveManual(e: FormEvent) {
    e.preventDefault();
    if (!activeClass || !activeSubject || !user || formRollNo === '') return;

    setSubmittingManual(true);
    try {
      const studentId = `${activeClass.id}_${formRollNo}`;
      const docRef = doc(db, 'students', studentId);

      const data: Partial<Student> & Record<string, any> = {
        id: studentId,
        classId: activeClass.id,
        academicYearId: activeSubject.academicYearId || activeClass.academicYearId,
        rollNo: Number(formRollNo),
        studentName: formName.trim(),
        email: formEmail.trim(),
        contactNo: formContact.trim(),
        learnerCategory: formCategory,
        authorizedSubjectId: activeSubject.id,
        status: 'active',
        updatedBy: user.uid,
        updatedAt: serverTimestamp(),
      };

      if (!editingStudent) {
        data.createdAt = serverTimestamp();
        data.createdBy = user.uid;
      }

      await setDoc(docRef, data, { merge: true });
      toast.success(editingStudent ? 'Student details updated.' : `Student Roll ${formRollNo} added.`);
      setShowAddModal(false);
    } catch (err: any) {
      console.error('[EduSync] Student save error:', err);
      toast.error(err?.message || 'Failed to save student.');
    } finally {
      setSubmittingManual(false);
    }
  }

  // 7. Toggle Learner Category Quick Action
  async function handleToggleCategory(student: Student, nextCategory: LearnerCategory) {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'students', student.id), {
        learnerCategory: nextCategory,
        authorizedSubjectId: activeSubject?.id,
        updatedBy: user.uid,
        updatedAt: serverTimestamp(),
      });
      toast.success(`Roll ${student.rollNo} set to ${nextCategory.replace('_', ' ')}.`);
    } catch {
      toast.error('Failed to update learner category.');
    }
  }

  // 8. Soft Archive Student
  async function handleArchiveStudent(student: Student) {
    if (!user) return;
    if (!confirm(`Are you sure you want to archive student Roll ${student.rollNo} (${student.studentName})?`)) return;

    try {
      await updateDoc(doc(db, 'students', student.id), {
        status: 'archived',
        authorizedSubjectId: activeSubject?.id,
        updatedBy: user.uid,
        updatedAt: serverTimestamp(),
      });
      toast.success(`Student Roll ${student.rollNo} archived.`);
    } catch {
      toast.error('Failed to archive student.');
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Banner & Action Buttons */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <span>List of Students (Roster)</span>
            <span className="badge bg-brand-50 text-brand-700 border border-brand-200">
              {students.length} Total
            </span>
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Sheet 2 · Class cohort {activeClass?.division} · Academic Year {activeAcademicYear?.yearLabel}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleDownloadTemplate}
            className="btn-secondary !py-2 !px-3 !text-xs"
            title="Download blank Excel roster template"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
            <span>Template</span>
          </button>

          <button
            type="button"
            onClick={handleExportRoster}
            className="btn-secondary !py-2 !px-3 !text-xs"
            title="Export roster to Excel"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export</span>
          </button>

          <button
            type="button"
            onClick={() => setShowImportModal(true)}
            className="btn-secondary !py-2 !px-3 !text-xs border-brand-300 text-brand-700 hover:bg-brand-50 shadow-2xs"
          >
            <Upload className="h-3.5 w-3.5 text-brand-600" />
            <span>Import Excel</span>
          </button>

          <button
            type="button"
            onClick={openAddModal}
            className="btn-primary !py-2 !px-3.5 !text-xs shadow-glow"
          >
            <Plus className="h-4 w-4" />
            <span>Add Student</span>
          </button>
        </div>
      </div>

      {/* Search and Category Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by roll number, name, email, phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-field !pl-9 text-xs"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-slate-400 shrink-0" />
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="input-field !py-1.5 !text-xs"
          >
            <option value="ALL">All Learner Categories</option>
            <option value="unclassified">Unclassified</option>
            <option value="slow_learner">Slow Learners</option>
            <option value="advanced_learner">Advanced Learners</option>
          </select>
        </div>
      </div>

      {/* Roster Table */}
      <div className="glass-card overflow-hidden">
        {loading ? (
          <div className="p-12 text-center">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-brand-600 mb-2" />
            <p className="text-xs font-medium text-slate-500">Loading roster...</p>
          </div>
        ) : filteredStudents.length === 0 ? (
          <div className="p-12 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
              <Users className="h-6 w-6" />
            </div>
            <p className="text-sm font-bold text-slate-800">No Students Found</p>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              {search || categoryFilter !== 'ALL'
                ? 'No students match your active filter.'
                : 'Upload the official class roster from Excel using "Import Excel" or add students manually.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50/80 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase">
                <tr>
                  <th className="py-3 px-5 w-24">Roll No.</th>
                  <th className="py-3 px-5">Student Name</th>
                  <th className="py-3 px-5">Email</th>
                  <th className="py-3 px-5">Contact No.</th>
                  <th className="py-3 px-5">Learner Classification</th>
                  <th className="py-3 px-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredStudents.map((student) => (
                  <tr key={student.id} className="hover:bg-slate-50/60 transition">
                    <td className="py-3 px-5 font-mono font-bold text-slate-900">
                      {String(student.rollNo).padStart(2, '0')}
                    </td>
                    <td className="py-3 px-5 font-medium text-slate-800">
                      {student.studentName}
                    </td>
                    <td className="py-3 px-5 font-mono text-xs text-slate-500">
                      {student.email || '—'}
                    </td>
                    <td className="py-3 px-5 font-mono text-xs text-slate-500">
                      {student.contactNo || '—'}
                    </td>
                    <td className="py-3 px-5">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            handleToggleCategory(
                              student,
                              student.learnerCategory === 'slow_learner'
                                ? 'unclassified'
                                : 'slow_learner'
                            )
                          }
                          className={`px-2 py-0.5 rounded text-[11px] font-bold transition ${
                            student.learnerCategory === 'slow_learner'
                              ? 'bg-amber-100 text-amber-800 border border-amber-300'
                              : 'bg-slate-100 text-slate-500 hover:bg-amber-50 hover:text-amber-700'
                          }`}
                          title="Click to toggle Slow Learner"
                        >
                          Slow
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleToggleCategory(
                              student,
                              student.learnerCategory === 'advanced_learner'
                                ? 'unclassified'
                                : 'advanced_learner'
                            )
                          }
                          className={`px-2 py-0.5 rounded text-[11px] font-bold transition ${
                            student.learnerCategory === 'advanced_learner'
                              ? 'bg-purple-100 text-purple-800 border border-purple-300'
                              : 'bg-slate-100 text-slate-500 hover:bg-purple-50 hover:text-purple-700'
                          }`}
                          title="Click to toggle Advanced Learner"
                        >
                          Advanced
                        </button>
                      </div>
                    </td>
                    <td className="py-3 px-5 text-right space-x-1">
                      <button
                        type="button"
                        onClick={() => openEditModal(student)}
                        className="text-slate-400 hover:text-brand-600 transition p-1"
                        title="Edit student"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleArchiveStudent(student)}
                        className="text-slate-400 hover:text-red-600 transition p-1"
                        title="Archive student"
                      >
                        <Archive className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: Import from Excel */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="glass-card max-w-3xl w-full max-h-[90vh] flex flex-col bg-white relative rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
            {/* Header */}
            <div className="p-5 border-b border-slate-100 flex items-start justify-between shrink-0 bg-white">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-100 shrink-0">
                  <FileSpreadsheet className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Import Students (CSV / Excel)</h3>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    Upload .csv or .xlsx (e.g. students_sample_roster.csv)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowImportModal(false);
                  setImportFile(null);
                  setParseResult(null);
                }}
                className="text-slate-400 hover:text-slate-600 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Scrollable Body */}
            <div className="p-5 overflow-y-auto flex-1 space-y-4">
              {/* File Dropzone */}
              {!parseResult && (
                <div className="border-2 border-dashed border-slate-200 hover:border-brand-500 rounded-2xl p-8 text-center transition bg-slate-50/50 hover:bg-brand-50/20">
                  <Upload className="mx-auto h-8 w-8 text-slate-400 mb-3" />
                  <p className="text-sm font-bold text-slate-700">Choose student roster workbook</p>
                  <p className="text-xs text-slate-400 mt-1 mb-4">
                    Supports .xlsx, .xls, and .csv files. Automatically discovers headers and skips formula artifacts.
                  </p>
                  <label className="btn-primary inline-flex cursor-pointer !text-xs !py-2 !px-4">
                    <span>Browse File</span>
                    <input
                      type="file"
                      accept=".xlsx, .xls, .csv"
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                  </label>
                  {parsing && (
                    <div className="mt-4 flex items-center justify-center gap-2 text-xs text-brand-700 font-medium">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Parsing rows and verifying headers...</span>
                    </div>
                  )}
                </div>
              )}

              {/* Preview Table */}
              {parseResult && (
                <div className="space-y-4">
                  {/* Summary Pills */}
                  <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                    <div className="text-xs">
                      <span className="text-slate-500 font-medium">Sheet Scanned:</span>{' '}
                      <span className="font-bold text-slate-800 font-mono">"{parseResult.sheetName}"</span> ·{' '}
                      <span className="text-slate-500 font-medium">Header Row:</span>{' '}
                      <span className="font-bold text-slate-800">#{parseResult.headerRowNumber}</span>
                    </div>

                    <div className="flex items-center gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => setPreviewTab('create')}
                        className={`px-3 py-1 rounded-lg font-bold transition flex items-center gap-1.5 ${
                          previewTab === 'create'
                            ? 'bg-emerald-600 text-white shadow-2xs'
                            : 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                        }`}
                      >
                        <span>New:</span>
                        <span className="font-mono">{parseResult.createRows.length}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setPreviewTab('update')}
                        className={`px-3 py-1 rounded-lg font-bold transition flex items-center gap-1.5 ${
                          previewTab === 'update'
                            ? 'bg-blue-600 text-white shadow-2xs'
                            : 'bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100'
                        }`}
                      >
                        <span>Updates:</span>
                        <span className="font-mono">{parseResult.updateRows.length}</span>
                      </button>

                      {parseResult.rejectRows.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setPreviewTab('reject')}
                          className={`px-3 py-1 rounded-lg font-bold transition flex items-center gap-1.5 ${
                            previewTab === 'reject'
                              ? 'bg-red-600 text-white shadow-2xs'
                              : 'bg-red-50 text-red-700 border border-red-200 hover:bg-red-100'
                          }`}
                        >
                          <span>Rejected:</span>
                          <span className="font-mono">{parseResult.rejectRows.length}</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Preview Items */}
                  <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-200">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 sticky top-0 border-b border-slate-200 font-semibold text-slate-600">
                        <tr>
                          <th className="py-2.5 px-3 w-16">Row</th>
                          <th className="py-2.5 px-3 w-20">Roll</th>
                          <th className="py-2.5 px-3">Name</th>
                          {previewTab !== 'reject' ? (
                            <>
                              <th className="py-2.5 px-3">Email</th>
                              <th className="py-2.5 px-3">Contact</th>
                            </>
                          ) : (
                            <th className="py-2.5 px-3 text-red-700">Rejection Reason</th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium">
                        {previewTab === 'create' &&
                          parseResult.createRows.map((r) => (
                            <tr key={r.rowNumber} className="hover:bg-slate-50/50">
                              <td className="py-2 px-3 text-slate-400 font-mono">#{r.rowNumber}</td>
                              <td className="py-2 px-3 font-mono font-bold text-emerald-700">{r.rollNo}</td>
                              <td className="py-2 px-3 text-slate-800">{r.studentName}</td>
                              <td className="py-2 px-3 text-slate-500 font-mono">{r.email || '—'}</td>
                              <td className="py-2 px-3 text-slate-500 font-mono">{r.contactNo || '—'}</td>
                            </tr>
                          ))}

                        {previewTab === 'update' &&
                          parseResult.updateRows.map((r) => (
                            <tr key={r.rowNumber} className="hover:bg-slate-50/50">
                              <td className="py-2 px-3 text-slate-400 font-mono">#{r.rowNumber}</td>
                              <td className="py-2 px-3 font-mono font-bold text-blue-700">{r.rollNo}</td>
                              <td className="py-2 px-3 text-slate-800">{r.studentName}</td>
                              <td className="py-2 px-3 text-slate-500 font-mono">{r.email || '—'}</td>
                              <td className="py-2 px-3 text-slate-500 font-mono">{r.contactNo || '—'}</td>
                            </tr>
                          ))}

                        {previewTab === 'reject' &&
                          parseResult.rejectRows.map((r) => (
                            <tr key={r.rowNumber} className="bg-red-50/30 hover:bg-red-50/50">
                              <td className="py-2 px-3 text-slate-400 font-mono">#{r.rowNumber}</td>
                              <td className="py-2 px-3 font-mono font-bold text-red-700">{r.rawRollNo || '—'}</td>
                              <td className="py-2 px-3 text-slate-700">{r.rawName || '—'}</td>
                              <td className="py-2 px-3 text-red-600 font-semibold">{r.reason}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>

                  <p className="text-[11px] text-slate-400 italic">
                    Idempotent commit: Re-uploading this roster will update existing records in place without duplicating documents.
                  </p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between shrink-0">
              <button
                type="button"
                onClick={() => {
                  setShowImportModal(false);
                  setImportFile(null);
                  setParseResult(null);
                }}
                className="btn-secondary !text-xs"
              >
                Cancel
              </button>

              {parseResult && (
                <div className="flex items-center gap-2">
                  <label className="btn-secondary !text-xs cursor-pointer">
                    <span>Re-select File</span>
                    <input
                      type="file"
                      accept=".xlsx, .xls, .csv"
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                  </label>

                  <button
                    type="button"
                    onClick={handleCommitImport}
                    disabled={importing || (parseResult.createRows.length === 0 && parseResult.updateRows.length === 0)}
                    className="btn-primary !text-xs"
                  >
                    {importing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4" />
                    )}
                    <span>
                      Import {parseResult.createRows.length + parseResult.updateRows.length} Students
                    </span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal: Manual Add / Edit Student */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="glass-card max-w-md w-full p-6 bg-white relative rounded-2xl shadow-2xl border border-slate-200">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">
                {editingStudent ? 'Edit Student Details' : 'Add Single Student'}
              </h3>
              <button type="button" onClick={() => setShowAddModal(false)}>
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>

            <form onSubmit={handleSaveManual} className="mt-4 space-y-3.5">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-1">
                  <label className="block text-xs font-bold text-slate-700 mb-1">Roll No.</label>
                  <input
                    type="number"
                    min="1"
                    required
                    disabled={!!editingStudent}
                    value={formRollNo}
                    onChange={(e) => setFormRollNo(e.target.value === '' ? '' : Number(e.target.value))}
                    className="input-field font-mono font-bold"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">Student Full Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Aarav Sharma"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="input-field"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Email Address</label>
                <input
                  type="email"
                  placeholder="student@institution.edu"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  className="input-field"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Contact Number</label>
                <input
                  type="text"
                  placeholder="10-digit mobile number"
                  value={formContact}
                  onChange={(e) => setFormContact(e.target.value)}
                  className="input-field font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Learner Classification</label>
                <select
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value as LearnerCategory)}
                  className="input-field"
                >
                  <option value="unclassified">Unclassified</option>
                  <option value="slow_learner">Slow Learner</option>
                  <option value="advanced_learner">Advanced Learner</option>
                </select>
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t mt-4">
                <button type="button" onClick={() => setShowAddModal(false)} className="btn-secondary !text-xs">
                  Cancel
                </button>
                <button type="submit" disabled={submittingManual} className="btn-primary !text-xs">
                  {submittingManual ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Save Student
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
