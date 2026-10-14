import { Link, useNavigate } from 'react-router-dom';
import { 
  ChevronRight, 
  GraduationCap, 
  Calendar, 
  BookOpen, 
  User, 
  ArrowLeft,
  ChevronDown
} from 'lucide-react';
import { useAcademic } from '../../context/AcademicContext';
import { useAuth } from '../../context/AuthContext';

export default function ContextBreadcrumb() {
  const { activeSubject, activeClass, activeAcademicYear, assignments, selectSubject } = useAcademic();
  const { userProfile } = useAuth();
  const navigate = useNavigate();

  if (!activeSubject) return null;

  function handleSwitchSubject(subjectId: string) {
    selectSubject(subjectId);
    navigate(`/teacher/subject/${subjectId}/cags`);
  }

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200/90 bg-white/95 backdrop-blur-md px-6 py-3 shadow-xs">
      <div className="mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-3 max-w-7xl">
        {/* Left: Hierarchical Breadcrumb */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <Link
            to="/teacher"
            className="inline-flex items-center gap-1 font-semibold text-slate-500 hover:text-brand-700 transition px-2 py-1 rounded-md hover:bg-slate-100"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>My Courses</span>
          </Link>

          <ChevronRight className="h-3.5 w-3.5 text-slate-300 shrink-0" />

          {/* Academic Year */}
          <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-slate-50 border border-slate-200/80 text-slate-700 font-medium">
            <Calendar className="h-3.5 w-3.5 text-slate-400" />
            <span>{activeAcademicYear?.yearLabel || 'Academic Year'}</span>
            {activeAcademicYear?.curriculumScheme && (
              <span className="text-[10px] text-slate-400 font-mono">({activeAcademicYear.curriculumScheme})</span>
            )}
          </div>

          <ChevronRight className="h-3.5 w-3.5 text-slate-300 shrink-0" />

          {/* Class Cohort & Semester */}
          <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-slate-50 border border-slate-200/80 text-slate-700 font-medium">
            <GraduationCap className="h-3.5 w-3.5 text-slate-400" />
            <span>{activeClass?.division || 'Class'}</span>
            {activeClass?.semesterNumber && (
              <span className="text-[10px] text-brand-600 font-bold">Sem {activeClass.semesterNumber}</span>
            )}
          </div>

          <ChevronRight className="h-3.5 w-3.5 text-slate-300 shrink-0" />

          {/* Active Course with Switcher */}
          <div className="relative group">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-brand-50 border border-brand-200 text-brand-800 font-bold shadow-2xs">
              <BookOpen className="h-3.5 w-3.5 text-brand-600" />
              <span className="font-mono">{activeSubject.courseCode}</span>
              <span className="hidden sm:inline font-normal text-brand-700">· {activeSubject.courseName}</span>
              {assignments.length > 1 && <ChevronDown className="h-3 w-3 text-brand-500 ml-0.5" />}
            </div>

            {/* Quick Switch Dropdown if multiple assignments */}
            {assignments.length > 1 && (
              <div className="absolute left-0 mt-1 hidden group-hover:block w-72 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl z-30">
                <p className="px-2.5 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Switch Assigned Subject
                </p>
                {assignments.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => handleSwitchSubject(a.subjectId)}
                    className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition flex flex-col ${
                      a.subjectId === activeSubject.id
                        ? 'bg-brand-50 font-bold text-brand-700'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className="font-mono font-semibold">{a.courseCode}</span>
                    <span className="text-[11px] text-slate-500 truncate">{a.courseName}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: Faculty Owner & Badges */}
        <div className="flex items-center gap-2 text-xs shrink-0">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 font-medium">
            <User className="h-3.5 w-3.5 text-slate-500" />
            <span className="text-[11px] text-slate-500">Course Owner:</span>
            <span className="font-semibold text-slate-800">
              {activeSubject.assignedTeacherName || userProfile?.displayName || 'Faculty'}
            </span>
          </div>

          <span className="badge bg-emerald-50 text-emerald-700 border border-emerald-200 font-mono text-[11px]">
            {activeSubject.totalSyllabusHours} hrs
          </span>
        </div>
      </div>
    </header>
  );
}
