import { useState, useEffect, type FormEvent } from 'react';
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
import toast from 'react-hot-toast';
import { 
  Users, 
  UserPlus, 
  Search, 
  BookOpen, 
  CheckCircle2, 
  Ban, 
  RotateCcw, 
  Loader2, 
  X, 
  KeyRound, 
  Trash2 
} from 'lucide-react';
import { db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { provisionTeacherAccount } from '../../services/adminAuthService';
import type { 
  UserProfile, 
  Department, 
  TeacherAssignment, 
  AcademicYear, 
  ClassCohort, 
  Subject 
} from '../../types';

export default function TeachersManagementPage() {
  const { user } = useAuth();
  const [teachers, setTeachers] = useState<UserProfile[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [assignments, setAssignments] = useState<TeacherAssignment[]>([]);
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [classes, setClasses] = useState<ClassCohort[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);

  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showViewAssignmentsModal, setShowViewAssignmentsModal] = useState(false);
  const [selectedTeacher, setSelectedTeacher] = useState<UserProfile | null>(null);

  // Form State: Create Teacher
  const [teacherEmail, setTeacherEmail] = useState('');
  const [teacherPassword, setTeacherPassword] = useState('');
  const [teacherName, setTeacherName] = useState('');
  const [teacherDeptId, setTeacherDeptId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Form State: Assign Subject
  const [assignYearId, setAssignYearId] = useState('');
  const [assignClassId, setAssignClassId] = useState('');
  const [assignSubjectId, setAssignSubjectId] = useState('');
  const [assigning, setAssigning] = useState(false);

  // Real-time Firestore Subscriptions
  useEffect(() => {
    let unsubs: (() => void)[] = [];

    // Teachers
    unsubs.push(
      onSnapshot(
        query(collection(db, 'users'), where('role', '==', 'teacher')),
        (snap) => {
          const list: UserProfile[] = [];
          snap.forEach((d) => list.push(d.data() as UserProfile));
          list.sort((a, b) => a.displayName.localeCompare(b.displayName));
          setTeachers(list);
          setLoading(false);
        }
      )
    );

    // Departments
    unsubs.push(
      onSnapshot(collection(db, 'departments'), (snap) => {
        const list: Department[] = [];
        snap.forEach((d) => {
          const data = d.data() as Department;
          if (data.status === 'active') list.push(data);
        });
        setDepartments(list);
        if (list.length > 0 && !teacherDeptId) {
          setTeacherDeptId(list[0].id);
        }
      })
    );

    // Assignments
    unsubs.push(
      onSnapshot(collection(db, 'teacher_assignments'), (snap) => {
        const list: TeacherAssignment[] = [];
        snap.forEach((d) => list.push(d.data() as TeacherAssignment));
        setAssignments(list);
      })
    );

    // Academic Years
    unsubs.push(
      onSnapshot(collection(db, 'academic_years'), (snap) => {
        const list: AcademicYear[] = [];
        snap.forEach((d) => list.push(d.data() as AcademicYear));
        setYears(list);
        if (list.length > 0 && !assignYearId) {
          const current = list.find((y) => y.isCurrent) || list[0];
          setAssignYearId(current.id);
        }
      })
    );

    // Classes
    unsubs.push(
      onSnapshot(collection(db, 'classes'), (snap) => {
        const list: ClassCohort[] = [];
        snap.forEach((d) => list.push(d.data() as ClassCohort));
        setClasses(list);
      })
    );

    // Subjects
    unsubs.push(
      onSnapshot(collection(db, 'subjects'), (snap) => {
        const list: Subject[] = [];
        snap.forEach((d) => list.push(d.data() as Subject));
        setSubjects(list);
      })
    );

    return () => unsubs.forEach((u) => u());
  }, []);

  // Filtered classes and subjects for cascading dropdowns
  const availableClasses = classes.filter(
    (c) => c.academicYearId === assignYearId && c.status === 'active'
  );

  const availableSubjects = subjects.filter(
    (s) => s.classId === assignClassId && s.status === 'active'
  );

  // Create Teacher Account
  async function handleCreateTeacher(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSubmitting(true);
    try {
      const dept = departments.find((d) => d.id === teacherDeptId);
      await provisionTeacherAccount({
        email: teacherEmail.trim(),
        initialPassword: teacherPassword,
        displayName: teacherName.trim(),
        departmentId: teacherDeptId,
        departmentName: dept?.name || '',
        superAdminUid: user.uid,
      });

      toast.success(`Provisioned teacher: ${teacherEmail}`);
      setShowCreateModal(false);
      setTeacherEmail('');
      setTeacherPassword('');
      setTeacherName('');
    } catch (err: any) {
      console.error('[CAGS] Error provisioning teacher:', err);
      toast.error(err?.message || 'Failed to provision teacher account.');
    } finally {
      setSubmitting(false);
    }
  }

  // Toggle Teacher Status (active / disabled)
  async function toggleTeacherStatus(teacher: UserProfile) {
    const newStatus = teacher.status === 'active' ? 'disabled' : 'active';
    try {
      await updateDoc(doc(db, 'users', teacher.uid), {
        status: newStatus,
        updatedAt: serverTimestamp(),
      });
      toast.success(
        newStatus === 'active'
          ? `Activated teacher: ${teacher.displayName}`
          : `Disabled teacher: ${teacher.displayName}`
      );
    } catch (err: any) {
      toast.error('Failed to update status.');
    }
  }

  // Assign Subject to Teacher
  async function handleAssignSubject(e: FormEvent) {
    e.preventDefault();
    if (!user || !selectedTeacher || !assignSubjectId) {
      toast.error('Please choose a valid subject.');
      return;
    }

    setAssigning(true);
    try {
      const subject = subjects.find((s) => s.id === assignSubjectId);
      const parentClass = classes.find((c) => c.id === subject?.classId);
      const assignmentId = `${selectedTeacher.uid}_${assignSubjectId}`;

      const assignmentData: TeacherAssignment = {
        id: assignmentId,
        teacherUid: selectedTeacher.uid,
        teacherName: selectedTeacher.displayName,
        teacherEmail: selectedTeacher.email,
        subjectId: assignSubjectId,
        courseCode: subject?.courseCode || '',
        courseName: subject?.courseName || '',
        classId: parentClass?.id || '',
        classDivision: parentClass?.division || '',
        academicYearId: parentClass?.academicYearId || '',
        departmentId: parentClass?.departmentId || '',
        status: 'active',
        assignedAt: serverTimestamp(),
        assignedBy: user.uid,
      };

      // 1. Write teacher_assignments doc
      await setDoc(doc(db, 'teacher_assignments', assignmentId), assignmentData, { merge: true });

      // 2. Update subjects doc with assigned teacher info
      await updateDoc(doc(db, 'subjects', assignSubjectId), {
        assignedTeacherUid: selectedTeacher.uid,
        assignedTeacherName: selectedTeacher.displayName,
        updatedAt: serverTimestamp(),
      });

      toast.success(`Assigned ${subject?.courseCode} to ${selectedTeacher.displayName}`);
      setShowAssignModal(false);
    } catch (err: any) {
      console.error('[CAGS] Assignment error:', err);
      toast.error(err?.message || 'Failed to assign subject.');
    } finally {
      setAssigning(false);
    }
  }

  // Revoke Assignment
  async function handleRevokeAssignment(assignment: TeacherAssignment) {
    try {
      await updateDoc(doc(db, 'teacher_assignments', assignment.id), {
        status: 'revoked',
      });
      await updateDoc(doc(db, 'subjects', assignment.subjectId), {
        assignedTeacherUid: '',
        assignedTeacherName: '',
        updatedAt: serverTimestamp(),
      });
      toast.success(`Revoked assignment for ${assignment.courseCode}`);
    } catch {
      toast.error('Failed to revoke assignment.');
    }
  }

  const filteredTeachers = teachers.filter(
    (t) =>
      t.displayName.toLowerCase().includes(search.toLowerCase()) ||
      t.email.toLowerCase().includes(search.toLowerCase()) ||
      (t.departmentName && t.departmentName.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Teachers &amp; Assignments</h1>
          <p className="mt-1 text-sm text-slate-500">
            Provision teacher accounts and assign teaching responsibilities per Academic Year and Class.
          </p>
        </div>
        <button
          id="btn-add-teacher"
          type="button"
          onClick={() => setShowCreateModal(true)}
          className="btn-primary"
        >
          <UserPlus className="h-4 w-4" />
          <span>Provision Teacher</span>
        </button>
      </div>

      {/* Search & Counters */}
      <div className="glass-card p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name, email, department..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-field !py-2 !pl-9"
          />
        </div>
        <div className="text-xs font-medium text-slate-500">
          Showing <span className="font-bold text-slate-800">{filteredTeachers.length}</span> of{' '}
          <span className="font-bold text-slate-800">{teachers.length}</span> provisioned teachers
        </div>
      </div>

      {/* Teachers Table */}
      {loading ? (
        <div className="glass-card p-12 text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-brand-600 mb-3" />
          <p className="text-sm font-medium text-slate-600">Loading teacher roster...</p>
        </div>
      ) : filteredTeachers.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <Users className="mx-auto h-12 w-12 text-slate-300 mb-3" />
          <h3 className="text-base font-semibold text-slate-700">No teachers provisioned yet</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            {search ? 'No teacher matches your search filter.' : 'Provision your first faculty account (e.g. prof.janisar@aiktc.ac.in).'}
          </p>
          {!search && (
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="btn-primary mt-4 !py-2 !text-xs"
            >
              <UserPlus className="h-4 w-4" /> Provision Teacher
            </button>
          )}
        </div>
      ) : (
        <div className="glass-card overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50/80 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase tracking-wider">
              <tr>
                <th className="py-3.5 px-6">Faculty Name</th>
                <th className="py-3.5 px-6">Login Email</th>
                <th className="py-3.5 px-6">Department</th>
                <th className="py-3.5 px-6">Assigned Subjects</th>
                <th className="py-3.5 px-6">Status</th>
                <th className="py-3.5 px-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredTeachers.map((t) => {
                const isActive = t.status === 'active';
                const teacherActiveAssignments = assignments.filter(
                  (a) => a.teacherUid === t.uid && a.status === 'active'
                );

                return (
                  <tr key={t.uid} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-4 px-6 font-bold text-slate-900 flex items-center gap-2">
                      <div className="h-8 w-8 rounded-full bg-brand-100 text-brand-700 text-xs font-bold flex items-center justify-center">
                        {t.displayName.charAt(0).toUpperCase()}
                      </div>
                      <span>{t.displayName}</span>
                    </td>
                    <td className="py-4 px-6 font-mono text-xs text-slate-600">{t.email}</td>
                    <td className="py-4 px-6 text-xs text-slate-600">
                      {t.departmentName || <span className="text-slate-400 italic">Not set</span>}
                    </td>
                    <td className="py-4 px-6">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedTeacher(t);
                          setShowViewAssignmentsModal(true);
                        }}
                        className="badge bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition border border-indigo-200 cursor-pointer"
                      >
                        {teacherActiveAssignments.length} course(s) mapped
                      </button>
                    </td>
                    <td className="py-4 px-6">
                      <span
                        className={`badge ${
                          isActive
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-red-50 text-red-700 border border-red-200'
                        }`}
                      >
                        {t.status}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-right space-x-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedTeacher(t);
                          setShowAssignModal(true);
                        }}
                        className="btn-primary !py-1 !px-2.5 !text-xs"
                        title="Assign Subject to Teacher"
                      >
                        <BookOpen className="h-3.5 w-3.5" /> Assign Subject
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleTeacherStatus(t)}
                        className={`btn-secondary !py-1 !px-2.5 !text-xs ${
                          isActive ? 'text-amber-700 hover:bg-amber-50' : 'text-emerald-700 hover:bg-emerald-50'
                        }`}
                        title={isActive ? 'Disable Teacher' : 'Activate Teacher'}
                      >
                        {isActive ? <Ban className="h-3.5 w-3.5" /> : <RotateCcw className="h-3.5 w-3.5" />}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal 1: Create Teacher Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="glass-card max-w-md w-full p-6 bg-white relative">
            <div className="flex justify-between items-center pb-3 border-b">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <UserPlus className="h-5 w-5 text-brand-600" />
                <span>Provision Faculty Account</span>
              </h2>
              <button type="button" onClick={() => setShowCreateModal(false)}>
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>
            <form onSubmit={handleCreateTeacher} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Faculty Full Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Prof. Mohd Janisar"
                  value={teacherName}
                  onChange={(e) => setTeacherName(e.target.value)}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Institutional Email</label>
                <input
                  type="email"
                  required
                  placeholder="prof.janisar@aiktc.ac.in"
                  value={teacherEmail}
                  onChange={(e) => setTeacherEmail(e.target.value)}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Temporary Password</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  placeholder="••••••••"
                  value={teacherPassword}
                  onChange={(e) => setTeacherPassword(e.target.value)}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Department</label>
                <select
                  required
                  value={teacherDeptId}
                  onChange={(e) => setTeacherDeptId(e.target.value)}
                  className="input-field"
                >
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>{d.name} ({d.code})</option>
                  ))}
                </select>
              </div>

              <div className="pt-4 flex justify-end gap-2 border-t mt-4">
                <button type="button" onClick={() => setShowCreateModal(false)} className="btn-secondary">Cancel</button>
                <button type="submit" disabled={submitting} className="btn-primary">
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                  Provision Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Assign Subject Modal */}
      {showAssignModal && selectedTeacher && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="glass-card max-w-md w-full p-6 bg-white relative">
            <div className="flex justify-between items-center pb-3 border-b">
              <div>
                <h2 className="text-base font-bold text-slate-900">Assign Subject</h2>
                <p className="text-xs text-brand-600 font-semibold">{selectedTeacher.displayName}</p>
              </div>
              <button type="button" onClick={() => setShowAssignModal(false)}>
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>
            <form onSubmit={handleAssignSubject} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Academic Year</label>
                <select
                  required
                  value={assignYearId}
                  onChange={(e) => {
                    setAssignYearId(e.target.value);
                    setAssignClassId('');
                    setAssignSubjectId('');
                  }}
                  className="input-field"
                >
                  {years.map((y) => (
                    <option key={y.id} value={y.id}>{y.yearLabel}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Class Cohort</label>
                <select
                  required
                  value={assignClassId}
                  onChange={(e) => {
                    setAssignClassId(e.target.value);
                    setAssignSubjectId('');
                  }}
                  className="input-field"
                >
                  <option value="">-- Choose Class --</option>
                  {availableClasses.map((c) => (
                    <option key={c.id} value={c.id}>{c.division} ({c.departmentName})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Subject / Course</label>
                <select
                  required
                  value={assignSubjectId}
                  onChange={(e) => setAssignSubjectId(e.target.value)}
                  className="input-field"
                  disabled={!assignClassId}
                >
                  <option value="">-- Choose Course --</option>
                  {availableSubjects.map((s) => (
                    <option key={s.id} value={s.id}>{s.courseCode} — {s.courseName}</option>
                  ))}
                </select>
              </div>

              <div className="pt-4 flex justify-end gap-2 border-t mt-4">
                <button type="button" onClick={() => setShowAssignModal(false)} className="btn-secondary">Cancel</button>
                <button type="submit" disabled={assigning || !assignSubjectId} className="btn-primary">
                  {assigning ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Confirm Assignment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 3: View Teacher's Active Assignments */}
      {showViewAssignmentsModal && selectedTeacher && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="glass-card max-w-xl w-full p-6 bg-white relative">
            <div className="flex justify-between items-center pb-3 border-b">
              <div>
                <h2 className="text-base font-bold text-slate-900">Mapped Assignments</h2>
                <p className="text-xs text-brand-600 font-semibold">{selectedTeacher.displayName} ({selectedTeacher.email})</p>
              </div>
              <button type="button" onClick={() => setShowViewAssignmentsModal(false)}>
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>

            <div className="mt-4 max-h-96 overflow-y-auto space-y-2">
              {assignments.filter((a) => a.teacherUid === selectedTeacher.uid && a.status === 'active').length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-8">No active assignments mapped to this teacher.</p>
              ) : (
                assignments
                  .filter((a) => a.teacherUid === selectedTeacher.uid && a.status === 'active')
                  .map((a) => (
                    <div key={a.id} className="p-3 border rounded-xl flex items-center justify-between bg-slate-50">
                      <div>
                        <div className="font-bold text-slate-900 text-sm">{a.courseCode} — {a.courseName}</div>
                        <div className="text-xs text-slate-500 font-mono mt-0.5">
                          Class: {a.classDivision} · AY: {a.academicYearId}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRevokeAssignment(a)}
                        className="btn-secondary !py-1 !px-2 !text-xs !text-red-600 hover:!bg-red-50"
                        title="Revoke Assignment"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Revoke
                      </button>
                    </div>
                  ))
              )}
            </div>

            <div className="pt-4 flex justify-end border-t mt-4">
              <button type="button" onClick={() => setShowViewAssignmentsModal(false)} className="btn-secondary">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
