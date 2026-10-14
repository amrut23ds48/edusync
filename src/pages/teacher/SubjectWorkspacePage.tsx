import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { 
  ShieldAlert, 
  ArrowLeft, 
  Users, 
  LayoutDashboard, 
  GitMerge, 
  Calculator, 
  Sliders, 
  Target,
  CalendarCheck,
  BookMarked,
  FileBarChart2,
  Sparkles
} from 'lucide-react';
import { useAcademic } from '../../context/AcademicContext';
import ContextBreadcrumb from '../../components/layout/ContextBreadcrumb';
import Tab2StudentList from '../../components/cags/Tab2StudentList';
import Tab3CoPoMapping from '../../components/cags/Tab3CoPoMapping';
import Tab4MappingCalc from '../../components/cags/Tab4MappingCalc';
import Tab5Coa04Settings from '../../components/cags/Tab5Coa04Settings';
import Tab6CoActionPlan from '../../components/cags/Tab6CoActionPlan';
import { CagsWorkspaceProvider } from '../../context/CagsWorkspaceContext';

export type CagsTab = 'dashboard' | 'students' | 'copo' | 'mapping-calc' | 'coa04' | 'action-plan';

export default function SubjectWorkspacePage() {
  const { subjectId } = useParams<{ subjectId: string }>();
  const navigate = useNavigate();
  const { 
    isAuthorizedForSubject, 
    selectSubject, 
    activeSubject, 
    activeClass, 
    loading: academicLoading 
  } = useAcademic();

  const [activeTab, setActiveTab] = useState<CagsTab>('students');

  // Sync active subject context
  useEffect(() => {
    if (subjectId && isAuthorizedForSubject(subjectId)) {
      selectSubject(subjectId);
    }
  }, [subjectId, isAuthorizedForSubject, selectSubject]);

  // Loading state
  if (academicLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600 mb-3" />
        <p className="text-sm font-semibold text-slate-700">Verifying course authorization & loading syllabus context...</p>
      </div>
    );
  }

  // Gate M3-V1: Segregation & Access Verification
  if (!subjectId || !isAuthorizedForSubject(subjectId)) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="glass-card max-w-lg w-full p-8 text-center border-red-200 shadow-xl bg-white">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-red-600 border border-red-200">
            <ShieldAlert className="h-7 w-7" />
          </div>
          <span className="badge bg-red-100 text-red-800 border-red-200 font-mono text-xs mb-2">
            Gate M3-V1 · Security Segregation
          </span>
          <h2 className="text-xl font-bold text-slate-900 mt-1">Unauthorized Subject Context</h2>
          <p className="mt-2 text-xs text-slate-600 leading-relaxed max-w-md mx-auto">
            You do not hold an active faculty assignment for subject ID{' '}
            <code className="px-1.5 py-0.5 rounded bg-slate-100 font-mono font-bold text-red-700">
              {subjectId}
            </code>. Under institutional academic segregation, faculty members are strictly prohibited from viewing or editing student rosters and course articulation records outside their assigned subjects.
          </p>
          <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/teacher')}
              className="btn-primary !text-xs !py-2.5 !px-5 inline-flex items-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Return to My Assigned Courses</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  const tabs: { id: CagsTab; label: string; icon: any; sheet: string; status: 'active' | 'upcoming' }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, sheet: 'Sheet 1', status: 'upcoming' },
    { id: 'students', label: 'List of Students', icon: Users, sheet: 'Sheet 2', status: 'active' },
    { id: 'copo', label: 'CO-PO Mapping', icon: GitMerge, sheet: 'Sheet 3', status: 'active' },
    { id: 'mapping-calc', label: 'Mapping Calculation', icon: Calculator, sheet: 'Sheet 4', status: 'active' },
    { id: 'coa04', label: 'COA-04', icon: Sliders, sheet: 'Sheet 5', status: 'active' },
    { id: 'action-plan', label: 'COs Action Plan', icon: Target, sheet: 'Sheet 6', status: 'active' },
  ];

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800 flex flex-col">
      {/* Sticky Context Breadcrumb Banner */}
      <ContextBreadcrumb />

      {/* Course Sub-Header & Navigation Controls */}
      <div className="bg-white border-b border-slate-200 px-6 pt-4 pb-0 shadow-2xs">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-xs font-bold text-brand-700 bg-brand-50 px-2 py-0.5 rounded border border-brand-200">
                {activeSubject?.courseCode || 'COURSE'}
              </span>
              <span className="text-xs text-slate-400 font-medium">·</span>
              <span className="text-xs font-semibold text-slate-500">
                Class {activeClass?.division} (Sem {activeClass?.semesterNumber})
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
              {activeSubject?.courseName || 'Course Articulation & Assessment'}
            </h1>
          </div>

          {/* Quick Links: Attendance, Teaching Plan, Monthly Report */}
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to={`/teacher/subject/${subjectId}/attendance`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-700 transition"
              title="Lecture Attendance Sessions"
            >
              <CalendarCheck className="h-3.5 w-3.5 text-brand-600" />
              <span>Attendance</span>
            </Link>

            <Link
              to={`/teacher/subject/${subjectId}/teaching-plan`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-700 transition"
              title="Syllabus Teaching Plan (PCD / ACD)"
            >
              <BookMarked className="h-3.5 w-3.5 text-violet-600" />
              <span>Teaching Plan</span>
            </Link>

            <Link
              to={`/teacher/subject/${subjectId}/monthly-report`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-700 transition"
              title="Monthly Attendance & Completion Report"
            >
              <FileBarChart2 className="h-3.5 w-3.5 text-emerald-600" />
              <span>Monthly Report</span>
            </Link>
          </div>
        </div>

        {/* 6 CAGS Workbook Navigation Tabs */}
        <div className="max-w-7xl mx-auto flex items-center gap-1 overflow-x-auto no-scrollbar border-b border-transparent">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isCurrent = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 py-3 px-3.5 border-b-2 text-xs font-bold transition whitespace-nowrap ${
                  isCurrent
                    ? 'border-brand-600 text-brand-700 bg-brand-50/50 rounded-t-lg'
                    : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
                }`}
              >
                <Icon className={`h-4 w-4 ${isCurrent ? 'text-brand-600' : 'text-slate-400'}`} />
                <span>{tab.label}</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono font-medium ${
                  isCurrent ? 'bg-brand-100 text-brand-800' : 'bg-slate-100 text-slate-500'
                }`}>
                  {tab.sheet}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content Body */}
      <main className="flex-1 max-w-7xl mx-auto w-full p-6 sm:p-8 animate-fade-up">
      <CagsWorkspaceProvider subjectId={subjectId}>
        {/* Tab 2: List of Students (Milestone 3 active delivery) */}
        {activeTab === 'students' && <Tab2StudentList />}

        {/* Tab 1: Dashboard (Milestone 5) */}
        {activeTab === 'dashboard' && (
          <div className="glass-card p-8 text-center max-w-2xl mx-auto">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
              <LayoutDashboard className="h-7 w-7" />
            </div>
            <span className="badge bg-brand-50 text-brand-700 border border-brand-200 text-xs mb-2">
              Sheet 1 · Milestone 5
            </span>
            <h3 className="text-lg font-bold text-slate-900">CAGS Executive Dashboard</h3>
            <p className="mt-2 text-xs text-slate-600 leading-relaxed">
              Sheet 1 provides the high-level course overview, syllabus completion metrics ({activeSubject?.totalSyllabusHours || 39} hours planned), average lecture attendance percentage, count of students below 50% & above 60%, and real-time status of CO-PO articulations.
            </p>
            <div className="mt-6 p-4 rounded-xl bg-slate-50 border border-slate-200 text-left text-xs space-y-2">
              <div className="flex items-center gap-2 font-semibold text-slate-700">
                <Sparkles className="h-4 w-4 text-brand-600" />
                <span>Upcoming in Milestone 5:</span>
              </div>
              <p className="text-slate-500">
                Synchronized automatically via atomic writes whenever lecture attendance is submitted or revised.
              </p>
            </div>
          </div>
        )}

        {/* Tab 3: CO-PO Mapping (Milestone 4) */}
        {activeTab === 'copo' && <Tab3CoPoMapping />}

        {/* Tab 4: Mapping Calculation (Milestone 4) */}
        {activeTab === 'mapping-calc' && <Tab4MappingCalc />}

        {/* Tab 5: COA-04 (Milestone 4) */}
        {activeTab === 'coa04' && <Tab5Coa04Settings />}

        {/* Tab 6: COs Action Plan (Milestone 4) */}
        {activeTab === 'action-plan' && <Tab6CoActionPlan />}
      </CagsWorkspaceProvider>
      </main>
    </div>
  );
}
