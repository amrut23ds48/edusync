import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
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
  Building2
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useAcademic } from '../../context/AcademicContext';

export default function TeacherHomeSelector() {
  const { userProfile, logout } = useAuth();
  const { assignments, loading, selectSubject } = useAcademic();
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const [yearFilter, setYearFilter] = useState('ALL');

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
              <h1 className="text-base font-bold text-slate-900 leading-tight">CAGS Portal</h1>
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

                <button
                  type="button"
                  onClick={() => handleOpenSubject(assignment.subjectId)}
                  className="w-full btn-primary !py-2.5 !text-xs justify-between group-hover:shadow-glow transition"
                >
                  <span>Open CAGS Workspace</span>
                  <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
