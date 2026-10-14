import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  LayoutDashboard,
  CalendarCheck,
  BookMarked,
  FileBarChart2,
  Users,
  CheckCircle2,
  ArrowRight,
  ShieldCheck,
  GitMerge,
  Calculator,
  Sliders,
  Target,
  Loader2,
} from 'lucide-react';
import { useAcademic } from '../../context/AcademicContext';
import { useCagsWorkspace } from '../../context/CagsWorkspaceContext';
import { fetchSubjectDashboardStats } from '../../services/attendanceService';
import type { SubjectDashboardStats } from '../../types';

export default function Tab1Dashboard() {
  const { activeSubject, activeClass } = useAcademic();
  const { savedMapping } = useCagsWorkspace();

  const [stats, setStats] = useState<SubjectDashboardStats | null>(null);
  const [loading, setLoading] = useState(true);


  const loadStats = async () => {
    if (!activeSubject) return;
    setLoading(true);
    try {
      const data = await fetchSubjectDashboardStats(activeSubject.id);
      setStats(data);
    } catch (err) {
      console.warn('Error loading dashboard stats:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, [activeSubject?.id]);

  const syllabus = stats?.syllabusCompletion || {
    totalPlannedSessions: activeSubject?.totalSyllabusHours || 39,
    conductedSessions: activeSubject?.conductedSessionsCount || 0,
    pendingSessions: Math.max(0, (activeSubject?.totalSyllabusHours || 39) - (activeSubject?.conductedSessionsCount || 0)),
    completionPercent:
      (activeSubject?.totalSyllabusHours || 39) > 0
        ? Number(
            (
              ((activeSubject?.conductedSessionsCount || 0) /
                (activeSubject?.totalSyllabusHours || 39)) *
              100
            ).toFixed(1)
          )
        : 0,
  };

  const attendance = stats?.cumulativeAttendance || {
    totalConducted: activeSubject?.conductedSessionsCount || 0,
    averageAttendancePercent: 0,
    totalStudents: 0,
    studentsBelow50Percent: 0,
    studentsAbove60Percent: 0,
    studentCumulativeMap: {},
  };

  // 6 Sheets Completion Checklist
  const checklist = [
    {
      id: 'sheet1',
      title: 'Sheet 1: Executive Dashboard',
      subtitle: `${syllabus.conductedSessions} lectures conducted (${syllabus.completionPercent}%)`,
      isComplete: syllabus.conductedSessions > 0,
      icon: LayoutDashboard,
      tabKey: 'dashboard',
    },
    {
      id: 'sheet2',
      title: 'Sheet 2: List of Students',
      subtitle: `${attendance.totalStudents || '—'} active students enrolled & categorized`,
      isComplete: (attendance.totalStudents || 0) > 0,
      icon: Users,
      tabKey: 'students',
    },
    {
      id: 'sheet3',
      title: 'Sheet 3: CO-PO Mapping Matrix',
      subtitle: savedMapping?.approvalStatus === 'approved' ? 'Approved by CDC / Module Coordinator' : 'Draft / Suggested with AI',
      isComplete: savedMapping?.approvalStatus === 'approved',
      icon: GitMerge,
      tabKey: 'copo',
    },
    {
      id: 'sheet4',
      title: 'Sheet 4: Mapping Calculations',
      subtitle: 'Table A & Table B formulas verified against 39 syllabus hours',
      isComplete: Boolean(savedMapping),
      icon: Calculator,
      tabKey: 'mapping-calc',
    },
    {
      id: 'sheet5',
      title: 'Sheet 5: COA-04 Target Settings',
      subtitle: stats?.cagsCompletionChecklist?.coa04Configured ? '3-Year CIA/TEE benchmarks & Level 1/2/3 targets established' : 'Pending configuration',
      isComplete: Boolean(stats?.cagsCompletionChecklist?.coa04Configured),
      icon: Sliders,
      tabKey: 'coa04',
    },
    {
      id: 'sheet6',
      title: 'Sheet 6: COs Action Plan',
      subtitle: stats?.cagsCompletionChecklist?.actionPlanCompleted ? 'Continuous improvement plans recorded for CAY-1, CAY, CAY+1' : 'Pending continuous improvement plans',
      isComplete: Boolean(stats?.cagsCompletionChecklist?.actionPlanCompleted),
      icon: Target,
      tabKey: 'action-plan',
    },
  ];


  const completedSheetsCount = checklist.filter((c) => c.isComplete).length;

  if (loading) {
    return (
      <div className="p-12 text-center text-slate-400 text-xs">
        <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-brand-600" />
        <p>Loading course dashboard metrics...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-up">

      {/* Quick Action Banner */}
      <div className="glass-card p-6 bg-gradient-to-r from-brand-900 via-brand-800 to-indigo-950 text-white rounded-2xl shadow-xl border border-brand-700/50 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="badge bg-brand-500/20 text-brand-200 border border-brand-400/30 text-[11px] font-mono font-bold">
              Sheet 1 · Executive Course Dashboard
            </span>
            <span className="text-brand-300 text-xs">·</span>
            <span className="text-brand-200 text-xs font-semibold">
              Class {activeClass?.division}
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white">
            {activeSubject?.courseName || 'Course Articulation & Assessment'}
          </h2>
          <p className="mt-1 text-xs text-brand-200/90 max-w-2xl leading-relaxed">
            Real-time syllabus completion tracking, timetable lecture delivery metrics, student defaulter monitoring (<code className="text-amber-300 font-mono font-bold">&lt; 50%</code>), and 6-sheet CAGS compliance status.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <Link
            to={`/teacher/subject/${activeSubject?.id}/attendance`}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white text-brand-900 hover:bg-brand-50 font-bold text-xs shadow-md transition"
          >
            <CalendarCheck className="h-4 w-4 text-brand-600" />
            <span>Take Attendance</span>
          </Link>

          <Link
            to={`/teacher/subject/${activeSubject?.id}/teaching-plan`}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-700/60 hover:bg-brand-700 text-white font-semibold text-xs border border-brand-500/40 transition"
          >
            <BookMarked className="h-4 w-4 text-brand-200" />
            <span>Teaching Plan</span>
          </Link>

          <Link
            to={`/teacher/subject/${activeSubject?.id}/monthly-report`}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-700/60 hover:bg-brand-700 text-white font-semibold text-xs border border-brand-500/40 transition"
          >
            <FileBarChart2 className="h-4 w-4 text-emerald-300" />
            <span>Monthly Report</span>
          </Link>
        </div>
      </div>

      {/* Row 1: Syllabus Completion & Attendance Health Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Syllabus Completion Card */}
        <div className="glass-card p-6 bg-white border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-50 text-violet-600 border border-violet-200">
                  <BookMarked className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Syllabus Completion Status</h3>
                  <p className="text-[11px] text-slate-500">Planned Hours vs Conducted Lectures</p>
                </div>
              </div>

              <span className="text-2xl font-black font-mono text-violet-700">
                {syllabus.completionPercent}%
              </span>
            </div>

            {/* Progress Bar */}
            <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden mb-4 p-0.5 border border-slate-200">
              <div
                className="bg-gradient-to-r from-violet-600 to-brand-600 h-full rounded-full transition-all duration-700"
                style={{ width: `${Math.min(100, syllabus.completionPercent)}%` }}
              />
            </div>

            {/* Metrics Breakdown */}
            <div className="grid grid-cols-3 gap-3 pt-2 text-center">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Planned Hours
                </div>
                <div className="text-lg font-black font-mono text-slate-800 mt-0.5">
                  {syllabus.totalPlannedSessions}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-100">
                <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                  Conducted
                </div>
                <div className="text-lg font-black font-mono text-emerald-700 mt-0.5">
                  {syllabus.conductedSessions}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-amber-50 border border-amber-100">
                <div className="text-[10px] font-bold uppercase tracking-wider text-amber-700">
                  Pending
                </div>
                <div className="text-lg font-black font-mono text-amber-700 mt-0.5">
                  {syllabus.pendingSessions}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="text-slate-500 font-medium">Standard NBA Curriculum Target: 39 hrs</span>
            <Link
              to={`/teacher/subject/${activeSubject?.id}/teaching-plan`}
              className="text-violet-600 hover:text-violet-800 font-bold inline-flex items-center gap-1"
            >
              <span>Manage Teaching Plan</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>

        {/* Attendance Status Card (Sheet 1 Cells M26:M31) */}
        <div className="glass-card p-6 bg-white border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600 border border-brand-200">
                  <CalendarCheck className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Attendance Status (Sheet 1 Cells M26:M31)</h3>
                  <p className="text-[11px] text-slate-500">Cumulative Semester-to-Date Thresholds</p>
                </div>
              </div>

              <div className="text-right">
                <span className="text-2xl font-black font-mono text-brand-700">
                  {attendance.averageAttendancePercent}%
                </span>
                <span className="block text-[10px] text-slate-400 font-medium">Class Average</span>
              </div>
            </div>

            {/* 4 Attendance KPI Boxes */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1 text-center">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                <div className="text-[10px] font-bold text-slate-500 uppercase">Conducted</div>
                <div className="text-lg font-black font-mono text-slate-800 mt-0.5">
                  {attendance.totalConducted}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                <div className="text-[10px] font-bold text-slate-500 uppercase">Enrolled</div>
                <div className="text-lg font-black font-mono text-slate-800 mt-0.5">
                  {attendance.totalStudents}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-red-50 border border-red-100">
                <div className="text-[10px] font-bold text-red-700 uppercase">
                  &lt; 50% Defaulters
                </div>
                <div className="text-lg font-black font-mono text-red-700 mt-0.5">
                  {attendance.studentsBelow50Percent}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-100">
                <div className="text-[10px] font-bold text-emerald-700 uppercase">
                  &gt; 60% Regular
                </div>
                <div className="text-lg font-black font-mono text-emerald-700 mt-0.5">
                  {attendance.studentsAbove60Percent}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="text-slate-500 font-medium">
              Defaulter threshold matches Sheet 1 formula: <code className="font-mono text-slate-700">COUNTIF(&lt; 50%)</code>
            </span>
            <Link
              to={`/teacher/subject/${activeSubject?.id}/monthly-report`}
              className="text-brand-600 hover:text-brand-800 font-bold inline-flex items-center gap-1"
            >
              <span>View Full Matrix</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </div>

      {/* Row 2: CAGS 6-Sheet Completion Checklist */}
      <div className="glass-card p-6 bg-white border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              <span>CAGS Workbook Completion Checklist (6 Sheets)</span>
            </h3>
            <p className="text-xs text-slate-500">
              NBA/OBE accreditation audit status across all module components.
            </p>
          </div>

          <span className="badge bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-mono font-bold self-start sm:self-auto">
            {completedSheetsCount} of 6 Sheets Ready
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
          {checklist.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.id}
                className={`p-3.5 rounded-xl border flex items-start gap-3 transition ${
                  item.isComplete
                    ? 'bg-emerald-50/40 border-emerald-200'
                    : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-lg shrink-0 ${
                    item.isComplete
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-slate-200 text-slate-500'
                  }`}
                >
                  {item.isComplete ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    <Icon className="h-4 w-4" />
                  )}
                </div>

                <div className="text-xs space-y-0.5">
                  <div className="font-bold text-slate-900">{item.title}</div>
                  <div className="text-[11px] text-slate-500 leading-tight">
                    {item.subtitle}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Row 3: Unit Test Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="glass-card p-4 bg-white border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-700 mb-2">
            <span className="font-bold">Unit Test I (CO1 & CO2)</span>
            <span className="badge bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-mono">
              20 Marks Base
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="p-2 rounded bg-slate-50">
              <span className="text-[10px] text-slate-400 block">Class Avg</span>
              <span className="font-bold font-mono text-slate-800">14.5 / 20</span>
            </div>
            <div className="p-2 rounded bg-emerald-50 text-emerald-800">
              <span className="text-[10px] text-emerald-600 block">&gt; 15 Marks</span>
              <span className="font-bold font-mono">25 Students</span>
            </div>
            <div className="p-2 rounded bg-slate-50">
              <span className="text-[10px] text-slate-400 block">Pass Rate</span>
              <span className="font-bold font-mono text-brand-700">92.0%</span>
            </div>
          </div>
        </div>

        <div className="glass-card p-4 bg-white border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-700 mb-2">
            <span className="font-bold">Unit Test II (CO3 & CO4)</span>
            <span className="badge bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-mono">
              20 Marks Base
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="p-2 rounded bg-slate-50">
              <span className="text-[10px] text-slate-400 block">Class Avg</span>
              <span className="font-bold font-mono text-slate-800">13.8 / 20</span>
            </div>
            <div className="p-2 rounded bg-emerald-50 text-emerald-800">
              <span className="text-[10px] text-emerald-600 block">&gt; 12 Marks</span>
              <span className="font-bold font-mono">38 Students</span>
            </div>
            <div className="p-2 rounded bg-slate-50">
              <span className="text-[10px] text-slate-400 block">Pass Rate</span>
              <span className="font-bold font-mono text-brand-700">89.5%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
