import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import * as XLSX from 'xlsx';
import {
  FileBarChart2,
  Building2,
  Calendar,
  Download,
  Search,
  BookMarked,
  AlertTriangle,
  ExternalLink,
  Loader2,
  Layers,
} from 'lucide-react';

import toast from 'react-hot-toast';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import type { Department, Subject, SubjectDashboardStats } from '../../types';
import { formatMonthLabel } from '../../lib/cagsCalculations';

export default function AdminReportsPage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [dashboardStatsMap, setDashboardStatsMap] = useState<Record<string, SubjectDashboardStats>>({});
  const [loading, setLoading] = useState(true);

  const [selectedDeptId, setSelectedDeptId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const currentMonthKey = new Date().toISOString().slice(0, 7);
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonthKey);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        // Fetch Departments
        const deptSnap = await getDocs(
          query(collection(db, 'departments'), where('status', '==', 'active'))
        );
        const deptList = deptSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Department[];
        setDepartments(deptList);

        // Fetch Subjects
        const subjSnap = await getDocs(
          query(collection(db, 'subjects'), where('status', '==', 'active'))
        );
        const subjList = subjSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Subject[];
        setSubjects(subjList);

        // Fetch Dashboard Stats
        const statsSnap = await getDocs(collection(db, 'subject_dashboard_stats'));
        const statsMap: Record<string, SubjectDashboardStats> = {};
        for (const doc of statsSnap.docs) {
          statsMap[doc.id] = doc.data() as SubjectDashboardStats;
        }
        setDashboardStatsMap(statsMap);
      } catch (err: any) {
        toast.error('Failed to load administrative reports: ' + err.message);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  const filteredSubjects = useMemo(() => {
    return subjects.filter((s) => {
      const matchesDept = selectedDeptId === 'all' || s.departmentId === selectedDeptId;
      const matchesSearch =
        s.courseCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.courseName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (s.assignedTeacherName || '').toLowerCase().includes(searchQuery.toLowerCase());
      return matchesDept && matchesSearch;
    });
  }, [subjects, selectedDeptId, searchQuery]);

  // Aggregate Department KPIs
  const aggregateMetrics = useMemo(() => {
    let totalPlanned = 0;
    let totalConducted = 0;
    let totalDefaulters = 0;
    let totalStudents = 0;
    let sumAttendance = 0;
    let subjectsWithAttendanceCount = 0;

    for (const s of filteredSubjects) {
      const stats = dashboardStatsMap[s.id];
      const planned = stats?.syllabusCompletion?.totalPlannedSessions || s.totalSyllabusHours || 39;
      const conducted = stats?.syllabusCompletion?.conductedSessions || s.conductedSessionsCount || 0;
      totalPlanned += planned;
      totalConducted += conducted;

      if (stats?.cumulativeAttendance) {
        totalDefaulters += stats.cumulativeAttendance.studentsBelow50Percent || 0;
        totalStudents += stats.cumulativeAttendance.totalStudents || 0;
        if (stats.cumulativeAttendance.averageAttendancePercent > 0) {
          sumAttendance += stats.cumulativeAttendance.averageAttendancePercent;
          subjectsWithAttendanceCount++;
        }
      }
    }

    const overallSyllabusPercent =
      totalPlanned > 0 ? Number(((totalConducted / totalPlanned) * 100).toFixed(1)) : 0;
    const overallAvgAttendance =
      subjectsWithAttendanceCount > 0
        ? Number((sumAttendance / subjectsWithAttendanceCount).toFixed(1))
        : 0;

    return {
      totalSubjects: filteredSubjects.length,
      totalPlanned,
      totalConducted,
      overallSyllabusPercent,
      overallAvgAttendance,
      totalDefaulters,
      totalStudents,
    };
  }, [filteredSubjects, dashboardStatsMap]);

  // Departmental Excel Export
  const handleExportDepartmentExcel = () => {
    try {
      const exportData = filteredSubjects.map((s, idx) => {
        const stats = dashboardStatsMap[s.id];
        const planned = stats?.syllabusCompletion?.totalPlannedSessions || s.totalSyllabusHours || 39;
        const conducted = stats?.syllabusCompletion?.conductedSessions || s.conductedSessionsCount || 0;
        const completionPercent = stats?.syllabusCompletion?.completionPercent || 0;
        const avgAttendance = stats?.cumulativeAttendance?.averageAttendancePercent || 0;
        const defaulters = stats?.cumulativeAttendance?.studentsBelow50Percent || 0;
        const regulars = stats?.cumulativeAttendance?.studentsAbove60Percent || 0;

        return {
          'Sr. No.': idx + 1,
          'Course Code': s.courseCode,
          'Course Name': s.courseName,
          'Class Division': s.classDivision || '—',
          'Assigned Teacher': s.assignedTeacherName || 'Unassigned',
          'Planned Hours': planned,
          'Conducted Lectures': conducted,
          'Syllabus Completion %': completionPercent,
          'Average Attendance %': avgAttendance,
          'Defaulters (<50%)': defaulters,
          'Regulars (>60%)': regulars,
        };
      });

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(exportData);
      XLSX.utils.book_append_sheet(wb, ws, 'Departmental Summary');

      const fileName = `Departmental_CAGS_Report_${selectedMonth}.xlsx`;
      XLSX.writeFile(wb, fileName);
      toast.success(`Exported ${fileName} successfully!`);
    } catch (err: any) {
      toast.error('Failed to export Excel report: ' + err.message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="badge bg-brand-50 text-brand-700 border border-brand-200 text-[10px] font-mono font-bold">
              Institutional Reports & Compliance
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Academic Delivery & Compliance Reports
          </h1>
          <p className="text-xs text-slate-500 font-medium">
            Cross-departmental syllabus tracking, attendance defaulter monitoring, and NBA accreditation summaries.
          </p>
        </div>

        <button
          type="button"
          onClick={handleExportDepartmentExcel}
          className="btn-primary !text-xs !py-2 !px-4 inline-flex items-center gap-2 !bg-emerald-600 hover:!bg-emerald-700 shadow-sm self-start sm:self-auto"
        >
          <Download className="h-4 w-4" />
          <span>Export Department Summary (.xlsx)</span>
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="glass-card p-4 bg-white border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 mb-1">
            <span>Monitored Courses</span>
            <Layers className="h-4 w-4 text-slate-400" />
          </div>
          <div className="text-2xl font-black text-slate-900 font-mono">
            {aggregateMetrics.totalSubjects}
          </div>
          <p className="text-[10px] text-slate-400 mt-1">Active semester courses</p>
        </div>

        <div className="glass-card p-4 bg-white border-violet-200 shadow-xs">
          <div className="flex items-center justify-between text-xs font-semibold text-violet-700 mb-1">
            <span>Syllabus Completion</span>
            <BookMarked className="h-4 w-4 text-violet-600" />
          </div>
          <div className="text-2xl font-black text-violet-700 font-mono">
            {aggregateMetrics.overallSyllabusPercent}%
          </div>
          <p className="text-[10px] text-slate-400 mt-1">
            {aggregateMetrics.totalConducted} of {aggregateMetrics.totalPlanned} hrs
          </p>
        </div>

        <div className="glass-card p-4 bg-white border-brand-200 shadow-xs">
          <div className="flex items-center justify-between text-xs font-semibold text-brand-700 mb-1">
            <span>Average Attendance</span>
            <FileBarChart2 className="h-4 w-4 text-brand-600" />
          </div>
          <div className="text-2xl font-black text-brand-700 font-mono">
            {aggregateMetrics.overallAvgAttendance}%
          </div>
          <p className="text-[10px] text-slate-400 mt-1">Institutional aggregate</p>
        </div>

        <div className="glass-card p-4 bg-white border-red-200 shadow-xs">
          <div className="flex items-center justify-between text-xs font-semibold text-red-700 mb-1">
            <span>Total Defaulters (&lt; 50%)</span>
            <AlertTriangle className="h-4 w-4 text-red-600" />
          </div>
          <div className="text-2xl font-black text-red-700 font-mono">
            {aggregateMetrics.totalDefaulters}
          </div>
          <p className="text-[10px] text-red-600/80 mt-1">Subject-level defaulter counts</p>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="glass-card p-4 bg-white border-slate-200 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search course code, name or teacher..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input-text !pl-9 !py-1.5 !text-xs w-full"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          <div className="flex items-center gap-2">
            <Building2 className="h-3.5 w-3.5 text-slate-400" />
            <span className="text-xs font-semibold text-slate-600">Department:</span>
            <select
              value={selectedDeptId}
              onChange={(e) => setSelectedDeptId(e.target.value)}
              className="input-text !py-1.5 !text-xs font-semibold"
            >
              <option value="all">All Departments</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.code})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <Calendar className="h-3.5 w-3.5 text-slate-400" />
            <span className="text-xs font-semibold text-slate-600">Period:</span>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="input-text !py-1 !text-xs font-mono font-bold"
              title={`Report Period: ${formatMonthLabel(selectedMonth)}`}
            />
          </div>
        </div>
      </div>


      {/* Reports Table */}
      <div className="glass-card bg-white border-slate-200 shadow-sm overflow-hidden rounded-xl">
        {loading ? (
          <div className="p-12 text-center text-slate-400 text-xs">
            <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-brand-600" />
            Loading departmental courses and delivery metrics...
          </div>
        ) : filteredSubjects.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs">
            No subjects found matching your filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 font-bold border-b border-slate-200">
                <tr>
                  <th className="px-3 py-3 w-12 text-center">Sr.</th>
                  <th className="px-4 py-3 min-w-[200px]">Course</th>
                  <th className="px-3 py-3 min-w-[120px]">Class</th>
                  <th className="px-4 py-3 min-w-[150px]">Faculty</th>
                  <th className="px-3 py-3 text-center min-w-[100px]">Syllabus (hrs)</th>
                  <th className="px-3 py-3 text-center w-24">Progress</th>
                  <th className="px-3 py-3 text-center w-20">Avg %</th>
                  <th className="px-3 py-3 text-center w-20">&lt; 50%</th>
                  <th className="px-3 py-3 text-right w-24">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredSubjects.map((s, idx) => {
                  const stats = dashboardStatsMap[s.id];
                  const planned = stats?.syllabusCompletion?.totalPlannedSessions || s.totalSyllabusHours || 39;
                  const conducted = stats?.syllabusCompletion?.conductedSessions || s.conductedSessionsCount || 0;
                  const progress =
                    planned > 0 ? Number(((conducted / planned) * 100).toFixed(1)) : 0;
                  const avg = stats?.cumulativeAttendance?.averageAttendancePercent || 0;
                  const defaulters = stats?.cumulativeAttendance?.studentsBelow50Percent || 0;

                  return (
                    <tr key={s.id} className="hover:bg-slate-50/80 transition">
                      <td className="px-3 py-3 text-center font-mono text-slate-400">
                        {idx + 1}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-bold text-slate-900">{s.courseCode}</div>
                        <div className="text-[11px] text-slate-500">{s.courseName}</div>
                      </td>
                      <td className="px-3 py-3 text-slate-600 font-medium">
                        {s.classDivision || '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-800 font-semibold">
                        {s.assignedTeacherName || 'Unassigned'}
                      </td>
                      <td className="px-3 py-3 text-center font-mono font-bold text-slate-700">
                        {conducted} / {planned}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <div className="flex items-center gap-1.5 justify-center">
                          <span className="font-mono font-bold text-violet-700">{progress}%</span>
                          <div className="w-10 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                            <div
                              className="bg-violet-600 h-full rounded-full"
                              style={{ width: `${Math.min(100, progress)}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center font-mono font-bold text-brand-700">
                        {avg}%
                      </td>
                      <td className="px-3 py-3 text-center">
                        {defaulters > 0 ? (
                          <span className="badge bg-red-100 text-red-800 font-mono font-bold text-[10px]">
                            {defaulters}
                          </span>
                        ) : (
                          <span className="text-slate-400 font-mono text-xs">0</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <Link
                          to={`/teacher/subject/${s.id}/monthly-report`}
                          className="inline-flex items-center gap-1 text-[11px] font-bold text-brand-600 hover:text-brand-800"
                        >
                          <span>Report</span>
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
