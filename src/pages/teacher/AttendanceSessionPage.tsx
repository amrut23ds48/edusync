import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  CalendarCheck,
  Sparkles,
  ArrowLeft,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Users,
  Search,
  FileBarChart2,
  Loader2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAcademic } from '../../context/AcademicContext';
import { useAuth } from '../../context/AuthContext';
import ContextBreadcrumb from '../../components/layout/ContextBreadcrumb';
import type {
  Student,
  TeachingPlanEntry,
  TimetableSlot,
  LectureMode,
  MappedCoOption,
} from '../../types';
import {
  saveAttendanceAndSyncReports,
  fetchAttendanceSession,
} from '../../services/attendanceService';
import { fetchTeachingPlanEntries } from '../../services/teachingPlanService';
import { requestAiTeachingPlanIct } from '../../services/cagsAiService';

export default function AttendanceSessionPage() {
  const { subjectId } = useParams<{ subjectId: string }>();
  const navigate = useNavigate();
  const { activeSubject, activeClass, isAuthorizedForSubject } = useAcademic();
  const { user, userProfile } = useAuth();


  // Core Data
  const [students, setStudents] = useState<Student[]>([]);
  const [teachingPlan, setTeachingPlan] = useState<TeachingPlanEntry[]>([]);
  const [timetableSlots, setTimetableSlots] = useState<TimetableSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);

  // Form State
  const [lectureDate, setLectureDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState('10:30');
  const [endTime, setEndTime] = useState('11:30');
  const [lectureMode, setLectureMode] = useState<LectureMode>('scheduled');
  const [selectedTpId, setSelectedTpId] = useState<string>('');
  const [topicCovered, setTopicCovered] = useState('');
  const [mappedCoCode, setMappedCoCode] = useState<MappedCoOption>('CO1');
  const [ictToolUsed, setIctToolUsed] = useState('Chalk Board, Presentation');
  const [remark, setRemark] = useState('');

  // Attendance Records (rollNo -> 'P' | 'A')
  const [records, setRecords] = useState<Record<string, 'P' | 'A'>>({});
  const [studentSearch, setStudentSearch] = useState('');

  // Edit Mode Detection (Gate M5-V2)
  const [isEditMode, setIsEditMode] = useState(false);
  const [editReason, setEditReason] = useState('');


  // Matched Timetable Slot
  const matchedSlot = useMemo(() => {
    if (!lectureDate || timetableSlots.length === 0) return null;
    const [y, m, d] = lectureDate.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    const dayOfWeek = dateObj.getDay(); // 0 = Sun, 1 = Mon ... 6 = Sat
    return (
      timetableSlots.find(
        (s) =>
          s.dayOfWeek === dayOfWeek &&
          s.status === 'active' &&
          lectureDate >= s.effectiveFrom &&
          lectureDate <= s.effectiveTo
      ) || null
    );
  }, [lectureDate, timetableSlots]);

  // Update times when matched slot changes and not in edit mode
  useEffect(() => {
    if (matchedSlot && !isEditMode) {
      setStartTime(matchedSlot.startTime);
      setEndTime(matchedSlot.endTime);
    }
  }, [matchedSlot, isEditMode]);

  // Load Initial Prerequisites
  useEffect(() => {
    async function loadData() {
      if (!subjectId || !activeClass) return;
      setLoading(true);
      try {
        // 1. Fetch Students
        const stuQ = query(
          collection(db, 'students'),
          where('classId', '==', activeClass.id),
          where('status', '==', 'active')
        );
        const stuSnap = await getDocs(stuQ);
        const stuList = stuSnap.docs
          .map((d) => ({ id: d.id, ...(d.data() as any) })) as Student[];
        stuList.sort((a, b) => a.rollNo - b.rollNo);
        setStudents(stuList);

        // Default all active students to 'P'
        const initialRecords: Record<string, 'P' | 'A'> = {};
        for (const s of stuList) {
          initialRecords[String(s.rollNo)] = 'P';
        }
        setRecords(initialRecords);

        // 2. Fetch Teaching Plan Entries
        const tpList = await fetchTeachingPlanEntries(subjectId);
        setTeachingPlan(tpList);
        if (tpList.length > 0) {
          // Select first pending topic by default
          const firstPending = tpList.find((t) => t.status === 'pending') || tpList[0];
          setSelectedTpId(firstPending.id);
          setTopicCovered(firstPending.topicTitle);
          setMappedCoCode(firstPending.mappedCoCode);
          setIctToolUsed(firstPending.ictToolUsed || 'Chalk Board, Presentation');
          setRemark(firstPending.remark || '');
        }

        // 3. Fetch Timetable Slots
        const ttQ = query(
          collection(db, 'timetables'),
          where('subjectId', '==', subjectId),
          where('status', '==', 'active')
        );
        const ttSnap = await getDocs(ttQ);
        setTimetableSlots(ttSnap.docs.map((d) => d.data() as TimetableSlot));
      } catch (err: any) {
        toast.error('Failed to load session prerequisites: ' + err.message);
      } finally {
        setLoading(false);
      }
    }

    if (subjectId && isAuthorizedForSubject(subjectId)) {
      loadData();
    }
  }, [subjectId, activeClass]);

  // Check if session already exists whenever date or startTime changes (Gate M5-V2)
  useEffect(() => {
    async function checkExisting() {
      if (!subjectId || !lectureDate || !startTime) return;
      const expectedId = `${subjectId}_${lectureDate}_${startTime}`;
      try {
        const existing = await fetchAttendanceSession(expectedId);
        if (existing) {
          setIsEditMode(true);
          setLectureMode(existing.lectureMode);
          setEndTime(existing.endTime);
          setTopicCovered(existing.topicCovered);
          setMappedCoCode(existing.mappedCoCode);
          setIctToolUsed(existing.ictToolUsed);
          setRemark(existing.remark || '');
          if (existing.teachingPlanEntryId) {
            setSelectedTpId(existing.teachingPlanEntryId);
          }
          if (existing.records && Object.keys(existing.records).length > 0) {
            setRecords(existing.records);
          }
        } else {
          setIsEditMode(false);
          setEditReason('');
        }
      } catch (err) {
        console.warn('Error checking existing session:', err);
      }
    }

    checkExisting();
  }, [subjectId, lectureDate, startTime]);

  // Topic selection handler
  const handleTopicChange = (tpId: string) => {
    setSelectedTpId(tpId);
    const chosen = teachingPlan.find((t) => t.id === tpId);
    if (chosen) {
      setTopicCovered(chosen.topicTitle);
      setMappedCoCode(chosen.mappedCoCode);
      if (chosen.ictToolUsed) setIctToolUsed(chosen.ictToolUsed);
      if (chosen.remark) setRemark(chosen.remark);
    }
  };

  // Lecture mode change handler
  const handleModeChange = (mode: LectureMode) => {
    setLectureMode(mode);
    if (mode === 'extra') {
      setRemark('Taken Extra Lecture');
    } else if (mode === 'online') {
      setRemark('Taken Online Lecture');
      setIctToolUsed('Online Tool');
    } else if (mode === 'cancelled') {
      setRemark('Lecture Cancelled');
    } else {
      if (remark === 'Taken Extra Lecture' || remark === 'Taken Online Lecture' || remark === 'Lecture Cancelled') {
        setRemark('');
      }
    }
  };

  // AI ICT Suggestion
  const handleAiSuggestIct = async () => {
    if (!activeSubject) return;
    setAiLoading(true);
    try {
      const selectedTp = teachingPlan.find((t) => t.id === selectedTpId);
      const chapter = selectedTp?.chapterTitle || 'Curriculum Module';
      const aiRes = await requestAiTeachingPlanIct(
        activeSubject.courseName,
        chapter,
        topicCovered || 'Course Topic',
        mappedCoCode,
        lectureMode
      );
      setIctToolUsed(aiRes.recommendedIct);
      if (aiRes.suggestedRemark) {
        setRemark(aiRes.suggestedRemark);
      }
      toast.success(`AI Recommended ICT: ${aiRes.recommendedIct}`);
    } catch (err: any) {
      toast.error('AI suggestion failed: ' + err.message);
    } finally {
      setAiLoading(false);
    }
  };

  // Roll call toggles
  const handleToggleStudent = (rollNoStr: string) => {
    if (lectureMode === 'cancelled') return;
    setRecords((prev) => ({
      ...prev,
      [rollNoStr]: prev[rollNoStr] === 'P' ? 'A' : 'P',
    }));
  };

  const handleMarkAll = (status: 'P' | 'A') => {
    if (lectureMode === 'cancelled') return;
    const updated: Record<string, 'P' | 'A'> = {};
    for (const s of students) {
      updated[String(s.rollNo)] = status;
    }
    setRecords(updated);
  };

  const handleInvert = () => {
    if (lectureMode === 'cancelled') return;
    const updated: Record<string, 'P' | 'A'> = {};
    for (const s of students) {
      const key = String(s.rollNo);
      updated[key] = records[key] === 'P' ? 'A' : 'P';
    }
    setRecords(updated);
  };

  // Attendance metrics summary
  const totalEnrolled = students.length;
  const presentCount =
    lectureMode === 'cancelled'
      ? 0
      : Object.values(records).filter((v) => v === 'P').length;
  const absentCount =
    lectureMode === 'cancelled' ? 0 : Math.max(0, totalEnrolled - presentCount);
  const attendancePercent =
    lectureMode === 'cancelled' || totalEnrolled === 0
      ? 0
      : Number(((presentCount / totalEnrolled) * 100).toFixed(1));

  // Save Session
  const handleSaveAttendance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subjectId || !activeClass || !activeSubject || !user) return;

    if (!topicCovered.trim()) {
      toast.error('Please specify or select the topic covered.');
      return;
    }

    setSaving(true);
    try {
      const activeStudentRollNos = students.map((s) => String(s.rollNo));

      await saveAttendanceAndSyncReports({
        academicYearId: activeClass.academicYearId,
        classId: activeClass.id,
        semesterNumber: activeClass.semesterNumber,
        subjectId,
        teacherUid: user.uid,
        actorRole: userProfile?.role || 'teacher',
        timetableSlotId: matchedSlot?.id || null,
        lectureMode,
        lectureDate,
        startTime,
        endTime,
        teachingPlanEntryId: selectedTpId || null,
        topicCovered: topicCovered.trim(),
        mappedCoCode,
        ictToolUsed: ictToolUsed.trim(),
        remark: remark.trim(),
        records,
        activeStudentRollNos,
        plannedTotalSessions: activeSubject.plannedTotalSessions || 44,
        isEdit: isEditMode,
        editSummary: isEditMode ? editReason.trim() : undefined,
      });

      toast.success(
        isEditMode
          ? 'Attendance updated successfully and audit log recorded!'
          : 'Lecture attendance saved and synced with Teaching Plan & Dashboard!'
      );

      navigate(`/teacher/subject/${subjectId}/cags`);
    } catch (err: any) {
      toast.error('Failed to save attendance: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const filteredStudents = students.filter(
    (s) =>
      String(s.rollNo).includes(studentSearch) ||
      s.studentName.toLowerCase().includes(studentSearch.toLowerCase())
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
        <Loader2 className="h-10 w-10 animate-spin text-brand-600 mb-3" />
        <p className="text-sm font-semibold text-slate-700">
          Loading student roster & lecture timetable...
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800 flex flex-col">
      <ContextBreadcrumb />

      {/* Header bar */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 shadow-2xs">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link
                to={`/teacher/subject/${subjectId}/cags`}
                className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Return to CAGS Workspace</span>
              </Link>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600 border border-brand-200">
                <CalendarCheck className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
                  {isEditMode ? 'Edit Lecture Attendance Session' : 'Record Lecture Attendance'}
                </h1>
                <p className="text-xs text-slate-500 font-medium">
                  {activeSubject?.courseCode} · Class {activeClass?.division} · Roll-call attendance with automated teaching plan sync.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              to={`/teacher/subject/${subjectId}/monthly-report`}
              className="btn-secondary !text-xs !py-2 !px-3.5 inline-flex items-center gap-1.5"
            >
              <FileBarChart2 className="h-4 w-4 text-emerald-600" />
              <span>Monthly Report</span>
            </Link>
            <Link
              to={`/teacher/subject/${subjectId}/teaching-plan`}
              className="btn-secondary !text-xs !py-2 !px-3.5 inline-flex items-center gap-1.5"
            >
              <span>View Teaching Plan</span>
            </Link>
          </div>
        </div>
      </div>

      <main className="flex-1 max-w-7xl mx-auto w-full p-6 sm:p-8 space-y-6">
        {/* Gate M5-V2 Edit Mode Notification Banner */}
        {isEditMode && (
          <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 flex items-start gap-3 shadow-xs animate-fade-in">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs space-y-1">
              <span className="font-bold text-amber-800">
                Existing Attendance Session Detected (Gate M5-V2: Edit Mode Active)
              </span>
              <p className="text-amber-700 leading-relaxed">
                A session was already recorded for date <code className="font-mono font-bold">{lectureDate}</code> at <code className="font-mono font-bold">{startTime}</code>. Modifying records will update the existing session rather than creating duplicate entries, and an immutable log entry will be saved to <code className="font-mono">audit_logs</code>.
              </p>
            </div>
          </div>
        )}

        <form onSubmit={handleSaveAttendance} className="space-y-6">
          {/* Card 1: Session Details & Timetable Matching */}
          <div className="glass-card p-6 bg-white border-slate-200 shadow-xs space-y-4">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Clock className="h-4 w-4 text-brand-600" />
              <span>Lecture Slot & Delivery Mode</span>
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Lecture Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={lectureDate}
                  onChange={(e) => setLectureDate(e.target.value)}
                  className="input-text w-full !text-xs font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Delivery Mode <span className="text-red-500">*</span>
                </label>
                <select
                  value={lectureMode}
                  onChange={(e) => handleModeChange(e.target.value as LectureMode)}
                  className="input-text w-full !text-xs font-semibold"
                >
                  <option value="scheduled">Scheduled (Regular Timetable)</option>
                  <option value="extra">Extra Lecture</option>
                  <option value="online">Online Lecture</option>
                  <option value="cancelled">Cancelled (No Class)</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Start Time <span className="text-red-500">*</span>
                </label>
                <input
                  type="time"
                  required
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="input-text w-full !text-xs font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  End Time <span className="text-red-500">*</span>
                </label>
                <input
                  type="time"
                  required
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="input-text w-full !text-xs font-mono"
                />
              </div>
            </div>

            {/* Timetable match badge */}
            <div className="pt-2 flex flex-wrap items-center gap-2 text-xs">
              <span className="font-semibold text-slate-500">Timetable Slot Match:</span>
              {matchedSlot ? (
                <span className="badge bg-emerald-50 text-emerald-700 border border-emerald-200 font-mono text-[11px] font-semibold">
                  ✓ Matched: {matchedSlot.dayName} ({matchedSlot.startTime} – {matchedSlot.endTime}) · Room {matchedSlot.roomNumber || 'CR-402'}
                </span>
              ) : (
                <span className="badge bg-slate-100 text-slate-600 border border-slate-200 text-[11px]">
                  Custom / Non-Timetable Slot (e.g. Extra / Rescheduled)
                </span>
              )}
            </div>
          </div>

          {/* Card 2: Syllabus Teaching Plan Sync & AI ICT Assistant */}
          <div className="glass-card p-6 bg-white border-slate-200 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-violet-600" />
                <span>Teaching Plan Link & AI ICT Delivery</span>
              </h2>

              <button
                type="button"
                onClick={handleAiSuggestIct}
                disabled={aiLoading}
                className="btn-secondary !text-xs !py-1.5 !px-3 inline-flex items-center gap-1.5 !border-violet-200 !text-violet-700 hover:!bg-violet-50"
              >
                {aiLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-600" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5 text-violet-600" />
                )}
                <span>Suggest ICT with AI</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div className="sm:col-span-2">
                <label className="block font-semibold text-slate-700 mb-1">
                  Link to Teaching Plan Topic
                </label>
                <select
                  value={selectedTpId}
                  onChange={(e) => handleTopicChange(e.target.value)}
                  className="input-text w-full !text-xs font-medium"
                >
                  <option value="">— Select from Teaching Plan —</option>
                  {teachingPlan.map((t) => (
                    <option key={t.id} value={t.id}>
                      Lect {t.sequenceNo} (Ch {t.chapterNo}): {t.topicTitle} [{t.mappedCoCode}] {t.status === 'completed' ? '(Completed)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Mapped CO</label>
                <select
                  value={mappedCoCode}
                  onChange={(e) => setMappedCoCode(e.target.value as MappedCoOption)}
                  className="input-text w-full !text-xs font-mono font-bold"
                >
                  <option value="CO1">CO1</option>
                  <option value="CO2">CO2</option>
                  <option value="CO3">CO3</option>
                  <option value="CO4">CO4</option>
                  <option value="-">- (Unmapped)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Topic Covered in Class <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Pure Strategy Nash Equilibrium in Oligopoly Models"
                value={topicCovered}
                onChange={(e) => setTopicCovered(e.target.value)}
                className="input-text w-full !text-xs font-medium"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">ICT Tool Used</label>
                <input
                  type="text"
                  placeholder="e.g. Chalk Board, Presentation"
                  value={ictToolUsed}
                  onChange={(e) => setIctToolUsed(e.target.value)}
                  className="input-text w-full !text-xs font-medium"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Teaching Remark</label>
                <input
                  type="text"
                  placeholder="e.g. Taken Extra Lecture or custom comment"
                  value={remark}
                  onChange={(e) => setRemark(e.target.value)}
                  className="input-text w-full !text-xs"
                />
              </div>
            </div>

            {isEditMode && (
              <div>
                <label className="block font-semibold text-amber-900 mb-1">
                  Reason for Attendance Correction (Audit Trail)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Corrected student 21DS03 attendance status"
                  value={editReason}
                  onChange={(e) => setEditReason(e.target.value)}
                  className="input-text w-full !text-xs !border-amber-300 focus:!border-amber-500"
                />
              </div>
            )}
          </div>

          {/* Card 3: Student Roll-Call Grid */}
          <div className="glass-card p-6 bg-white border-slate-200 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Users className="h-4 w-4 text-brand-600" />
                  <span>Student Roll-Call Roster</span>
                </h2>
                <p className="text-xs text-slate-500">
                  Tap or click to toggle attendance between Present (P) and Absent (A).
                </p>
              </div>

              {/* Roster KPI Pills */}
              <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
                <span className="badge bg-slate-100 text-slate-700 font-bold px-2.5 py-1">
                  Total: {totalEnrolled}
                </span>
                <span className="badge bg-emerald-100 text-emerald-800 font-bold px-2.5 py-1">
                  Present: {presentCount}
                </span>
                <span className="badge bg-red-100 text-red-800 font-bold px-2.5 py-1">
                  Absent: {absentCount}
                </span>
                <span className="badge bg-brand-100 text-brand-800 font-bold px-2.5 py-1">
                  {attendancePercent}%
                </span>
              </div>
            </div>

            {/* Bulk Actions & Search Filter */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search roll number or name..."
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                  className="input-text !pl-9 !py-1.5 !text-xs w-full"
                />
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => handleMarkAll('P')}
                  className="btn-secondary !text-[11px] !py-1.5 !px-3 font-semibold text-emerald-700 hover:bg-emerald-50"
                >
                  Mark All Present
                </button>
                <button
                  type="button"
                  onClick={() => handleMarkAll('A')}
                  className="btn-secondary !text-[11px] !py-1.5 !px-3 font-semibold text-red-700 hover:bg-red-50"
                >
                  Mark All Absent
                </button>
                <button
                  type="button"
                  onClick={handleInvert}
                  className="btn-secondary !text-[11px] !py-1.5 !px-3 font-semibold text-slate-700"
                >
                  Invert
                </button>
              </div>
            </div>

            {/* Grid of Student Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[500px] overflow-y-auto pr-1">
              {filteredStudents.map((s) => {
                const rollKey = String(s.rollNo);
                const isPresent = records[rollKey] === 'P';
                return (
                  <div
                    key={s.id}
                    onClick={() => handleToggleStudent(rollKey)}
                    className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition select-none ${
                      isPresent
                        ? 'bg-emerald-50/50 border-emerald-200 hover:bg-emerald-50'
                        : 'bg-red-50/50 border-red-200 hover:bg-red-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-mono font-black text-xs px-2 py-1 rounded bg-white border border-slate-200 text-slate-800 shadow-2xs">
                        {s.rollNo}
                      </span>
                      <div>
                        <div className="font-bold text-xs text-slate-900 leading-snug">
                          {s.studentName}
                        </div>
                        {s.learnerCategory && s.learnerCategory !== 'unclassified' && (
                          <span className="text-[10px] text-slate-400 capitalize">
                            {s.learnerCategory.replace('_', ' ')}
                          </span>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      className={`h-8 w-8 rounded-lg font-mono font-black text-xs flex items-center justify-center transition shadow-xs ${
                        isPresent
                          ? 'bg-emerald-600 text-white'
                          : 'bg-red-600 text-white'
                      }`}
                    >
                      {isPresent ? 'P' : 'A'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Form Actions Footer */}
          <div className="glass-card p-4 bg-white border-slate-200 shadow-xs flex items-center justify-between">
            <Link
              to={`/teacher/subject/${subjectId}/cags`}
              className="btn-secondary !text-xs !py-2.5 !px-4"
            >
              Cancel
            </Link>

            <button
              type="submit"
              disabled={saving}
              className="btn-primary !text-xs !py-2.5 !px-6 inline-flex items-center gap-2 shadow-sm"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              <span>
                {isEditMode ? 'Update Lecture Attendance' : 'Save Lecture Attendance & Sync Plan'}
              </span>
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
