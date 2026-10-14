import { useState, useEffect, type FormEvent } from 'react';
import { 
  collection, 
  doc, 
  onSnapshot, 
  setDoc, 
  deleteDoc, 
  serverTimestamp 
} from 'firebase/firestore';
import toast from 'react-hot-toast';
import { 
  CalendarClock, 
  Plus, 
  Trash2, 
  Clock, 
  MapPin, 
  User, 
  BookOpen, 
  Loader2, 
  X, 
  CheckCircle2 
} from 'lucide-react';
import { db } from '../../lib/firebase';
import type { 
  TimetableSlot, 
  ClassCohort, 
  Subject, 
  TeacherAssignment, 
  AcademicYear 
} from '../../types';

const DAYS_OF_WEEK = [
  { day: 1, name: 'Monday' },
  { day: 2, name: 'Tuesday' },
  { day: 3, name: 'Wednesday' },
  { day: 4, name: 'Thursday' },
  { day: 5, name: 'Friday' },
  { day: 6, name: 'Saturday' },
];

export default function TimetableManagerPage() {
  const [classes, setClasses] = useState<ClassCohort[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [assignments, setAssignments] = useState<TeacherAssignment[]>([]);
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [timetableSlots, setTimetableSlots] = useState<TimetableSlot[]>([]);

  const [selectedClassId, setSelectedClassId] = useState('');
  const [loading, setLoading] = useState(true);

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [formSubjectId, setFormSubjectId] = useState('');
  const [formDayOfWeek, setFormDayOfWeek] = useState<number>(1);
  const [formStartTime, setFormStartTime] = useState('10:15');
  const [formEndTime, setFormEndTime] = useState('11:15');
  const [formRoom, setFormRoom] = useState('CR-402');
  const [formFrom, setFormFrom] = useState('2025-07-01');
  const [formTo, setFormTo] = useState('2026-06-30');

  // Real-time listeners
  useEffect(() => {
    let unsubs: (() => void)[] = [];

    // Classes
    unsubs.push(
      onSnapshot(collection(db, 'classes'), (snap) => {
        const list: ClassCohort[] = [];
        snap.forEach((d) => {
          const c = d.data() as ClassCohort;
          if (c.status === 'active') list.push(c);
        });
        setClasses(list);
        if (list.length > 0) {
          setSelectedClassId((prev) => (prev && list.some((c) => c.id === prev) ? prev : list[0].id));
        }
      })
    );

    // Subjects
    unsubs.push(
      onSnapshot(collection(db, 'subjects'), (snap) => {
        const list: Subject[] = [];
        snap.forEach((d) => {
          const s = d.data() as Subject;
          if (s.status === 'active') list.push(s);
        });
        setSubjects(list);
      })
    );

    // Assignments
    unsubs.push(
      onSnapshot(collection(db, 'teacher_assignments'), (snap) => {
        const list: TeacherAssignment[] = [];
        snap.forEach((d) => {
          const a = d.data() as TeacherAssignment;
          if (a.status === 'active') list.push(a);
        });
        setAssignments(list);
      })
    );

    // Academic Years
    unsubs.push(
      onSnapshot(collection(db, 'academic_years'), (snap) => {
        const list: AcademicYear[] = [];
        snap.forEach((d) => list.push(d.data() as AcademicYear));
        setYears(list);
      })
    );

    // Timetables
    unsubs.push(
      onSnapshot(collection(db, 'timetables'), (snap) => {
        const list: TimetableSlot[] = [];
        snap.forEach((d) => list.push(d.data() as TimetableSlot));
        setTimetableSlots(list);
        setLoading(false);
      })
    );

    return () => unsubs.forEach((u) => u());
  }, []);

  const selectedClass = classes.find((c) => c.id === selectedClassId);

  // Available subjects for the selected class
  const classSubjects = subjects.filter((s) => s.classId === selectedClassId);

  // Slots for the selected class
  const activeClassSlots = timetableSlots.filter(
    (s) => s.classId === selectedClassId && s.status === 'active'
  );

  // Open Create Slot Modal
  function openCreateModal() {
    if (classSubjects.length > 0) {
      setFormSubjectId(classSubjects[0].id);
    } else {
      setFormSubjectId('');
    }

    const currentYear = years.find((y) => y.id === selectedClass?.academicYearId);
    if (currentYear) {
      setFormFrom(currentYear.startDate);
      setFormTo(currentYear.endDate);
    }
    setShowModal(true);
  }

  // Save Timetable Slot
  async function handleSaveSlot(e: FormEvent) {
    e.preventDefault();
    if (!selectedClass || !formSubjectId) {
      toast.error('Class and Subject must be chosen.');
      return;
    }

    setSubmitting(true);
    try {
      const subject = subjects.find((s) => s.id === formSubjectId);
      const assignment = assignments.find((a) => a.subjectId === formSubjectId);
      const dayObj = DAYS_OF_WEEK.find((d) => d.day === Number(formDayOfWeek));

      const cleanTime = formStartTime.replace(/[^0-9]/g, '');
      const slotId = `slot_${selectedClass.id}_day${formDayOfWeek}_${cleanTime}`;

      const slotData: TimetableSlot = {
        id: slotId,
        academicYearId: selectedClass.academicYearId,
        classId: selectedClass.id,
        classDivision: selectedClass.division,
        subjectId: formSubjectId,
        courseCode: subject?.courseCode || '',
        courseName: subject?.courseName || '',
        teacherUid: assignment?.teacherUid || subject?.assignedTeacherUid || 'unassigned',
        teacherName: assignment?.teacherName || subject?.assignedTeacherName || 'Pending Assignment',
        dayOfWeek: Number(formDayOfWeek),
        dayName: dayObj?.name || 'Monday',
        startTime: formStartTime,
        endTime: formEndTime,
        roomNumber: formRoom.trim(),
        effectiveFrom: formFrom,
        effectiveTo: formTo,
        status: 'active',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      await setDoc(doc(db, 'timetables', slotId), slotData, { merge: true });
      toast.success(`Scheduled ${subject?.courseCode} on ${dayObj?.name} at ${formStartTime}`);
      setShowModal(false);
    } catch (err: any) {
      console.error('[EduSync] Timetable error:', err);
      toast.error(err?.message || 'Failed to save timetable slot.');
    } finally {
      setSubmitting(false);
    }
  }

  // Delete Slot
  async function handleDeleteSlot(slot: TimetableSlot) {
    if (!confirm(`Delete ${slot.courseCode} slot on ${slot.dayName} (${slot.startTime})?`)) return;
    try {
      await deleteDoc(doc(db, 'timetables', slot.id));
      toast.success('Timetable slot deleted.');
    } catch {
      toast.error('Failed to delete slot.');
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Class Timetables</h1>
          <p className="mt-1 text-sm text-slate-500">
            Configure recurring lecture slots used for automated lecture attendance and monthly reporting.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          disabled={!selectedClassId || classSubjects.length === 0}
          className="btn-primary"
        >
          <Plus className="h-4 w-4" />
          <span>Add Lecture Slot</span>
        </button>
      </div>

      {/* Class Selector Bar */}
      <div className="glass-card p-5 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase tracking-wider shrink-0">
            <BookOpen className="h-4 w-4 text-brand-600" />
            <span>Select Class Cohort:</span>
          </div>
          {classes.length === 0 ? (
            <p className="text-xs text-amber-700 bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-200">
              No classes configured yet. Add classes under Academic Setup.
            </p>
          ) : (
            <select
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              className="input-field !py-2 !text-sm font-semibold text-slate-900 w-full md:w-80"
            >
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.division} ({c.departmentName})
                </option>
              ))}
            </select>
          )}
        </div>

        {selectedClass && (
          <div className="text-xs text-slate-500 font-medium">
            Active Academic Year: <span className="font-bold text-slate-800">{selectedClass.academicYearLabel}</span> ·{' '}
            <span className="font-bold text-brand-700">{activeClassSlots.length} weekly slots</span> configured
          </div>
        )}
      </div>

      {/* Weekly Schedule Grid (Monday - Saturday) */}
      {loading ? (
        <div className="glass-card p-12 text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-brand-600 mb-3" />
          <p className="text-sm font-medium text-slate-600">Loading schedule...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {DAYS_OF_WEEK.map((day) => {
            const daySlots = activeClassSlots
              .filter((s) => s.dayOfWeek === day.day)
              .sort((a, b) => a.startTime.localeCompare(b.startTime));

            return (
              <div key={day.day} className="glass-card flex flex-col min-h-[360px] overflow-hidden">
                {/* Day Header */}
                <div className="p-3 bg-slate-50/90 border-b border-slate-200 text-center font-bold text-xs uppercase tracking-wider text-slate-700 flex items-center justify-between">
                  <span>{day.name}</span>
                  <span className="badge bg-white text-slate-600 border border-slate-200">
                    {daySlots.length}
                  </span>
                </div>

                {/* Slots List */}
                <div className="p-3 flex-1 space-y-2.5 overflow-y-auto">
                  {daySlots.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-center p-4">
                      <p className="text-[11px] text-slate-400 italic">No scheduled lectures</p>
                    </div>
                  ) : (
                    daySlots.map((slot) => (
                      <div
                        key={slot.id}
                        className="rounded-xl border border-brand-200/70 bg-gradient-to-b from-white to-brand-50/30 p-3 shadow-sm hover:shadow transition relative group"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-mono font-bold text-xs text-brand-700">
                            {slot.courseCode}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleDeleteSlot(slot)}
                            className="text-slate-300 hover:text-red-600 transition opacity-0 group-hover:opacity-100"
                            title="Delete Slot"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        <p className="text-xs font-semibold text-slate-800 line-clamp-1 mb-2">
                          {slot.courseName}
                        </p>

                        <div className="space-y-1 text-[11px] text-slate-500">
                          <div className="flex items-center gap-1.5 font-mono">
                            <Clock className="h-3 w-3 text-slate-400" />
                            <span>{slot.startTime} – {slot.endTime}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <MapPin className="h-3 w-3 text-slate-400" />
                            <span>{slot.roomNumber}</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-slate-600 font-medium truncate">
                            <User className="h-3 w-3 text-slate-400 shrink-0" />
                            <span className="truncate">{slot.teacherName}</span>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: Add Timetable Slot */}
      {showModal && selectedClass && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="glass-card max-w-md w-full p-6 bg-white relative">
            <div className="flex justify-between items-center pb-3 border-b">
              <div>
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <CalendarClock className="h-5 w-5 text-brand-600" />
                  <span>Add Lecture Slot</span>
                </h2>
                <p className="text-xs text-slate-500 font-mono">{selectedClass.division}</p>
              </div>
              <button type="button" onClick={() => setShowModal(false)}>
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>

            <form onSubmit={handleSaveSlot} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Subject / Course</label>
                <select
                  required
                  value={formSubjectId}
                  onChange={(e) => setFormSubjectId(e.target.value)}
                  className="input-field"
                >
                  {classSubjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.courseCode} — {s.courseName}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Day of the Week</label>
                <select
                  value={formDayOfWeek}
                  onChange={(e) => setFormDayOfWeek(Number(e.target.value))}
                  className="input-field"
                >
                  {DAYS_OF_WEEK.map((d) => (
                    <option key={d.day} value={d.day}>{d.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Start Time</label>
                  <input
                    type="time"
                    required
                    value={formStartTime}
                    onChange={(e) => setFormStartTime(e.target.value)}
                    className="input-field font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">End Time</label>
                  <input
                    type="time"
                    required
                    value={formEndTime}
                    onChange={(e) => setFormEndTime(e.target.value)}
                    className="input-field font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Room / Lab Number</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. CR-402, DS Lab 2"
                  value={formRoom}
                  onChange={(e) => setFormRoom(e.target.value)}
                  className="input-field font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Effective From</label>
                  <input
                    type="date"
                    required
                    value={formFrom}
                    onChange={(e) => setFormFrom(e.target.value)}
                    className="input-field font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Effective To</label>
                  <input
                    type="date"
                    required
                    value={formTo}
                    onChange={(e) => setFormTo(e.target.value)}
                    className="input-field font-mono text-xs"
                  />
                </div>
              </div>

              <div className="pt-4 flex justify-end gap-2 border-t mt-4">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
                <button type="submit" disabled={submitting} className="btn-primary">
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Schedule Slot
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
