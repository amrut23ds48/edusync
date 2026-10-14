import {
  collection,
  doc,
  getDocs,
  query,
  where,
  orderBy,
  writeBatch,
  serverTimestamp,
  updateDoc,
  deleteDoc,
  setDoc,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { TeachingPlanEntry, MappedCoOption, SyllabusModule } from '../types';
import { requestAiFullSyllabusPlan, type AiGeneratedLecture } from './cagsAiService';

export const TEACHING_PLAN_COLLECTION = 'teaching_plan_entries';

export async function fetchTeachingPlanEntries(subjectId: string): Promise<TeachingPlanEntry[]> {
  try {
    const q = query(
      collection(db, TEACHING_PLAN_COLLECTION),
      where('subjectId', '==', subjectId),
      orderBy('sequenceNo', 'asc')
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as TeachingPlanEntry[];
  } catch (err) {
    // Fallback if index is still building: query by subjectId only then sort in memory
    const qFallback = query(
      collection(db, TEACHING_PLAN_COLLECTION),
      where('subjectId', '==', subjectId)
    );
    const snap = await getDocs(qFallback);
    const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as TeachingPlanEntry[];
    return list.sort((a, b) => a.sequenceNo - b.sequenceNo);
  }
}

export async function createTeachingPlanEntry(
  entry: Omit<TeachingPlanEntry, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const docRef = doc(collection(db, TEACHING_PLAN_COLLECTION));
  await setDoc(docRef, {
    ...entry,
    id: docRef.id,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function updateTeachingPlanEntry(
  id: string,
  updates: Partial<TeachingPlanEntry>
): Promise<void> {
  const docRef = doc(db, TEACHING_PLAN_COLLECTION, id);
  await updateDoc(docRef, {
    ...updates,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteTeachingPlanEntry(id: string): Promise<void> {
  const docRef = doc(db, TEACHING_PLAN_COLLECTION, id);
  await deleteDoc(docRef);
}

/**
 * Standard 39-hour syllabus topics for Game Theory for Data Science
 * aligned directly with cags-theory.xlsx (Sheet 8) and prototype specifications.
 */
export const STANDARD_SYLLABUS_TOPICS: Array<{
  chapterNo: number;
  chapterTitle: string;
  topicTitle: string;
  mappedCoCode: MappedCoOption;
  defaultIct: string;
}> = [
  // Chapter 1: Introduction to Strategic Games (6 lectures - CO1)
  { chapterNo: 1, chapterTitle: 'Introduction to Strategic Games', topicTitle: 'Course Overview, NBA/OBE Rubric, Game Theory Foundations', mappedCoCode: 'CO1', defaultIct: 'Presentation' },
  { chapterNo: 1, chapterTitle: 'Introduction to Strategic Games', topicTitle: 'Strategic Form Games, Players, Strategies & Payoffs', mappedCoCode: 'CO1', defaultIct: 'Chalk Board, Presentation' },
  { chapterNo: 1, chapterTitle: 'Introduction to Strategic Games', topicTitle: 'Prisoner Dilemma & Social Dilemmas in Data Networks', mappedCoCode: 'CO1', defaultIct: 'Chalk Board' },
  { chapterNo: 1, chapterTitle: 'Introduction to Strategic Games', topicTitle: 'Strict and Weak Dominance Concepts', mappedCoCode: 'CO1', defaultIct: 'Chalk Board' },
  { chapterNo: 1, chapterTitle: 'Introduction to Strategic Games', topicTitle: 'Iterated Elimination of Strictly Dominated Strategies (IESDS)', mappedCoCode: 'CO1', defaultIct: 'Chalk Board, Presentation' },
  { chapterNo: 1, chapterTitle: 'Introduction to Strategic Games', topicTitle: 'Tutorial 1: Dominance Solvability and Payoff Formulation', mappedCoCode: 'CO1', defaultIct: 'Chalk Board' },

  // Chapter 2: Games with Perfect Information (7 lectures - CO2)
  { chapterNo: 2, chapterTitle: 'Games with Perfect Information', topicTitle: 'Pure Strategy Nash Equilibrium Formulation', mappedCoCode: 'CO2', defaultIct: 'Chalk Board, Presentation' },
  { chapterNo: 2, chapterTitle: 'Games with Perfect Information', topicTitle: 'Cournot Oligopoly Duopoly Model of Competition', mappedCoCode: 'CO2', defaultIct: 'Chalk Board' },
  { chapterNo: 2, chapterTitle: 'Games with Perfect Information', topicTitle: 'Bertrand Price Competition with Capacity Constraints', mappedCoCode: 'CO2', defaultIct: 'Chalk Board' },
  { chapterNo: 2, chapterTitle: 'Games with Perfect Information', topicTitle: 'Stackelberg Leader-Follower Formulation', mappedCoCode: 'CO2', defaultIct: 'Presentation' },
  { chapterNo: 2, chapterTitle: 'Games with Perfect Information', topicTitle: 'Location Games & Hotelling Spatial Competition', mappedCoCode: 'CO2', defaultIct: 'Chalk Board' },
  { chapterNo: 2, chapterTitle: 'Games with Perfect Information', topicTitle: 'Applications: Web Search Ranking & Ad Auctions Overview', mappedCoCode: 'CO2', defaultIct: 'Online Tool' },
  { chapterNo: 2, chapterTitle: 'Games with Perfect Information', topicTitle: 'Tutorial 2: Strategic Equilibrium Payoff Derivations', mappedCoCode: 'CO2', defaultIct: 'Chalk Board' },

  // Chapter 3: Mixed Strategy Equilibrium (7 lectures - CO2)
  { chapterNo: 3, chapterTitle: 'Mixed Strategy Equilibrium', topicTitle: 'Mixed Strategy Nash Equilibrium (MSNE) Foundations', mappedCoCode: 'CO2', defaultIct: 'Chalk Board' },
  { chapterNo: 3, chapterTitle: 'Mixed Strategy Equilibrium', topicTitle: 'Matching Pennies & Zero-Sum Matrix Games', mappedCoCode: 'CO2', defaultIct: 'Chalk Board, Presentation' },
  { chapterNo: 3, chapterTitle: 'Mixed Strategy Equilibrium', topicTitle: 'Battle of the Sexes & Coordination Games', mappedCoCode: 'CO2', defaultIct: 'Presentation' },
  { chapterNo: 3, chapterTitle: 'Mixed Strategy Equilibrium', topicTitle: 'Von Neumann Minimax Theorem in Zero-Sum Games', mappedCoCode: 'CO2', defaultIct: 'Chalk Board' },
  { chapterNo: 3, chapterTitle: 'Mixed Strategy Equilibrium', topicTitle: 'Algorithmic Computation of Mixed Equilibria', mappedCoCode: 'CO2', defaultIct: 'Online Tool' },
  { chapterNo: 3, chapterTitle: 'Mixed Strategy Equilibrium', topicTitle: 'Correlated Equilibrium & Public Signals', mappedCoCode: 'CO2', defaultIct: 'Presentation' },
  { chapterNo: 3, chapterTitle: 'Mixed Strategy Equilibrium', topicTitle: 'Tutorial 3: Solving 2x2 and 3x3 Mixed Strategy Games', mappedCoCode: 'CO2', defaultIct: 'Chalk Board' },

  // Chapter 4: Extensive Games & Dynamic Interaction (7 lectures - CO3)
  { chapterNo: 4, chapterTitle: 'Extensive Games & Dynamic Interaction', topicTitle: 'Game Trees, Information Sets & Backward Induction', mappedCoCode: 'CO3', defaultIct: 'Chalk Board, Presentation' },
  { chapterNo: 4, chapterTitle: 'Extensive Games & Dynamic Interaction', topicTitle: 'Subgame Perfect Nash Equilibrium (SPNE)', mappedCoCode: 'CO3', defaultIct: 'Chalk Board' },
  { chapterNo: 4, chapterTitle: 'Extensive Games & Dynamic Interaction', topicTitle: 'Centipede Game & Backward Induction Paradox', mappedCoCode: 'CO3', defaultIct: 'Presentation' },
  { chapterNo: 4, chapterTitle: 'Extensive Games & Dynamic Interaction', topicTitle: 'Entry Deterrence and Credible Threat Modeling', mappedCoCode: 'CO3', defaultIct: 'Chalk Board' },
  { chapterNo: 4, chapterTitle: 'Extensive Games & Dynamic Interaction', topicTitle: 'Bayesian Games: Incomplete Information Modeling', mappedCoCode: 'CO3', defaultIct: 'Chalk Board, Presentation' },
  { chapterNo: 4, chapterTitle: 'Extensive Games & Dynamic Interaction', topicTitle: 'Signaling Games & Job Market Signaling (Spence Model)', mappedCoCode: 'CO3', defaultIct: 'Presentation' },
  { chapterNo: 4, chapterTitle: 'Extensive Games & Dynamic Interaction', topicTitle: 'Tutorial 4: Extensive Form Subgame Perfection Analysis', mappedCoCode: 'CO3', defaultIct: 'Chalk Board' },

  // Chapter 5: Repeated Games & Cooperative Foundations (6 lectures - CO3)
  { chapterNo: 5, chapterTitle: 'Repeated Games & Cooperative Foundations', topicTitle: 'Infinitely Repeated Games & Discount Factor Delta', mappedCoCode: 'CO3', defaultIct: 'Chalk Board' },
  { chapterNo: 5, chapterTitle: 'Repeated Games & Cooperative Foundations', topicTitle: 'Grim Trigger Strategy & Tit-for-Tat Dynamics', mappedCoCode: 'CO3', defaultIct: 'Presentation' },
  { chapterNo: 5, chapterTitle: 'Repeated Games & Cooperative Foundations', topicTitle: 'Folk Theorem for Infinitely Repeated Games', mappedCoCode: 'CO3', defaultIct: 'Chalk Board, Presentation' },
  { chapterNo: 5, chapterTitle: 'Repeated Games & Cooperative Foundations', topicTitle: 'Nash Bargaining Solution & Axiomatic Approach', mappedCoCode: 'CO3', defaultIct: 'Chalk Board' },
  { chapterNo: 5, chapterTitle: 'Repeated Games & Cooperative Foundations', topicTitle: 'Rubinstein Alternating-Offer Bargaining Model', mappedCoCode: 'CO3', defaultIct: 'Chalk Board' },
  { chapterNo: 5, chapterTitle: 'Repeated Games & Cooperative Foundations', topicTitle: 'Tutorial 5: Sustaining Cooperation under Discounting', mappedCoCode: 'CO3', defaultIct: 'Chalk Board' },

  // Chapter 6: Mechanism Design & Data Science Applications (6 lectures - CO4)
  { chapterNo: 6, chapterTitle: 'Mechanism Design & Applications', topicTitle: 'Mechanism Design Principles & Revelation Principle', mappedCoCode: 'CO4', defaultIct: 'Presentation' },
  { chapterNo: 6, chapterTitle: 'Mechanism Design & Applications', topicTitle: 'Vickrey-Clarke-Groves (VCG) Mechanism Formulation', mappedCoCode: 'CO4', defaultIct: 'Chalk Board, Presentation' },
  { chapterNo: 6, chapterTitle: 'Mechanism Design & Applications', topicTitle: 'Auction Formats: English, Dutch, First-Price & Second-Price', mappedCoCode: 'CO4', defaultIct: 'Online Tool' },
  { chapterNo: 6, chapterTitle: 'Mechanism Design & Applications', topicTitle: 'Generalized Second Price (GSP) Auction in Search Engines', mappedCoCode: 'CO4', defaultIct: 'Presentation' },
  { chapterNo: 6, chapterTitle: 'Mechanism Design & Applications', topicTitle: 'Game Theoretic Routing & Braess Paradox in Traffic Networks', mappedCoCode: 'CO4', defaultIct: 'Chalk Board, Presentation' },
  { chapterNo: 6, chapterTitle: 'Mechanism Design & Applications', topicTitle: 'Review of Course Outcomes, Action Plans & Comprehensive Review', mappedCoCode: 'CO4', defaultIct: 'Quiz' },
];

/**
 * Seeds a full 39-hour teaching plan for the subject if not already seeded.
 * Generates realistic planned dates (PCD) starting from 2026-07-06 across MWF.
 */
export async function seedStandardTeachingPlanIfEmpty(
  subjectId: string,
  classId: string,
  academicYearId: string,
  teacherUid: string
): Promise<{ seeded: boolean; count: number }> {
  const existing = await fetchTeachingPlanEntries(subjectId);
  if (existing.length > 0) {
    return { seeded: false, count: existing.length };
  }

  const batch = writeBatch(db);
  const startDate = new Date(2026, 6, 6); // Monday, July 6, 2026
  let currentDate = new Date(startDate);
  let lectureIdx = 0;

  for (const topic of STANDARD_SYLLABUS_TOPICS) {
    lectureIdx++;
    // Advance date to next MWF (Monday=1, Wednesday=3, Friday=5)
    while (
      currentDate.getDay() !== 1 &&
      currentDate.getDay() !== 3 &&
      currentDate.getDay() !== 5
    ) {
      currentDate.setDate(currentDate.getDate() + 1);
    }

    const plannedDate = currentDate.toISOString().slice(0, 10);
    const docId = `tp_${subjectId}_lect_${String(lectureIdx).padStart(2, '0')}`;
    const docRef = doc(db, TEACHING_PLAN_COLLECTION, docId);

    const entry: TeachingPlanEntry = {
      id: docId,
      academicYearId,
      classId,
      subjectId,
      teacherUid,
      sequenceNo: lectureIdx,
      chapterNo: topic.chapterNo,
      chapterTitle: topic.chapterTitle,
      topicTitle: topic.topicTitle,
      lecturesRequired: 1,
      mappedCoCode: topic.mappedCoCode,
      plannedDate,
      actualDate: null,
      ictToolUsed: topic.defaultIct,
      remark: lectureIdx === 1 ? 'Introduction' : '',
      linkedAttendanceSessionId: null,
      status: 'pending',
    };

    batch.set(docRef, {
      ...entry,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      updatedBy: teacherUid,
    });

    // Advance 1 day for next loop
    currentDate.setDate(currentDate.getDate() + 1);
  }

  await batch.commit();
  return { seeded: true, count: STANDARD_SYLLABUS_TOPICS.length };
}

/**
 * Generates an array of sequential dates on class days (MWF) starting from startDate.
 */
export function generateLectureDates(startDateStr: string, totalCount: number): string[] {
  const dates: string[] = [];
  const parts = startDateStr.split('-').map(Number);
  const current = new Date(parts[0], (parts[1] || 1) - 1, parts[2] || 1);

  for (let i = 0; i < totalCount; i++) {
    while (current.getDay() !== 1 && current.getDay() !== 3 && current.getDay() !== 5) {
      current.setDate(current.getDate() + 1);
    }
    const yyyy = current.getFullYear();
    const mm = String(current.getMonth() + 1).padStart(2, '0');
    const dd = String(current.getDate()).padStart(2, '0');
    dates.push(`${yyyy}-${mm}-${dd}`);
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

/**
 * Universal dynamic teaching plan generator:
 * Calls AI (or deterministic pedagogical heuristic) to generate exactly totalHours
 * lectures based on the Admin's syllabus modules & COs, and persists to Firestore.
 */
export async function generateAndSeedDynamicTeachingPlan(
  subjectId: string,
  courseName: string,
  courseCode: string,
  classId: string,
  academicYearId: string,
  teacherUid: string,
  totalHours: number,
  syllabusModules: SyllabusModule[] = [],
  courseOutcomes: Array<{ coCode: 'CO1' | 'CO2' | 'CO3' | 'CO4'; description: string; syllabusHours: number }> = [],
  startDateStr: string = '2026-07-06'
): Promise<{ count: number; lectures: AiGeneratedLecture[] }> {
  // 1. Generate full syllabus plan
  const plan = await requestAiFullSyllabusPlan(
    courseName,
    courseCode,
    totalHours,
    syllabusModules,
    courseOutcomes
  );

  // 2. Generate lecture dates
  const dates = generateLectureDates(startDateStr, plan.lectures.length);

  // 3. Batch commit to Firestore
  const batch = writeBatch(db);
  for (let i = 0; i < plan.lectures.length; i++) {
    const lect = plan.lectures[i];
    const docId = `tp_${subjectId}_lect_${String(lect.sequenceNo).padStart(2, '0')}`;
    const docRef = doc(db, TEACHING_PLAN_COLLECTION, docId);

    const entry: TeachingPlanEntry = {
      id: docId,
      academicYearId,
      classId,
      subjectId,
      teacherUid,
      sequenceNo: lect.sequenceNo,
      chapterNo: lect.chapterNo,
      chapterTitle: lect.chapterTitle,
      topicTitle: lect.topicTitle,
      lecturesRequired: 1,
      mappedCoCode: lect.mappedCoCode,
      plannedDate: dates[i] || startDateStr,
      actualDate: null,
      ictToolUsed: lect.recommendedIct,
      remark: lect.sequenceNo === 1 ? 'Introduction' : (lect.pedagogicalGoal || ''),
      linkedAttendanceSessionId: null,
      status: 'pending',
    };

    batch.set(docRef, {
      ...entry,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      updatedBy: teacherUid,
    }, { merge: true });
  }

  await batch.commit();
  return { count: plan.lectures.length, lectures: plan.lectures };
}

