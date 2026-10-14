import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { collection, query, where, getDocs } from 'firebase/firestore';
import {
  BookMarked,
  BookOpen,
  Plus,
  Sparkles,
  CheckCircle2,
  Clock,
  ArrowLeft,
  CalendarCheck,
  Calendar,
  Layers,
  Trash2,
  Edit2,
  Search,
  Filter,
  Loader2,
  Info,
  X,
} from 'lucide-react';

import toast from 'react-hot-toast';
import { db } from '../../lib/firebase';
import { useAcademic } from '../../context/AcademicContext';
import { useAuth } from '../../context/AuthContext';
import ContextBreadcrumb from '../../components/layout/ContextBreadcrumb';
import type { TeachingPlanEntry, MappedCoOption } from '../../types';
import {
  fetchTeachingPlanEntries,
  createTeachingPlanEntry,
  updateTeachingPlanEntry,
  deleteTeachingPlanEntry,
  generateAndSeedDynamicTeachingPlan,
} from '../../services/teachingPlanService';
import { requestAiTeachingPlanIct } from '../../services/cagsAiService';

export default function TeachingPlanPage() {
  const { subjectId } = useParams<{ subjectId: string }>();
  const { activeSubject, activeClass, isAuthorizedForSubject } = useAcademic();
  const { user } = useAuth();

  const [entries, setEntries] = useState<TeachingPlanEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [coFilter, setCoFilter] = useState<string>('all');
  const [generatingIctId, setGeneratingIctId] = useState<string | null>(null);

  // Official Syllabus & Generation Modals
  const [showSyllabusModal, setShowSyllabusModal] = useState(false);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [startDateInput, setStartDateInput] = useState('2026-07-06');
  const [courseOutcomes, setCourseOutcomes] = useState<any[]>([]);
  const [loadingSyllabus, setLoadingSyllabus] = useState(false);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<TeachingPlanEntry | null>(null);
  const [modalForm, setModalForm] = useState({
    sequenceNo: 1,
    chapterNo: 1,
    chapterTitle: '',
    topicTitle: '',
    mappedCoCode: 'CO1' as MappedCoOption,
    plannedDate: new Date().toISOString().slice(0, 10),
    ictToolUsed: 'Chalk Board, Presentation',
    remark: '',
  });
  const [modalAiLoading, setModalAiLoading] = useState(false);

  // Load entries
  const loadEntries = async () => {
    if (!subjectId) return;
    setLoading(true);
    try {
      const data = await fetchTeachingPlanEntries(subjectId);
      setEntries(data);
    } catch (err: any) {
      toast.error('Failed to load teaching plan: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (subjectId && isAuthorizedForSubject(subjectId)) {
      loadEntries();
    }
  }, [subjectId]);

  // Load syllabus and approved COs for modal
  const openSyllabusModal = async () => {
    if (!subjectId) return;
    setShowSyllabusModal(true);
    setLoadingSyllabus(true);
    try {
      const qCos = query(collection(db, 'course_outcomes'), where('subjectId', '==', subjectId));
      const snap = await getDocs(qCos);
      const list = snap.docs.map((d) => d.data());
      list.sort((a: any, b: any) => (a.coNumber || 0) - (b.coNumber || 0));
      setCourseOutcomes(list);
    } catch (err: any) {
      console.error('Failed to load course outcomes:', err);
    } finally {
      setLoadingSyllabus(false);
    }
  };

  // Generate dynamic AI syllabus plan for ANY arbitrary hour count
  const handleGenerateDynamicPlan = async () => {
    if (!subjectId || !activeClass || !activeSubject || !user) return;
    setSeeding(true);
    try {
      const qCos = query(collection(db, 'course_outcomes'), where('subjectId', '==', subjectId));
      const snap = await getDocs(qCos);
      const list = snap.docs.map((d) => d.data() as any);
      list.sort((a: any, b: any) => (a.coNumber || 0) - (b.coNumber || 0));

      const res = await generateAndSeedDynamicTeachingPlan(
        subjectId,
        activeSubject.courseName,
        activeSubject.courseCode,
        activeClass.id,
        activeClass.academicYearId,
        user.uid,
        activeSubject.totalSyllabusHours || 39,
        activeSubject.syllabusModules || [],
        list,
        startDateInput
      );

      toast.success(`Successfully generated ${res.count}-hour lecture teaching plan!`);
      await loadEntries();
      setShowGenerateModal(false);
    } catch (err: any) {
      toast.error('Failed to generate teaching plan: ' + err.message);
    } finally {
      setSeeding(false);
    }
  };

  // Inline AI ICT Suggestion
  const handleInlineAiIct = async (entry: TeachingPlanEntry) => {
    if (!activeSubject) return;
    setGeneratingIctId(entry.id);
    try {
      const aiRes = await requestAiTeachingPlanIct(
        activeSubject.courseName,
        entry.chapterTitle,
        entry.topicTitle,
        entry.mappedCoCode,
        'scheduled'
      );
      await updateTeachingPlanEntry(entry.id, {
        ictToolUsed: aiRes.recommendedIct,
        aiSuggestedIct: aiRes.recommendedIct,
        remark: entry.remark || aiRes.suggestedRemark,
      });
      toast.success(`ICT updated to: ${aiRes.recommendedIct}`);
      await loadEntries();
    } catch (err: any) {
      toast.error('AI suggestion failed: ' + err.message);
    } finally {
      setGeneratingIctId(null);
    }
  };

  // Open modal for create or edit
  const handleOpenModal = (entry?: TeachingPlanEntry) => {
    if (entry) {
      setEditingEntry(entry);
      setModalForm({
        sequenceNo: entry.sequenceNo,
        chapterNo: entry.chapterNo,
        chapterTitle: entry.chapterTitle,
        topicTitle: entry.topicTitle,
        mappedCoCode: entry.mappedCoCode,
        plannedDate: entry.plannedDate,
        ictToolUsed: entry.ictToolUsed || 'Chalk Board, Presentation',
        remark: entry.remark || '',
      });
    } else {
      setEditingEntry(null);
      const nextSeq = entries.length > 0 ? Math.max(...entries.map((e) => e.sequenceNo)) + 1 : 1;
      setModalForm({
        sequenceNo: nextSeq,
        chapterNo: 1,
        chapterTitle: '',
        topicTitle: '',
        mappedCoCode: 'CO1',
        plannedDate: new Date().toISOString().slice(0, 10),
        ictToolUsed: 'Chalk Board, Presentation',
        remark: nextSeq === 1 ? 'Introduction' : '',
      });
    }
    setIsModalOpen(true);
  };

  // Modal AI ICT button
  const handleModalAiIct = async () => {
    if (!activeSubject || !modalForm.topicTitle.trim()) {
      toast.error('Please enter a topic title first.');
      return;
    }
    setModalAiLoading(true);
    try {
      const res = await requestAiTeachingPlanIct(
        activeSubject.courseName,
        modalForm.chapterTitle || 'General',
        modalForm.topicTitle,
        modalForm.mappedCoCode,
        'scheduled'
      );
      setModalForm((prev) => ({
        ...prev,
        ictToolUsed: res.recommendedIct,
        remark: prev.remark || res.suggestedRemark,
      }));
      toast.success(`AI suggested: ${res.recommendedIct}`);
    } catch (err: any) {
      toast.error('AI suggestion failed: ' + err.message);
    } finally {
      setModalAiLoading(false);
    }
  };

  // Save Modal Form
  const handleSaveModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subjectId || !activeClass || !user) return;

    try {
      if (editingEntry) {
        await updateTeachingPlanEntry(editingEntry.id, {
          sequenceNo: Number(modalForm.sequenceNo),
          chapterNo: Number(modalForm.chapterNo),
          chapterTitle: modalForm.chapterTitle.trim(),
          topicTitle: modalForm.topicTitle.trim(),
          mappedCoCode: modalForm.mappedCoCode,
          plannedDate: modalForm.plannedDate,
          ictToolUsed: modalForm.ictToolUsed.trim(),
          remark: modalForm.remark.trim(),
        });
        toast.success('Teaching plan topic updated.');
      } else {
        await createTeachingPlanEntry({
          academicYearId: activeClass.academicYearId,
          classId: activeClass.id,
          subjectId,
          teacherUid: user.uid,
          sequenceNo: Number(modalForm.sequenceNo),
          chapterNo: Number(modalForm.chapterNo),
          chapterTitle: modalForm.chapterTitle.trim(),
          topicTitle: modalForm.topicTitle.trim(),
          lecturesRequired: 1,
          mappedCoCode: modalForm.mappedCoCode,
          plannedDate: modalForm.plannedDate,
          actualDate: null,
          ictToolUsed: modalForm.ictToolUsed.trim(),
          remark: modalForm.remark.trim(),
          linkedAttendanceSessionId: null,
          status: 'pending',
        });
        toast.success('New topic added to teaching plan.');
      }
      setIsModalOpen(false);
      await loadEntries();
    } catch (err: any) {
      toast.error('Failed to save topic: ' + err.message);
    }
  };

  // Delete Entry
  const handleDeleteEntry = async (id: string, title: string) => {
    if (!window.confirm(`Delete topic "${title}"?`)) return;
    try {
      await deleteTeachingPlanEntry(id);
      toast.success('Topic removed.');
      await loadEntries();
    } catch (err: any) {
      toast.error('Failed to delete: ' + err.message);
    }
  };

  // Filtered entries
  const filtered = entries.filter((e) => {
    const matchesSearch =
      e.topicTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.chapterTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
      String(e.sequenceNo).includes(searchQuery);
    const matchesCo = coFilter === 'all' || e.mappedCoCode === coFilter;
    return matchesSearch && matchesCo;
  });

  const completedCount = entries.filter((e) => e.status === 'completed' || e.actualDate).length;
  const pendingCount = entries.length - completedCount;

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
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-600 border border-violet-200">
                <BookMarked className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
                  Syllabus Teaching Plan (PCD vs. ACD)
                </h1>
                <p className="text-xs text-slate-500 font-medium">
                  Sheet 8 · Lecture topic schedule, Planned Completion Dates, AI-assisted ICT delivery & attendance synchronization.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <Link
              to={`/teacher/subject/${subjectId}/attendance`}
              className="btn-secondary !text-xs !py-2 !px-3.5 inline-flex items-center gap-1.5"
            >
              <CalendarCheck className="h-4 w-4 text-brand-600" />
              <span>Record Lecture Attendance</span>
            </Link>

            <button
              type="button"
              onClick={openSyllabusModal}
              className="btn-secondary !text-xs !py-2 !px-3.5 inline-flex items-center gap-1.5"
              title="View Official University Syllabus and Approved COs"
            >
              <BookOpen className="h-4 w-4 text-brand-600" />
              <span>View Official Syllabus</span>
            </button>

            <button
              type="button"
              onClick={() => setShowGenerateModal(true)}
              disabled={seeding}
              className="btn-primary !text-xs !py-2 !px-3.5 inline-flex items-center gap-1.5 !bg-violet-600 hover:!bg-violet-700"
            >
              {seeding ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              <span>AI Generate Plan ({activeSubject?.totalSyllabusHours || 39}h)</span>
            </button>

            <button
              type="button"
              onClick={() => handleOpenModal()}
              className="btn-primary !text-xs !py-2 !px-3.5 inline-flex items-center gap-1.5"
            >
              <Plus className="h-4 w-4" />
              <span>Add Topic</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl mx-auto w-full p-6 sm:p-8 space-y-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="glass-card p-4 bg-white border-slate-200 shadow-xs">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-500 mb-1">
              <span>Total Planned Lectures</span>
              <Layers className="h-4 w-4 text-slate-400" />
            </div>
            <div className="text-2xl font-black text-slate-900 font-mono">
              {entries.length}{' '}
              <span className="text-xs font-medium text-slate-400">/ 39 hrs</span>
            </div>
          </div>

          <div className="glass-card p-4 bg-white border-emerald-200 shadow-xs">
            <div className="flex items-center justify-between text-xs font-semibold text-emerald-700 mb-1">
              <span>Completed Lectures</span>
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            </div>
            <div className="text-2xl font-black text-emerald-700 font-mono">
              {completedCount}
            </div>
          </div>

          <div className="glass-card p-4 bg-white border-amber-200 shadow-xs">
            <div className="flex items-center justify-between text-xs font-semibold text-amber-700 mb-1">
              <span>Pending Lectures</span>
              <Clock className="h-4 w-4 text-amber-600" />
            </div>
            <div className="text-2xl font-black text-amber-700 font-mono">
              {pendingCount}
            </div>
          </div>

          <div className="glass-card p-4 bg-white border-brand-200 shadow-xs">
            <div className="flex items-center justify-between text-xs font-semibold text-brand-700 mb-1">
              <span>Syllabus Coverage</span>
              <Sparkles className="h-4 w-4 text-brand-600" />
            </div>
            <div className="text-2xl font-black text-brand-700 font-mono">
              {entries.length > 0
                ? ((completedCount / entries.length) * 100).toFixed(1)
                : '0.0'}
              %
            </div>
          </div>
        </div>

        {/* Filter and Search Bar */}
        <div className="glass-card p-4 bg-white border-slate-200 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search topic or chapter..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input-text !pl-9 !py-1.5 !text-xs w-full"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Filter className="h-3.5 w-3.5 text-slate-400" />
            <span className="text-xs font-semibold text-slate-600">Course Outcome:</span>
            <select
              value={coFilter}
              onChange={(e) => setCoFilter(e.target.value)}
              className="input-text !py-1.5 !text-xs"
            >
              <option value="all">All COs (CO1–CO4)</option>
              <option value="CO1">CO1</option>
              <option value="CO2">CO2</option>
              <option value="CO3">CO3</option>
              <option value="CO4">CO4</option>
            </select>
          </div>
        </div>

        {/* Teaching Plan Table */}
        <div className="glass-card bg-white border-slate-200 shadow-sm overflow-hidden rounded-xl">
          {loading ? (
            <div className="p-12 text-center text-slate-400 text-xs">
              <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-brand-600" />
              Loading syllabus teaching plan...
            </div>
          ) : entries.length === 0 ? (
            <div className="p-12 text-center max-w-lg mx-auto space-y-4">
              <BookMarked className="h-12 w-12 text-slate-300 mx-auto" />
              <div>
                <h3 className="text-sm font-bold text-slate-800">No Teaching Plan Topics Configured</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Official Syllabus for <span className="font-bold text-slate-700">{activeSubject?.courseCode}</span> is configured for{' '}
                  <span className="font-bold text-brand-600 font-mono">{activeSubject?.totalSyllabusHours || 39} contact hours</span>
                  {activeSubject?.syllabusModules?.length ? ` across ${activeSubject.syllabusModules.length} modules` : ''}.
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={openSyllabusModal}
                  className="btn-secondary !text-xs !py-2 !px-4 inline-flex items-center gap-2"
                >
                  <BookOpen className="h-4 w-4 text-brand-600" />
                  <span>View Official Syllabus</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowGenerateModal(true)}
                  disabled={seeding}
                  className="btn-primary !text-xs !py-2 !px-4 inline-flex items-center gap-2 !bg-violet-600 hover:!bg-violet-700"
                >
                  {seeding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  <span>Generate AI Syllabus Plan ({activeSubject?.totalSyllabusHours || 39}h)</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 font-bold border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-3 text-center w-12">Seq</th>
                    <th className="px-3 py-3 w-16 text-center">Ch.</th>
                    <th className="px-4 py-3 min-w-[240px]">Topic Title & Subtopics</th>
                    <th className="px-3 py-3 text-center w-16">CO</th>
                    <th className="px-3 py-3 text-center min-w-[105px]">PCD (Planned)</th>
                    <th className="px-3 py-3 text-center min-w-[105px]">ACD (Actual)</th>
                    <th className="px-4 py-3 min-w-[160px]">ICT Tool Used</th>
                    <th className="px-3 py-3 min-w-[110px]">Remark</th>
                    <th className="px-3 py-3 text-center w-24">Status</th>
                    <th className="px-3 py-3 text-right w-24">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((entry) => {
                    const isCompleted = entry.status === 'completed' || Boolean(entry.actualDate);
                    return (
                      <tr
                        key={entry.id}
                        className={`hover:bg-slate-50/80 transition ${
                          isCompleted ? 'bg-emerald-50/20' : ''
                        }`}
                      >
                        <td className="px-3 py-3 text-center font-mono font-bold text-slate-600">
                          {entry.sequenceNo}
                        </td>
                        <td className="px-3 py-3 text-center font-mono font-semibold text-slate-500">
                          {entry.chapterNo}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-900">{entry.topicTitle}</div>
                          {entry.chapterTitle && (
                            <div className="text-[10px] text-slate-400 font-medium">
                              Ch {entry.chapterNo}: {entry.chapterTitle}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-3 text-center">
                          <span
                            className={`badge text-[10px] font-mono font-bold ${
                              entry.mappedCoCode === 'CO1'
                                ? 'bg-blue-100 text-blue-800'
                                : entry.mappedCoCode === 'CO2'
                                ? 'bg-indigo-100 text-indigo-800'
                                : entry.mappedCoCode === 'CO3'
                                ? 'bg-purple-100 text-purple-800'
                                : 'bg-emerald-100 text-emerald-800'
                            }`}
                          >
                            {entry.mappedCoCode}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-center font-mono text-[11px] text-slate-600">
                          {entry.plannedDate || '—'}
                        </td>
                        <td className="px-3 py-3 text-center">
                          {entry.actualDate ? (
                            <span className="badge bg-emerald-100 text-emerald-800 font-mono text-[10px] font-bold">
                              {entry.actualDate}
                            </span>
                          ) : (
                            <span className="text-slate-300 font-mono text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium text-slate-800">
                              {entry.ictToolUsed || '—'}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleInlineAiIct(entry)}
                              disabled={generatingIctId === entry.id}
                              title="Suggest ICT with AI"
                              className="text-violet-600 hover:text-violet-800 p-0.5 rounded transition disabled:opacity-50"
                            >
                              {generatingIctId === entry.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Sparkles className="h-3 w-3" />
                              )}
                            </button>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-slate-500 text-[11px]">
                          {entry.remark || '—'}
                        </td>
                        <td className="px-3 py-3 text-center">
                          {isCompleted ? (
                            <span className="badge bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-semibold">
                              Completed
                            </span>
                          ) : (
                            <span className="badge bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-semibold">
                              Pending
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => handleOpenModal(entry)}
                              title="Edit topic"
                              className="p-1 text-slate-400 hover:text-brand-600 rounded transition"
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteEntry(entry.id, entry.topicTitle)}
                              title="Delete topic"
                              className="p-1 text-slate-400 hover:text-red-600 rounded transition"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* Add / Edit Topic Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full border border-slate-200 p-6 animate-scale-in">
            <h3 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
              <BookMarked className="h-5 w-5 text-brand-600" />
              <span>{editingEntry ? 'Edit Teaching Plan Topic' : 'Add Syllabus Topic'}</span>
            </h3>

            <form onSubmit={handleSaveModal} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Lecture Seq #</label>
                  <input
                    type="number"
                    required
                    min={1}
                    max={60}
                    value={modalForm.sequenceNo}
                    onChange={(e) =>
                      setModalForm({ ...modalForm, sequenceNo: Number(e.target.value) })
                    }
                    className="input-text w-full !text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Chapter #</label>
                  <input
                    type="number"
                    required
                    min={1}
                    max={20}
                    value={modalForm.chapterNo}
                    onChange={(e) =>
                      setModalForm({ ...modalForm, chapterNo: Number(e.target.value) })
                    }
                    className="input-text w-full !text-xs font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Chapter Title</label>
                <input
                  type="text"
                  placeholder="e.g. Games with Perfect Information"
                  value={modalForm.chapterTitle}
                  onChange={(e) => setModalForm({ ...modalForm, chapterTitle: e.target.value })}
                  className="input-text w-full !text-xs"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Topic Title & Subtopics <span className="text-red-500">*</span>
                </label>
                <textarea
                  required
                  rows={2}
                  placeholder="e.g. Pure Strategy Nash Equilibrium Formulation"
                  value={modalForm.topicTitle}
                  onChange={(e) => setModalForm({ ...modalForm, topicTitle: e.target.value })}
                  className="input-text w-full !text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Mapped CO</label>
                  <select
                    value={modalForm.mappedCoCode}
                    onChange={(e) =>
                      setModalForm({ ...modalForm, mappedCoCode: e.target.value as MappedCoOption })
                    }
                    className="input-text w-full !text-xs font-mono"
                  >
                    <option value="CO1">CO1</option>
                    <option value="CO2">CO2</option>
                    <option value="CO3">CO3</option>
                    <option value="CO4">CO4</option>
                    <option value="-">- (Unmapped)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Planned Date (PCD)
                  </label>
                  <input
                    type="date"
                    required
                    value={modalForm.plannedDate}
                    onChange={(e) => setModalForm({ ...modalForm, plannedDate: e.target.value })}
                    className="input-text w-full !text-xs font-mono"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-semibold text-slate-700">ICT Tool Used</label>
                  <button
                    type="button"
                    onClick={handleModalAiIct}
                    disabled={modalAiLoading}
                    className="text-[11px] font-semibold text-violet-700 hover:text-violet-800 inline-flex items-center gap-1"
                  >
                    {modalAiLoading ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Sparkles className="h-3 w-3" />
                    )}
                    <span>Suggest ICT with AI</span>
                  </button>
                </div>
                <input
                  type="text"
                  placeholder="e.g. Chalk Board, Presentation"
                  value={modalForm.ictToolUsed}
                  onChange={(e) => setModalForm({ ...modalForm, ictToolUsed: e.target.value })}
                  className="input-text w-full !text-xs"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Remark</label>
                <input
                  type="text"
                  placeholder="e.g. Introduction or custom remark"
                  value={modalForm.remark}
                  onChange={(e) => setModalForm({ ...modalForm, remark: e.target.value })}
                  className="input-text w-full !text-xs"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="btn-secondary !text-xs !py-2 !px-3.5"
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary !text-xs !py-2 !px-4">
                  {editingEntry ? 'Save Changes' : 'Create Topic'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Official Syllabus & Outcomes Preview Modal */}
      {showSyllabusModal && activeSubject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-3 sm:p-6">
          <div className="glass-card max-w-3xl w-full max-h-[88vh] flex flex-col bg-white relative rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-slate-100 flex items-start justify-between shrink-0 bg-white">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700 border border-brand-100 shrink-0">
                  <BookOpen className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-slate-900">Official University Syllabus & Approved COs</h2>
                    <span className="badge bg-brand-50 text-brand-700 border border-brand-200 font-mono font-bold">
                      {activeSubject.courseCode}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    {activeSubject.courseName} · {activeSubject.classDivision} · Total {activeSubject.totalSyllabusHours} Contact Hours
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
                  <p className="text-xs font-medium text-slate-500">Loading syllabus details...</p>
                </div>
              ) : (
                <>
                  {activeSubject.prerequisites && (
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-700">
                      <span className="font-bold text-slate-900">Prerequisites: </span>
                      <span>{activeSubject.prerequisites}</span>
                    </div>
                  )}

              {/* Modules Breakdown */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <BookOpen className="h-3.5 w-3.5 text-brand-600" />
                  <span>Modular Syllabus Breakdown ({activeSubject.syllabusModules?.length || 0} Modules)</span>
                </h3>

                {activeSubject.syllabusModules && activeSubject.syllabusModules.length > 0 ? (
                  activeSubject.syllabusModules.map((m) => (
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
                  <div className="p-4 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-800">
                    No custom syllabus modules configured yet by the Admin. The system will use standard accredited curriculum foundations.
                  </div>
                )}
              </div>

              {/* Approved Course Outcomes */}
              <div className="space-y-3 pt-2">
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  <span>Approved NBA Course Outcomes (CO1–CO4)</span>
                </h3>

                {courseOutcomes.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {courseOutcomes.map((co: any) => (
                      <div key={co.coCode} className="p-3 rounded-xl border border-slate-200 bg-slate-50 space-y-1.5">
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

            <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end shrink-0">
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

      {/* Modal 3: AI Teaching Plan Generator Modal */}
      {showGenerateModal && activeSubject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-3 sm:p-6">
          <div className="glass-card max-w-lg w-full bg-white relative rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-slate-100 flex items-start justify-between shrink-0 bg-white">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-700 border border-violet-100 shrink-0">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">AI Syllabus Teaching Plan Generator</h2>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    {activeSubject.courseCode} · {activeSubject.courseName}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowGenerateModal(false)}
                className="text-slate-400 hover:text-slate-600 transition p-1"
                title="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="p-3.5 bg-violet-50/60 rounded-xl border border-violet-100 text-xs text-violet-900 space-y-1.5">
                <div className="flex items-center gap-2 font-bold text-violet-950">
                  <Info className="h-4 w-4 text-violet-700 shrink-0" />
                  <span>Universal Dynamic Generation ({activeSubject.totalSyllabusHours || 39} Lectures)</span>
                </div>
                <p className="leading-relaxed">
                  AI will analyze the Admin's official modular syllabus and generate exactly{' '}
                  <span className="font-bold font-mono">{activeSubject.totalSyllabusHours || 39} sequential 1-hour lectures</span>.
                  Each lecture will have specific subtopics, mapped Course Outcomes (CO1–CO4), and pedagogical ICT recommendations.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Semester Start Date (MWF Schedule Starting Point)
                </label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="date"
                    required
                    value={startDateInput}
                    onChange={(e) => setStartDateInput(e.target.value)}
                    className="input-field !pl-9 text-xs font-mono"
                  />
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Lectures will be automatically spaced across class days (Monday, Wednesday, Friday) from this date.
                </p>
              </div>

              {entries.length > 0 && (
                <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-800">
                  <span className="font-bold">Notice: </span>
                  This subject currently has {entries.length} teaching plan entries. Generating a new plan will update and align all {activeSubject.totalSyllabusHours} lecture topics.
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setShowGenerateModal(false)}
                className="btn-secondary !text-xs !py-2 !px-3.5"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleGenerateDynamicPlan}
                disabled={seeding}
                className="btn-primary !text-xs !py-2 !px-4 !bg-violet-600 hover:!bg-violet-700"
              >
                {seeding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                <span>Generate {activeSubject.totalSyllabusHours || 39}-Lecture Plan</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
