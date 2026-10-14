import { useState, useMemo, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  doc, 
  getDoc, 
  getDocs 
} from 'firebase/firestore';
import { 
  BookOpen, 
  GraduationCap, 
  Calendar, 
  ArrowRight, 
  LogOut, 
  ShieldCheck, 
  Search,
  Filter,
  Loader2,
  Building2,
  Clock,
  CheckCircle2,
  CalendarDays,
  X,
} from 'lucide-react';
import { db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { useAcademic } from '../../context/AcademicContext';
import type { TimetableSlot, Subject, CourseOutcome, TeacherAssignment } from '../../types';

export default function TeacherHomeSelector() {
  const { userProfile, logout } = useAuth();
  const { assignments, loading, selectSubject } = useAcademic();
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const [yearFilter, setYearFilter] = useState('ALL');

  // Timetable State
  const [timetableSlots, setTimetableSlots] = useState<TimetableSlot[]>([]);
  const [loadingTimetable, setLoadingTimetable] = useState(true);
  const [showTimetableModal, setShowTimetableModal] = useState(false);

  // Syllabus Preview Modal State
  const [selectedSubjectForSyllabus, setSelectedSubjectForSyllabus] = useState<Subject | null>(null);
  const [subjectCos, setSubjectCos] = useState<CourseOutcome[]>([]);
  const [showSyllabusModal, setShowSyllabusModal] = useState(false);
  const [loadingSyllabus, setLoadingSyllabus] = useState(false);

  // Real-time subscription to teacher's timetable slots
  useEffect(() => {
    if (!userProfile?.uid) return;
    const q = query(
      collection(db, 'timetables'),
      where('teacherUid', '==', userProfile.uid),
      where('status', '==', 'active')
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const slots: TimetableSlot[] = [];
        snap.forEach((d) => slots.push({ id: d.id, ...(d.data() as any) }));
        setTimetableSlots(slots);
        setLoadingTimetable(false);
      },
      (err) => {
        console.warn('Error fetching timetables:', err);
        setLoadingTimetable(false);
      }
    );
    return () => unsub();
  }, [userProfile?.uid]);

  // Today's Date String and Day of Week
  const { todayDateStr, todayFormatted, todayDayOfWeek } = useMemo(() => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return {
      todayDateStr: `${yyyy}-${mm}-${dd}`,
      todayFormatted: now.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' }),
      todayDayOfWeek: now.getDay(), // 0 = Sun, 1 = Mon...
    };
  }, []);

  // Today's scheduled timetable slots
  const todaySlots = useMemo(() => {
    return timetableSlots
      .filter((s) => s.dayOfWeek === todayDayOfWeek)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [timetableSlots, todayDayOfWeek]);

  // Open Syllabus Modal for a course
  async function handleOpenSyllabusModal(assignment: TeacherAssignment) {
    setShowSyllabusModal(true);
    setLoadingSyllabus(true);
    setSelectedSubjectForSyllabus(null);
    setSubjectCos([]);

    try {
      // 1. Fetch Subject doc
      const subSnap = await getDoc(doc(db, 'subjects', assignment.subjectId));
      if (subSnap.exists()) {
        setSelectedSubjectForSyllabus({ id: subSnap.id, ...(subSnap.data() as any) });
      } else {
        setSelectedSubjectForSyllabus({
          id: assignment.subjectId,
          departmentId: assignment.departmentId,
          classId: assignment.classId,
          classDivision: assignment.classDivision,
          academicYearId: assignment.academicYearId,
          courseCode: assignment.courseCode,
          courseName: assignment.courseName,
          courseType: 'theory',
          totalSyllabusHours: 39,
          plannedTotalSessions: 44,
          conductedSessionsCount: 0,
          status: 'active',
        });
      }

      // 2. Fetch Course Outcomes
      const cosQuery = query(collection(db, 'course_outcomes'), where('subjectId', '==', assignment.subjectId));
      const cosSnap = await getDocs(cosQuery);
      const cosList: CourseOutcome[] = [];
      cosSnap.forEach((d) => cosList.push(d.data() as CourseOutcome));
      cosList.sort((a, b) => a.coNumber - b.coNumber);
      setSubjectCos(cosList);
    } catch (err) {
      console.error('Failed to load syllabus/COs:', err);
    } finally {
      setLoadingSyllabus(false);
    }
  }

  // Distinct academic years for filter
  const availableYears = useMemo(() => {
    const set = new Set<string>();
    assignments.forEach((a) => {
      if (a.academicYearId) set.add(a.academicYearId);
    });
    return Array.from(set);
  }, [assignments]);

  // Filtered assignments
  const filteredAssignments = useMemo(() => {
    return assignments.filter((a) => {
      const matchSearch =
        a.courseCode.toLowerCase().includes(search.toLowerCase()) ||
        a.courseName.toLowerCase().includes(search.toLowerCase()) ||
        a.classDivision.toLowerCase().includes(search.toLowerCase());

      const matchYear = yearFilter === 'ALL' || a.academicYearId === yearFilter;
      return matchSearch && matchYear;
    });
  }, [assignments, search, yearFilter]);

  function handleOpenSubject(subjectId: string) {
    selectSubject(subjectId);
    navigate(`/teacher/subject/${subjectId}/cags`);
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800 flex flex-col">
      {/* Top Navbar */}
      <header className="border-b border-slate-200 bg-white px-6 py-4 sticky top-0 z-10 shadow-xs">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-600 to-violet-600 text-white shadow-glow">
              <GraduationCap className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-900 leading-tight">EduSync Portal</h1>
              <p className="text-[11px] font-medium text-slate-400">Teacher Workspace · Course Articulation</p>
            </div>
          </div>

          {/* User profile & Sign out */}
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex flex-col text-right">
              <span className="text-xs font-bold text-slate-800">{userProfile?.displayName}</span>
              <span className="text-[11px] text-slate-500">{userProfile?.email}</span>
            </div>
            <button
              type="button"
              onClick={() => setShowTimetableModal(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-100 transition shadow-2xs active:scale-95"
            >
              <CalendarDays className="h-3.5 w-3.5" />
              <span>Weekly Timetable</span>
            </button>
            <button
              id="teacher-logout"
              type="button"
              onClick={() => void logout()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 hover:text-red-600 transition active:scale-95"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Sign out</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-6xl mx-auto w-full p-6 sm:p-8 animate-fade-up">
        {/* Welcome Banner */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-brand-700 via-brand-600 to-indigo-700 p-6 sm:p-8 text-white shadow-lg mb-8">
          <div className="relative z-10">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-brand-100 backdrop-blur-md mb-3 border border-white/20">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Faculty Member</span>
              {userProfile?.departmentName && (
                <>
                  <span>·</span>
                  <span>{userProfile.departmentName}</span>
                </>
              )}
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Welcome back, {userProfile?.displayName?.split(' ')[0] || 'Professor'}!
            </h2>
            <p className="mt-1 text-sm text-brand-100 max-w-xl">
              Select an assigned course to manage student rosters, CO-PO articulation matrices, mapping calculations, and lecture attendance.
            </p>
          </div>
        </div>

        {/* Today's Timetable Widget */}
        <div className="mb-8 rounded-2xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-700 border border-brand-100">
                <Clock className="h-4 w-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-slate-900">Today's Scheduled Lectures</h3>
                  <span className="badge bg-brand-50 text-brand-700 font-mono text-[10px]">
                    {todayFormatted}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Direct access to 1-click attendance synchronization for today's classes.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowTimetableModal(true)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 hover:text-brand-800"
            >
              <span>View Full Weekly Timetable</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {loadingTimetable ? (
            <div className="py-6 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-brand-600" />
              <span>Loading today's schedule...</span>
            </div>
          ) : todaySlots.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-5 text-center">
              <p className="text-xs font-medium text-slate-600">
                No lectures scheduled for today ({todayFormatted}). Enjoy your planning or office hours!
              </p>
              <button
                type="button"
                onClick={() => setShowTimetableModal(true)}
                className="mt-2 text-xs font-bold text-brand-600 hover:underline"
              >
                Check your full weekly timetable schedule →
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {todaySlots.map((slot) => (
                <div
                  key={slot.id}
                  className="p-4 rounded-xl border border-slate-200 bg-gradient-to-br from-white to-slate-50/50 hover:border-brand-300 transition shadow-2xs flex flex-col justify-between space-y-3"
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-brand-50 text-brand-700 font-mono font-bold text-xs border border-brand-200">
                        <Clock className="h-3 w-3" />
                        {slot.startTime} – {slot.endTime}
                      </span>
                      <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                        {slot.roomNumber || 'Room TBA'}
                      </span>
                    </div>
                    <h4 className="text-sm font-bold text-slate-900 line-clamp-1">{slot.courseName}</h4>
                    <p className="text-xs text-slate-500 font-medium">
                      {slot.courseCode} · {slot.classDivision}
                    </p>
                  </div>

                  <Link
                    to={`/teacher/subject/${slot.subjectId}/attendance?date=${todayDateStr}&time=${slot.startTime}`}
                    className="w-full btn-primary !py-2 !text-xs justify-between bg-emerald-600 hover:bg-emerald-700"
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Take Attendance
                    </span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Filter & Search Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search course code, name, or division..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-field !pl-9 text-xs"
            />
          </div>

          {availableYears.length > 1 && (
            <div className="flex items-center gap-2">
              <Filter className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <select
                value={yearFilter}
                onChange={(e) => setYearFilter(e.target.value)}
                className="input-field !py-2 !text-xs"
              >
                <option value="ALL">All Academic Years</option>
                {availableYears.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Loading State */}
        {loading ? (
          <div className="glass-card p-12 text-center">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-brand-600 mb-3" />
            <p className="text-sm font-medium text-slate-600">Loading your assigned courses...</p>
          </div>
        ) : filteredAssignments.length === 0 ? (
          /* Empty State */
          <div className="glass-card p-12 text-center max-w-lg mx-auto">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 border border-amber-200">
              <BookOpen className="h-7 w-7" />
            </div>
            <h3 className="text-base font-bold text-slate-900">No Course Assignments Found</h3>
            <p className="mt-1.5 text-xs text-slate-500 max-w-sm mx-auto">
              {search || yearFilter !== 'ALL'
                ? 'No assigned subjects match your search filter.'
                : 'You currently have no active course assignments. Please contact the Super Admin to map your semester teaching assignments.'}
            </p>
          </div>
        ) : (
          /* Course Cards Grid */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredAssignments.map((assignment) => (
              <div
                key={assignment.id}
                className="glass-card p-6 flex flex-col justify-between hover:shadow-xl transition-all duration-200 border border-slate-200/90 group"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-mono text-xs font-extrabold px-2.5 py-1 rounded-lg bg-brand-50 text-brand-700 border border-brand-200 shadow-2xs">
                      {assignment.courseCode}
                    </span>
                    <span className="badge bg-emerald-50 text-emerald-700 border border-emerald-200">
                      Active
                    </span>
                  </div>

                  <h3 className="text-base font-bold text-slate-900 group-hover:text-brand-700 transition line-clamp-2 mb-2">
                    {assignment.courseName}
                  </h3>

                  <div className="space-y-1.5 text-xs text-slate-500 mb-5">
                    <div className="flex items-center gap-2">
                      <GraduationCap className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      <span className="font-medium text-slate-700">{assignment.classDivision}</span>
                    </div>
                    {assignment.departmentId && (
                      <div className="flex items-center gap-2">
                        <Building2 className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">{assignment.departmentId.replace('dept_', '').toUpperCase()}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      <span>Year: {assignment.academicYearId || '2025-26'}</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => handleOpenSyllabusModal(assignment)}
                    className="btn-secondary !py-2 !px-2 !text-xs justify-center flex items-center gap-1"
                    title="View Official University Syllabus Modules & Approved COs"
                  >
                    <BookOpen className="h-3.5 w-3.5 text-brand-600" />
                    <span>Syllabus & COs</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenSubject(assignment.subjectId)}
                    className="btn-primary !py-2 !px-2 !text-xs justify-center group-hover:shadow-glow transition flex items-center gap-1"
                  >
                    <span>Workspace</span>
                    <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Modal 1: Weekly Timetable Modal */}
      {showTimetableModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-3 sm:p-6">
          <div className="glass-card max-w-4xl w-full max-h-[88vh] flex flex-col bg-white relative rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-slate-100 flex items-start justify-between shrink-0 bg-white">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700 border border-brand-100 shrink-0">
                  <CalendarDays className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">My Weekly Timetable Schedule</h2>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    Assigned teaching schedule · {timetableSlots.length} lecture slots scheduled per week
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowTimetableModal(false)}
                className="text-slate-400 hover:text-slate-600 transition p-1"
                title="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-4">
              {timetableSlots.length === 0 ? (
                <div className="p-12 text-center text-slate-400 text-xs">
                  No active timetable slots found for your profile. Please contact the Super Admin to configure your weekly schedule.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[
                    { dayNum: 1, name: 'Monday' },
                    { dayNum: 2, name: 'Tuesday' },
                    { dayNum: 3, name: 'Wednesday' },
                    { dayNum: 4, name: 'Thursday' },
                    { dayNum: 5, name: 'Friday' },
                    { dayNum: 6, name: 'Saturday' },
                  ].map((day) => {
                    const daySlots = timetableSlots
                      .filter((s) => s.dayOfWeek === day.dayNum)
                      .sort((a, b) => a.startTime.localeCompare(b.startTime));
                    const isToday = day.dayNum === todayDayOfWeek;

                    return (
                      <div
                        key={day.dayNum}
                        className={`p-4 rounded-xl border transition ${
                          isToday
                            ? 'border-brand-300 bg-brand-50/30 ring-1 ring-brand-200'
                            : 'border-slate-200 bg-white'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-2">
                          <span className={`text-xs font-bold ${isToday ? 'text-brand-800' : 'text-slate-800'}`}>
                            {day.name} {isToday && '(Today)'}
                          </span>
                          <span className="text-[11px] font-mono text-slate-500">
                            {daySlots.length} slot{daySlots.length !== 1 ? 's' : ''}
                          </span>
                        </div>

                        {daySlots.length === 0 ? (
                          <p className="text-xs text-slate-400 italic py-2">No scheduled lectures</p>
                        ) : (
                          <div className="space-y-2.5">
                            {daySlots.map((s) => (
                              <div
                                key={s.id}
                                className="p-2.5 rounded-lg border border-slate-200/80 bg-white hover:border-slate-300 transition text-xs space-y-1 shadow-2xs"
                              >
                                <div className="flex items-center justify-between">
                                  <span className="font-mono font-bold text-brand-700 bg-brand-50 px-1.5 py-0.5 rounded text-[11px]">
                                    {s.startTime} – {s.endTime}
                                  </span>
                                  <span className="text-[11px] font-semibold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                                    {s.roomNumber || 'Room TBA'}
                                  </span>
                                </div>
                                <p className="font-bold text-slate-800 line-clamp-1">{s.courseName}</p>
                                <p className="text-[11px] text-slate-500">{s.courseCode} · {s.classDivision}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end shrink-0">
              <button
                type="button"
                onClick={() => setShowTimetableModal(false)}
                className="btn-secondary !text-xs !py-2 !px-4"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 2: Syllabus & Course Outcomes Modal */}
      {showSyllabusModal && selectedSubjectForSyllabus && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-3 sm:p-6">
          <div className="glass-card max-w-3xl w-full max-h-[88vh] flex flex-col bg-white relative rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-slate-100 flex items-start justify-between shrink-0 bg-white">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700 border border-brand-100 shrink-0">
                  <BookOpen className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-slate-900">Official Syllabus & Course Outcomes</h2>
                    <span className="badge bg-brand-50 text-brand-700 border border-brand-200 font-mono font-bold">
                      {selectedSubjectForSyllabus.courseCode}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    {selectedSubjectForSyllabus.courseName} · {selectedSubjectForSyllabus.classDivision} · {selectedSubjectForSyllabus.totalSyllabusHours} Contact Hours
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSyllabusModal(false)}
                className="text-slate-400 hover:text-slate-600 transition p-1"
                title="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-4">
              {loadingSyllabus ? (
                <div className="py-12 text-center">
                  <Loader2 className="mx-auto h-8 w-8 animate-spin text-brand-600 mb-2" />
                  <p className="text-xs font-medium text-slate-500">Loading syllabus and outcomes...</p>
                </div>
              ) : (
                <>
                  {selectedSubjectForSyllabus.prerequisites && (
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-700">
                      <span className="font-bold text-slate-900">Prerequisites: </span>
                      <span>{selectedSubjectForSyllabus.prerequisites}</span>
                    </div>
                  )}

                  {/* Syllabus Modules */}
                  <div className="space-y-3">
                    <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                      <BookOpen className="h-3.5 w-3.5 text-brand-600" />
                      <span>Syllabus Modules Breakdown ({selectedSubjectForSyllabus.syllabusModules?.length || 0} Modules)</span>
                    </h3>

                    {selectedSubjectForSyllabus.syllabusModules && selectedSubjectForSyllabus.syllabusModules.length > 0 ? (
                      selectedSubjectForSyllabus.syllabusModules.map((m) => (
                        <div key={m.moduleNo} className="p-3.5 rounded-xl border border-slate-200 bg-white shadow-2xs space-y-1.5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="flex h-5 px-2 items-center justify-center rounded bg-brand-600 text-white font-mono font-bold text-[11px]">
                                M{m.moduleNo}
                              </span>
                              <span className="text-xs font-bold text-slate-900">{m.moduleName}</span>
                            </div>
                            <span className="text-xs font-mono font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                              {m.hours} hrs
                            </span>
                          </div>
                          <p className="text-xs text-slate-600 whitespace-pre-line leading-relaxed pl-7">
                            {m.topics}
                          </p>
                        </div>
                      ))
                    ) : (
                      <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-500">
                        Admin has not yet entered detailed syllabus modules for this course. Standard accredited OBE guidelines apply.
                      </div>
                    )}
                  </div>

                  {/* Approved Course Outcomes */}
                  <div className="space-y-3 pt-2">
                    <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                      <span>Approved NBA Course Outcomes (CO1–CO4)</span>
                    </h3>

                    {subjectCos.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {subjectCos.map((co) => (
                          <div key={co.id} className="p-3 rounded-xl border border-slate-200 bg-slate-50 space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="font-mono font-bold text-xs px-2 py-0.5 rounded bg-brand-100 text-brand-800">
                                {co.coCode}
                              </span>
                              <span className="text-xs font-mono font-bold text-slate-600">
                                {co.syllabusHours} hrs
                              </span>
                            </div>
                            <p className="text-xs text-slate-700 leading-relaxed">
                              {co.description}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-3 bg-slate-50 rounded-xl text-xs text-slate-500 italic">
                        Course outcomes synchronized with official academic hierarchy.
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between shrink-0">
              <button
                type="button"
                onClick={() => {
                  setShowSyllabusModal(false);
                  handleOpenSubject(selectedSubjectForSyllabus.id);
                }}
                className="btn-primary !text-xs !py-2 !px-4"
              >
                <span>Open Course Workspace</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setShowSyllabusModal(false)}
                className="btn-secondary !text-xs !py-2 !px-4"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
