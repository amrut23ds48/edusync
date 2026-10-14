import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './AuthContext';
import type { TeacherAssignment, Subject, ClassCohort, AcademicYear } from '../types';

interface AcademicContextType {
  assignments: TeacherAssignment[];
  activeAssignment: TeacherAssignment | null;
  activeSubject: Subject | null;
  activeClass: ClassCohort | null;
  activeAcademicYear: AcademicYear | null;
  loading: boolean;
  error: string | null;
  selectSubject: (subjectId: string) => void;
  isAuthorizedForSubject: (subjectId: string) => boolean;
}

const AcademicContext = createContext<AcademicContextType | undefined>(undefined);

export function AcademicProvider({ children }: { children: ReactNode }) {
  const { user, isSuperAdmin } = useAuth();
  const [assignments, setAssignments] = useState<TeacherAssignment[]>([]);
  const [activeSubjectId, setActiveSubjectId] = useState<string | null>(null);

  const [activeSubject, setActiveSubject] = useState<Subject | null>(null);
  const [activeClass, setActiveClass] = useState<ClassCohort | null>(null);
  const [activeAcademicYear, setActiveAcademicYear] = useState<AcademicYear | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 1. Listen for active assignments for this user
  useEffect(() => {
    if (!user) {
      setAssignments([]);
      setActiveSubjectId(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    let q;
    if (isSuperAdmin) {
      // Super Admin can view all assignments
      q = query(collection(db, 'teacher_assignments'), where('status', '==', 'active'));
    } else {
      // Teacher views only their own active assignments
      q = query(
        collection(db, 'teacher_assignments'),
        where('teacherUid', '==', user.uid),
        where('status', '==', 'active')
      );
    }

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const list: TeacherAssignment[] = [];
        snapshot.forEach((d) => list.push(d.data() as TeacherAssignment));
        setAssignments(list);
        setLoading(false);
      },
      (err) => {
        console.error('[CAGS] Error listening to teacher assignments:', err);
        setError('Failed to load assignments.');
        setLoading(false);
      }
    );

    return () => unsub();
  }, [user, isSuperAdmin]);

  // 2. When activeSubjectId changes, subscribe to subject, class, and academic year docs
  useEffect(() => {
    if (!activeSubjectId) {
      setActiveSubject(null);
      setActiveClass(null);
      setActiveAcademicYear(null);
      return;
    }

    const unsubs: (() => void)[] = [];

    // Subject listener
    unsubs.push(
      onSnapshot(doc(db, 'subjects', activeSubjectId), (docSnap) => {
        if (docSnap.exists()) {
          const subData = docSnap.data() as Subject;
          setActiveSubject(subData);

          // Class listener
          if (subData.classId) {
            unsubs.push(
              onSnapshot(doc(db, 'classes', subData.classId), (classSnap) => {
                if (classSnap.exists()) {
                  setActiveClass(classSnap.data() as ClassCohort);
                }
              })
            );
          }

          // Academic Year listener
          if (subData.academicYearId) {
            unsubs.push(
              onSnapshot(doc(db, 'academic_years', subData.academicYearId), (yearSnap) => {
                if (yearSnap.exists()) {
                  setActiveAcademicYear(yearSnap.data() as AcademicYear);
                }
              })
            );
          }
        } else {
          setActiveSubject(null);
        }
      })
    );

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [activeSubjectId]);

  const activeAssignment = assignments.find((a) => a.subjectId === activeSubjectId) || null;

  function selectSubject(subjectId: string) {
    setActiveSubjectId(subjectId);
  }

  function isAuthorizedForSubject(subjectId: string): boolean {
    if (isSuperAdmin) return true;
    return assignments.some((a) => a.subjectId === subjectId && a.status === 'active');
  }

  return (
    <AcademicContext.Provider
      value={{
        assignments,
        activeAssignment,
        activeSubject,
        activeClass,
        activeAcademicYear,
        loading,
        error,
        selectSubject,
        isAuthorizedForSubject,
      }}
    >
      {children}
    </AcademicContext.Provider>
  );
}

export function useAcademic() {
  const context = useContext(AcademicContext);
  if (!context) {
    throw new Error('useAcademic must be used within an AcademicProvider');
  }
  return context;
}
