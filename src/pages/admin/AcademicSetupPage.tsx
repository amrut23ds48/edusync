import { useState, useEffect, type FormEvent } from 'react';
import { 
  collection, 
  doc, 
  onSnapshot, 
  setDoc, 
  updateDoc, 
  getDocs,
  query,
  where,
  writeBatch,
  serverTimestamp 
} from 'firebase/firestore';
import toast from 'react-hot-toast';
import { 
  Calendar, 
  GraduationCap, 
  BookOpen, 
  Plus, 
  Edit2, 
  Archive, 
  RotateCcw, 
  Loader2, 
  X, 
  CheckCircle2,
  Check,
  Target,
  Sparkles,
  Trash2
} from 'lucide-react';
import { db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import type { 
  AcademicYear, 
  ClassCohort, 
  Subject, 
  Department, 
  YearGroup,
  CourseOutcome,
  SyllabusModule
} from '../../types';
import { requestAiDraftCourseOutcomes } from '../../services/cagsAiService';

export default function AcademicSetupPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'years' | 'classes' | 'subjects'>('years');

  // Data states
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [classes, setClasses] = useState<ClassCohort[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);

  // Modal states
  const [showYearModal, setShowYearModal] = useState(false);
  const [showClassModal, setShowClassModal] = useState(false);
  const [showSubjectModal, setShowSubjectModal] = useState(false);
  const [showCoModal, setShowCoModal] = useState(false);
  const [targetSubjectForCo, setTargetSubjectForCo] = useState<Subject | null>(null);

  // Syllabus & Course Outcomes Form State
  const [activeSyllabusTab, setActiveSyllabusTab] = useState<'modules' | 'cos'>('modules');
  const [syllabusModules, setSyllabusModules] = useState<SyllabusModule[]>([]);
  const [prerequisites, setPrerequisites] = useState('');
  const [draftingCosAi, setDraftingCosAi] = useState(false);
  const [coList, setCoList] = useState<Array<{
    coNumber: 1 | 2 | 3 | 4;
    coCode: 'CO1' | 'CO2' | 'CO3' | 'CO4';
    description: string;
    syllabusHours: number;
  }>>([
    { coNumber: 1, coCode: 'CO1', description: '', syllabusHours: 7 },
    { coNumber: 2, coCode: 'CO2', description: '', syllabusHours: 10 },
    { coNumber: 3, coCode: 'CO3', description: '', syllabusHours: 12 },
    { coNumber: 4, coCode: 'CO4', description: '', syllabusHours: 10 },
  ]);
  const [loadingCos, setLoadingCos] = useState(false);
  const [savingCos, setSavingCos] = useState(false);

  // Submitting state
  const [submitting, setSubmitting] = useState(false);

  // Year Form
  const [editingYear, setEditingYear] = useState<AcademicYear | null>(null);
  const [yearLabel, setYearLabel] = useState('2025-26');
  const [curriculumScheme, setCurriculumScheme] = useState('2023-27');
  const [startDate, setStartDate] = useState('2025-07-01');
  const [endDate, setEndDate] = useState('2026-06-30');
  const [isCurrent, setIsCurrent] = useState(true);

  // Class Form
  const [editingClass, setEditingClass] = useState<ClassCohort | null>(null);
  const [selectedDeptId, setSelectedDeptId] = useState('');
  const [selectedYearId, setSelectedYearId] = useState('');
  const [yearGroup, setYearGroup] = useState<YearGroup>('Final Year');
  const [semesterNumber, setSemesterNumber] = useState<number>(7);
  const [division, setDivision] = useState('BECSE-DS / VII');

  // Subject Form
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);
  const [subjClassId, setSubjClassId] = useState('');
  const [courseCode, setCourseCode] = useState('CSDO7023');
  const [courseName, setCourseName] = useState('Game Theory for Data Science (TH)');
  const [courseType, setCourseType] = useState<'theory' | 'practical'>('theory');
  const [totalSyllabusHours, setTotalSyllabusHours] = useState(39);
  const [plannedTotalSessions, setPlannedTotalSessions] = useState(44);

  // Real-time Firestore subscriptions
  useEffect(() => {
    let unsubs: (() => void)[] = [];

    // Academic Years
    unsubs.push(
      onSnapshot(collection(db, 'academic_years'), (snap) => {
        const list: AcademicYear[] = [];
        snap.forEach((d) => list.push(d.data() as AcademicYear));
        list.sort((a, b) => b.yearLabel.localeCompare(a.yearLabel));
        setYears(list);
        if (list.length > 0 && !selectedYearId) {
          const current = list.find((y) => y.isCurrent) || list[0];
          setSelectedYearId(current.id);
        }
      })
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
        if (list.length > 0 && !selectedDeptId) {
          setSelectedDeptId(list[0].id);
        }
      })
    );

    // Classes
    unsubs.push(
      onSnapshot(collection(db, 'classes'), (snap) => {
        const list: ClassCohort[] = [];
        snap.forEach((d) => list.push(d.data() as ClassCohort));
        setClasses(list);
        if (list.length > 0 && !subjClassId) {
          setSubjClassId(list[0].id);
        }
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

  // Handlers for Academic Years
  async function handleSaveYear(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const yearId = editingYear
        ? editingYear.id
        : `ay_${yearLabel.trim().toLowerCase().replace(/[^a-z0-9]/g, '_')}`;

      const data: Partial<AcademicYear> = {
        id: yearId,
        yearLabel: yearLabel.trim(),
        curriculumScheme: curriculumScheme.trim(),
        startDate,
        endDate,
        isCurrent,
        status: editingYear ? editingYear.status : 'active',
        updatedAt: serverTimestamp(),
      };

      if (!editingYear) {
        data.createdAt = serverTimestamp();
      }

      await setDoc(doc(db, 'academic_years', yearId), data, { merge: true });
      toast.success(editingYear ? 'Academic year updated.' : 'Academic year created.');
      setShowYearModal(false);
      setEditingYear(null);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save academic year.');
    } finally {
      setSubmitting(false);
    }
  }

  // Handlers for Classes
  async function handleSaveClass(e: FormEvent) {
    e.preventDefault();
    if (!selectedDeptId || !selectedYearId) {
      toast.error('Department and Academic Year must be selected.');
      return;
    }
    setSubmitting(true);
    try {
      const dept = departments.find((d) => d.id === selectedDeptId);
      const ay = years.find((y) => y.id === selectedYearId);

      const classId = editingClass
        ? editingClass.id
        : `cls_${dept?.code.toLowerCase()}_sem${semesterNumber}_${ay?.yearLabel.replace(/[^a-z0-9]/gi, '')}`;

      const data: Partial<ClassCohort> = {
        id: classId,
        academicYearId: selectedYearId,
        academicYearLabel: ay?.yearLabel || '',
        departmentId: selectedDeptId,
        departmentName: dept?.name || '',
        yearGroup,
        semesterNumber: Number(semesterNumber),
        division: division.trim(),
        status: editingClass ? editingClass.status : 'active',
        updatedAt: serverTimestamp(),
      };

      if (!editingClass) {
        data.createdAt = serverTimestamp();
      }

      await setDoc(doc(db, 'classes', classId), data, { merge: true });
      toast.success(editingClass ? 'Class updated.' : 'Class cohort created.');
      setShowClassModal(false);
      setEditingClass(null);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save class cohort.');
    } finally {
      setSubmitting(false);
    }
  }

  // Handlers for Subjects
  async function handleSaveSubject(e: FormEvent) {
    e.preventDefault();
    if (!subjClassId) {
      toast.error('Class cohort must be selected.');
      return;
    }
    setSubmitting(true);
    try {
      const parentClass = classes.find((c) => c.id === subjClassId);
      const subjectId = editingSubject
        ? editingSubject.id
        : `subj_${courseCode.trim().toLowerCase().replace(/[^a-z0-9]/g, '_')}_${parentClass?.academicYearLabel.replace(/[^a-z0-9]/gi, '')}`;

      const data: Partial<Subject> = {
        id: subjectId,
        departmentId: parentClass?.departmentId || '',
        classId: subjClassId,
        classDivision: parentClass?.division || '',
        academicYearId: parentClass?.academicYearId || '',
        courseCode: courseCode.trim().toUpperCase(),
        courseName: courseName.trim(),
        courseType,
        totalSyllabusHours: Number(totalSyllabusHours),
        plannedTotalSessions: Number(plannedTotalSessions),
        conductedSessionsCount: editingSubject ? editingSubject.conductedSessionsCount : 0,
        status: editingSubject ? editingSubject.status : 'active',
        updatedAt: serverTimestamp(),
      };

      if (!editingSubject) {
        data.createdAt = serverTimestamp();
      }

      await setDoc(doc(db, 'subjects', subjectId), data, { merge: true });
      toast.success(editingSubject ? 'Subject updated.' : 'Subject created.');
      setShowSubjectModal(false);
      setEditingSubject(null);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save subject.');
    } finally {
      setSubmitting(false);
    }
  }

  // Toggle archive status
  async function toggleStatus(collectionName: string, id: string, currentStatus: string) {
    const newStatus = currentStatus === 'active' ? 'archived' : 'active';
    try {
      await updateDoc(doc(db, collectionName, id), {
        status: newStatus,
        updatedAt: serverTimestamp(),
      });
      toast.success(`Record set to ${newStatus}.`);
    } catch {
      toast.error('Failed to change status.');
    }
  }

  // Standard Presets
  const CSC701_MODULES: SyllabusModule[] = [
    { moduleNo: 1, moduleName: 'Fundamentals of Neural Network', hours: 4, topics: '1.1 History of Deep Learning, Deep Learning Success Stories, Multilayer Perceptrons (MLPs), Representation Power of MLPs, Sigmoid Neurons, Gradient Descent, Feedforward Neural Networks\n1.2 Deep Networks: Three Classes of Deep Learning Basic Terminologies of Deep Learning' },
    { moduleNo: 2, moduleName: 'Training, Optimization and Regularization of Deep Neural Network', hours: 10, topics: '2.1 Training Feedforward DNN: Multi Layered Feed Forward, Activation functions (Tanh, Logistic, Linear, Softmax, ReLU, Leaky ReLU), Loss functions (Squared Error, Cross Entropy)\n2.2 Optimization: Learning with backpropagation, Gradient Descent (GD), Stochastic and Mini Batch GD, Momentum Based GD, Nesterov Accelerated GD, AdaGrad, Adam, RMSProp\n2.3 Regularization: Overview of Overfitting, Bias Variance Tradeoff, L1/L2 regularization, Parameter sharing, Dropout, Weight Decay, Batch normalization, Early stopping, Data Augmentation' },
    { moduleNo: 3, moduleName: 'Autoencoders: Unsupervised Learning', hours: 6, topics: '3.1 Introduction, Linear Autoencoder, Undercomplete Autoencoder, Overcomplete Autoencoders, Regularization in Autoencoders\n3.2 Denoising Autoencoders, Sparse Autoencoders, Contractive Autoencoders\n3.3 Application of Autoencoders: Image Compression' },
    { moduleNo: 4, moduleName: 'Convolutional Neural Networks (CNN): Supervised Learning', hours: 7, topics: '4.1 Convolution operation, Padding, Stride, Relation between input, output and filter size, CNN architecture: Convolution layer, Pooling Layer, Weight Sharing in CNN, 2D convolution\n4.2 Modern Deep Learning Architectures: LeNet: Architecture, AlexNet: Architecture, ResNet: Architecture' },
    { moduleNo: 5, moduleName: 'Recurrent Neural Networks (RNN)', hours: 8, topics: '5.1 Sequence Learning Problem, Unfolding Computational graphs, Recurrent Neural Network, Bidirectional RNN, Backpropagation Through Time (BPTT), Vanishing and Exploding Gradients, Truncated BPTT\n5.2 Long Short Term Memory (LSTM): Selective Read, Selective write, Selective Forget, Gated Recurrent Unit (GRU)' },
    { moduleNo: 6, moduleName: 'Recent Trends and Applications', hours: 4, topics: '6.1 Generative Adversarial Network (GAN): Architecture\n6.2 Applications: Image Generation, DeepFake' },
  ];

  const CSDO7023_MODULES: SyllabusModule[] = [
    { moduleNo: 1, moduleName: 'Introduction to Strategic Games', hours: 6, topics: '1.1 Game Theory Foundations, Strategic Form Games, Players, Payoffs\n1.2 Prisoner Dilemma & Social Dilemmas in Data Networks\n1.3 Strict and Weak Dominance, IESDS\n1.4 Tutorial: Dominance Solvability and Payoff Formulation' },
    { moduleNo: 2, moduleName: 'Games with Perfect Information & Nash Equilibrium', hours: 7, topics: '2.1 Pure Strategy Nash Equilibrium Formulation\n2.2 Cournot Oligopoly Duopoly Model\n2.3 Bertrand Price Competition with Capacity Constraints\n2.4 Stackelberg Leader-Follower, Location Games & Hotelling\n2.5 Applications: Web Search Ranking & Ad Auctions' },
    { moduleNo: 3, moduleName: 'Mixed Strategy Nash Equilibrium', hours: 7, topics: '3.1 Mixed Strategy Nash Equilibrium (MSNE) Foundations\n3.2 Matching Pennies, Zero-Sum Matrix Games\n3.3 Battle of the Sexes, Coordination Games\n3.4 Minimax Theorem & Linear Programming Formulation' },
    { moduleNo: 4, moduleName: 'Extensive Games with Imperfect Information', hours: 6, topics: '4.1 Extensive Form Representation, Game Trees, Information Sets\n4.2 Subgame Perfect Nash Equilibrium (SPNE)\n4.3 Backward Induction Algorithm\n4.4 Bargaining Games & Repeated Games' },
    { moduleNo: 5, moduleName: 'Coalition Games & Cooperative Game Theory', hours: 6, topics: '5.1 Characteristic Function Form, Transferable Utility Games\n5.2 The Core, Emptiness of Core\n5.3 Shapley Value Axiomatics & Marginal Contributions\n5.4 Power Indices: Banzhaf & Shapley-Shubik in Voting Systems' },
    { moduleNo: 6, moduleName: 'Applications of Game Theory in Data Science', hours: 7, topics: '6.1 Mechanism Design & Reverse Game Theory\n6.2 Auction Theory: First Price, Second Price (Vickrey), English & Dutch\n6.3 VCG (Vickrey-Clarke-Groves) Mechanism in Ad-Exchange\n6.4 Fair Resource Allocation in Cloud Computing & Distributed Networks' },
  ];

  // Open Syllabus & Course Outcomes Modal for a Subject
  async function openCourseOutcomesModal(sub: Subject) {
    setTargetSubjectForCo(sub);
    setActiveSyllabusTab('modules');
    setShowCoModal(true);
    setLoadingCos(true);

    // Load Syllabus Modules & Prerequisites
    setPrerequisites(sub.prerequisites || (sub.courseCode.toUpperCase() === 'CSC701' ? 'Basic mathematics and Statistical concepts, Linear algebra, Machine Learning' : ''));
    if (sub.syllabusModules && sub.syllabusModules.length > 0) {
      setSyllabusModules(sub.syllabusModules);
    } else if (sub.courseCode.toUpperCase() === 'CSC701') {
      setSyllabusModules(CSC701_MODULES);
    } else if (sub.courseCode.toUpperCase() === 'CSDO7023') {
      setSyllabusModules(CSDO7023_MODULES);
    } else {
      setSyllabusModules([
        { moduleNo: 1, moduleName: 'Module 1: Foundations', hours: Math.round(sub.totalSyllabusHours * 0.2), topics: 'Fundamental principles, terminologies, and introductory concepts.' },
        { moduleNo: 2, moduleName: 'Module 2: Core Methodology', hours: Math.round(sub.totalSyllabusHours * 0.25), topics: 'Core algorithms, mathematical formulations, and analytical models.' },
        { moduleNo: 3, moduleName: 'Module 3: Design & Implementation', hours: Math.round(sub.totalSyllabusHours * 0.3), topics: 'System design, optimization techniques, and implementation approaches.' },
        { moduleNo: 4, moduleName: 'Module 4: Applications & Trends', hours: sub.totalSyllabusHours - (Math.round(sub.totalSyllabusHours * 0.2) + Math.round(sub.totalSyllabusHours * 0.25) + Math.round(sub.totalSyllabusHours * 0.3)), topics: 'Case studies, modern tools, practical applications, and industry trends.' },
      ]);
    }

    try {
      const q = query(
        collection(db, 'course_outcomes'),
        where('subjectId', '==', sub.id)
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        const loaded: Record<string, { description: string; syllabusHours: number }> = {};
        snap.forEach((d) => {
          const data = d.data() as CourseOutcome;
          loaded[data.coCode] = {
            description: data.description || '',
            syllabusHours: data.syllabusHours || 0,
          };
        });

        setCoList([
          { coNumber: 1, coCode: 'CO1', description: loaded['CO1']?.description || '', syllabusHours: loaded['CO1']?.syllabusHours ?? 7 },
          { coNumber: 2, coCode: 'CO2', description: loaded['CO2']?.description || '', syllabusHours: loaded['CO2']?.syllabusHours ?? 10 },
          { coNumber: 3, coCode: 'CO3', description: loaded['CO3']?.description || '', syllabusHours: loaded['CO3']?.syllabusHours ?? 12 },
          { coNumber: 4, coCode: 'CO4', description: loaded['CO4']?.description || '', syllabusHours: loaded['CO4']?.syllabusHours ?? 10 },
        ]);
      } else {
        if (sub.courseCode.toUpperCase() === 'CSC701') {
          loadCsc701Template();
        } else if (sub.courseCode.toUpperCase() === 'CSDO7023') {
          loadCsdo7023Template();
        } else {
          setCoList([
            { coNumber: 1, coCode: 'CO1', description: '', syllabusHours: Math.round(sub.totalSyllabusHours * 0.2) },
            { coNumber: 2, coCode: 'CO2', description: '', syllabusHours: Math.round(sub.totalSyllabusHours * 0.25) },
            { coNumber: 3, coCode: 'CO3', description: '', syllabusHours: Math.round(sub.totalSyllabusHours * 0.3) },
            { coNumber: 4, coCode: 'CO4', description: '', syllabusHours: sub.totalSyllabusHours - (Math.round(sub.totalSyllabusHours * 0.2) + Math.round(sub.totalSyllabusHours * 0.25) + Math.round(sub.totalSyllabusHours * 0.3)) },
          ]);
        }
      }
    } catch (err) {
      console.error('Error fetching course outcomes:', err);
    } finally {
      setLoadingCos(false);
    }
  }

  function loadCsc701Template() {
    setCoList([
      { coNumber: 1, coCode: 'CO1', description: 'Gain basic knowledge of Neural Networks and foundations of deep architectures.', syllabusHours: 4 },
      { coNumber: 2, coCode: 'CO2', description: 'Acquire in depth understanding of training, optimization and regularization of Deep Neural Networks.', syllabusHours: 16 },
      { coNumber: 3, coCode: 'CO3', description: 'Design appropriate DNN model for supervised, unsupervised and sequence learning applications.', syllabusHours: 15 },
      { coNumber: 4, coCode: 'CO4', description: 'Gain familiarity with recent trends, generative adversarial models, and applications of Deep Learning.', syllabusHours: 4 },
    ]);
  }

  function loadCsdo7023Template() {
    setCoList([
      { coNumber: 1, coCode: 'CO1', description: 'Analyze and Discuss the notion of a strategic game and equilibria and identify the characteristics of main applications of these concepts.', syllabusHours: 7 },
      { coNumber: 2, coCode: 'CO2', description: 'Discuss the use of Nash Equilibrium for other problems. Identify key strategic aspects and based on these be able to connect them to appropriate game theoretic concepts given a real world situation.', syllabusHours: 10 },
      { coNumber: 3, coCode: 'CO3', description: 'Identify some applications that need aspects of Bayesian Games. Implement a typical Virtual Business scenario using Game theory.', syllabusHours: 12 },
      { coNumber: 4, coCode: 'CO4', description: 'Identify and discuss working principle of Non-Cooperative Games.', syllabusHours: 10 },
    ]);
  }

  function handleAddModule() {
    const nextNo = syllabusModules.length + 1;
    setSyllabusModules((prev) => [
      ...prev,
      {
        moduleNo: nextNo,
        moduleName: `Module ${nextNo}`,
        hours: 4,
        topics: '',
      },
    ]);
  }

  function handleRemoveModule(idx: number) {
    if (syllabusModules.length <= 1) {
      toast.error('At least one syllabus module is required.');
      return;
    }
    const updated = syllabusModules
      .filter((_, i) => i !== idx)
      .map((m, i) => ({ ...m, moduleNo: i + 1 }));
    setSyllabusModules(updated);
  }

  function handleAddCo() {
    if (coList.length >= 4) {
      toast.error('Prototype allows up to 4 Course Outcomes (CO1 to CO4).');
      return;
    }
    const nextNum = (coList.length + 1) as 1 | 2 | 3 | 4;
    const remainingHours = targetSubjectForCo
      ? Math.max(0, targetSubjectForCo.totalSyllabusHours - coList.reduce((acc, c) => acc + (Number(c.syllabusHours) || 0), 0))
      : 8;

    setCoList((prev) => [
      ...prev,
      {
        coNumber: nextNum,
        coCode: `CO${nextNum}` as 'CO1' | 'CO2' | 'CO3' | 'CO4',
        description: '',
        syllabusHours: remainingHours > 0 ? remainingHours : 6,
      },
    ]);
  }

  function handleRemoveCo(idx: number) {
    if (coList.length <= 1) {
      toast.error('At least one Course Outcome is required.');
      return;
    }
    const updated = coList
      .filter((_, i) => i !== idx)
      .map((c, i) => {
        const num = (i + 1) as 1 | 2 | 3 | 4;
        return {
          ...c,
          coNumber: num,
          coCode: `CO${num}` as 'CO1' | 'CO2' | 'CO3' | 'CO4',
        };
      });
    setCoList(updated);
  }

  async function handleDraftCosWithAi() {
    if (!targetSubjectForCo) return;
    setDraftingCosAi(true);
    try {
      const res = await requestAiDraftCourseOutcomes(
        targetSubjectForCo.courseName,
        targetSubjectForCo.courseCode,
        targetSubjectForCo.totalSyllabusHours,
        syllabusModules
      );
      setCoList(
        res.courseOutcomes.map((c, i) => ({
          coNumber: ((c.coNumber || i + 1) as 1 | 2 | 3 | 4),
          coCode: c.coCode,
          description: c.description,
          syllabusHours: c.syllabusHours,
        }))
      );
      toast.success('Generated 4 active Bloom\'s-taxonomy COs!');
    } catch (err: any) {
      toast.error('AI drafting failed: ' + err.message);
    } finally {
      setDraftingCosAi(false);
    }
  }

  async function handleSaveCourseOutcomes(e: FormEvent) {
    e.preventDefault();
    if (!targetSubjectForCo) return;

    // Validate module hours vs subject total hours
    const modHours = syllabusModules.reduce((acc, m) => acc + Number(m.hours || 0), 0);
    if (modHours !== targetSubjectForCo.totalSyllabusHours) {
      if (!confirm(`Warning: Total Module hours (${modHours} hrs) does not match subject syllabus hours (${targetSubjectForCo.totalSyllabusHours} hrs). Save anyway?`)) {
        return;
      }
    }

    // Validate CO hours vs subject total hours
    const totalHours = coList.reduce((acc, c) => acc + Number(c.syllabusHours || 0), 0);
    if (totalHours !== targetSubjectForCo.totalSyllabusHours) {
      if (!confirm(`Warning: Total CO hours (${totalHours} hrs) does not match subject syllabus hours (${targetSubjectForCo.totalSyllabusHours} hrs). Save anyway?`)) {
        return;
      }
    }

    setSavingCos(true);
    try {
      // 1. Update Subject with syllabusModules & prerequisites
      const subRef = doc(db, 'subjects', targetSubjectForCo.id);
      await updateDoc(subRef, {
        syllabusModules,
        prerequisites: prerequisites.trim(),
        updatedAt: serverTimestamp(),
      });

      // 2. Update Course Outcomes collection
      const batch = writeBatch(db);
      for (const item of coList) {
        const docId = `${targetSubjectForCo.id}_${item.coCode}`;
        const ref = doc(db, 'course_outcomes', docId);
        batch.set(
          ref,
          {
            id: docId,
            academicYearId: targetSubjectForCo.academicYearId,
            classId: targetSubjectForCo.classId,
            subjectId: targetSubjectForCo.id,
            teacherUid: targetSubjectForCo.assignedTeacherUid || '',
            coNumber: item.coNumber,
            coCode: item.coCode,
            description: item.description.trim(),
            syllabusHours: Number(item.syllabusHours),
            status: 'active',
            updatedAt: serverTimestamp(),
            createdBy: user?.uid || 'admin',
          },
          { merge: true }
        );
      }
      await batch.commit();

      toast.success(`Successfully saved Syllabus & CO1–CO4 for ${targetSubjectForCo.courseCode}!`);
      setShowCoModal(false);
    } catch (err: any) {
      console.error('Error saving syllabus & course outcomes:', err);
      toast.error(err?.message || 'Failed to save syllabus & course outcomes.');
    } finally {
      setSavingCos(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Academic Hierarchy Setup</h1>
          <p className="mt-1 text-sm text-slate-500">
            Define working academic years, classes, cohorts, semesters, and curriculum course subjects.
          </p>
        </div>

        {/* Create button changes based on active tab */}
        {activeTab === 'years' && (
          <button
            type="button"
            onClick={() => {
              setEditingYear(null);
              setShowYearModal(true);
            }}
            className="btn-primary"
          >
            <Plus className="h-4 w-4" /> Add Academic Year
          </button>
        )}
        {activeTab === 'classes' && (
          <button
            type="button"
            onClick={() => {
              setEditingClass(null);
              setShowClassModal(true);
            }}
            className="btn-primary"
          >
            <Plus className="h-4 w-4" /> Add Class Cohort
          </button>
        )}
        {activeTab === 'subjects' && (
          <button
            type="button"
            onClick={() => {
              setEditingSubject(null);
              setShowSubjectModal(true);
            }}
            className="btn-primary"
          >
            <Plus className="h-4 w-4" /> Add Subject / Course
          </button>
        )}
      </div>

      {/* Tabs Switcher */}
      <div className="flex border-b border-slate-200 gap-8">
        <button
          type="button"
          onClick={() => setActiveTab('years')}
          className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'years'
              ? 'border-brand-600 text-brand-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Calendar className="h-4 w-4" />
          <span>Academic Years ({years.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('classes')}
          className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'classes'
              ? 'border-brand-600 text-brand-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <GraduationCap className="h-4 w-4" />
          <span>Classes &amp; Cohorts ({classes.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('subjects')}
          className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'subjects'
              ? 'border-brand-600 text-brand-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <BookOpen className="h-4 w-4" />
          <span>Subjects &amp; Courses ({subjects.length})</span>
        </button>
      </div>

      {/* Tab 1: Academic Years */}
      {activeTab === 'years' && (
        <div className="glass-card overflow-hidden">
          {years.length === 0 ? (
            <div className="p-12 text-center text-slate-500">
              <Calendar className="mx-auto h-12 w-12 text-slate-300 mb-3" />
              <p className="text-sm font-semibold">No Academic Years Defined</p>
              <p className="text-xs text-slate-400 mt-1">Add your institution's working year (e.g. 2025-26).</p>
            </div>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50/80 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase">
                <tr>
                  <th className="py-3.5 px-6">Year Label</th>
                  <th className="py-3.5 px-6">Curriculum Scheme</th>
                  <th className="py-3.5 px-6">Date Range</th>
                  <th className="py-3.5 px-6">Current Year</th>
                  <th className="py-3.5 px-6">Status</th>
                  <th className="py-3.5 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {years.map((y) => (
                  <tr key={y.id} className="hover:bg-slate-50/60">
                    <td className="py-4 px-6 font-bold text-slate-900">{y.yearLabel}</td>
                    <td className="py-4 px-6 text-slate-700 font-medium">{y.curriculumScheme}</td>
                    <td className="py-4 px-6 text-xs text-slate-500 font-mono">
                      {y.startDate} to {y.endDate}
                    </td>
                    <td className="py-4 px-6">
                      {y.isCurrent ? (
                        <span className="badge bg-emerald-100 text-emerald-800 flex items-center gap-1 w-max">
                          <Check className="h-3 w-3" /> Current
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-4 px-6">
                      <span className={`badge ${y.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                        {y.status}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-right space-x-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingYear(y);
                          setYearLabel(y.yearLabel);
                          setCurriculumScheme(y.curriculumScheme);
                          setStartDate(y.startDate);
                          setEndDate(y.endDate);
                          setIsCurrent(y.isCurrent);
                          setShowYearModal(true);
                        }}
                        className="btn-secondary !py-1 !px-2.5 !text-xs"
                      >
                        <Edit2 className="h-3.5 w-3.5" /> Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleStatus('academic_years', y.id, y.status)}
                        className="btn-secondary !py-1 !px-2.5 !text-xs"
                      >
                        {y.status === 'active' ? <Archive className="h-3.5 w-3.5" /> : <RotateCcw className="h-3.5 w-3.5" />}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Tab 2: Classes & Cohorts */}
      {activeTab === 'classes' && (
        <div className="glass-card overflow-hidden">
          {classes.length === 0 ? (
            <div className="p-12 text-center text-slate-500">
              <GraduationCap className="mx-auto h-12 w-12 text-slate-300 mb-3" />
              <p className="text-sm font-semibold">No Classes Configured</p>
              <p className="text-xs text-slate-400 mt-1">Create a class division (e.g. BECSE-DS / VII).</p>
            </div>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50/80 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase">
                <tr>
                  <th className="py-3.5 px-6">Division / Label</th>
                  <th className="py-3.5 px-6">Year Group</th>
                  <th className="py-3.5 px-6">Semester</th>
                  <th className="py-3.5 px-6">Department</th>
                  <th className="py-3.5 px-6">Academic Year</th>
                  <th className="py-3.5 px-6">Status</th>
                  <th className="py-3.5 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {classes.map((cls) => (
                  <tr key={cls.id} className="hover:bg-slate-50/60">
                    <td className="py-4 px-6 font-bold text-slate-900">{cls.division}</td>
                    <td className="py-4 px-6 text-slate-700">{cls.yearGroup}</td>
                    <td className="py-4 px-6 text-slate-700 font-mono">Sem {cls.semesterNumber}</td>
                    <td className="py-4 px-6 text-slate-600 text-xs">{cls.departmentName}</td>
                    <td className="py-4 px-6 font-mono text-xs text-slate-500">{cls.academicYearLabel}</td>
                    <td className="py-4 px-6">
                      <span className={`badge ${cls.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                        {cls.status}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-right space-x-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingClass(cls);
                          setSelectedDeptId(cls.departmentId);
                          setSelectedYearId(cls.academicYearId);
                          setYearGroup(cls.yearGroup);
                          setSemesterNumber(cls.semesterNumber);
                          setDivision(cls.division);
                          setShowClassModal(true);
                        }}
                        className="btn-secondary !py-1 !px-2.5 !text-xs"
                      >
                        <Edit2 className="h-3.5 w-3.5" /> Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleStatus('classes', cls.id, cls.status)}
                        className="btn-secondary !py-1 !px-2.5 !text-xs"
                      >
                        {cls.status === 'active' ? <Archive className="h-3.5 w-3.5" /> : <RotateCcw className="h-3.5 w-3.5" />}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Tab 3: Subjects & Courses */}
      {activeTab === 'subjects' && (
        <div className="glass-card overflow-hidden">
          {subjects.length === 0 ? (
            <div className="p-12 text-center text-slate-500">
              <BookOpen className="mx-auto h-12 w-12 text-slate-300 mb-3" />
              <p className="text-sm font-semibold">No Subjects Added</p>
              <p className="text-xs text-slate-400 mt-1">Add a syllabus course (e.g. CSDO7023 — Game Theory for Data Science).</p>
            </div>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50/80 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase">
                <tr>
                  <th className="py-3.5 px-6">Course Code</th>
                  <th className="py-3.5 px-6">Course Name</th>
                  <th className="py-3.5 px-6">Class Division</th>
                  <th className="py-3.5 px-6">Type</th>
                  <th className="py-3.5 px-6">Syllabus Hours</th>
                  <th className="py-3.5 px-6">Planned Sessions</th>
                  <th className="py-3.5 px-6">Status</th>
                  <th className="py-3.5 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {subjects.map((sub) => (
                  <tr key={sub.id} className="hover:bg-slate-50/60">
                    <td className="py-4 px-6 font-mono font-bold text-slate-900">{sub.courseCode}</td>
                    <td className="py-4 px-6 text-slate-800 font-medium">{sub.courseName}</td>
                    <td className="py-4 px-6 text-slate-600 font-medium">{sub.classDivision}</td>
                    <td className="py-4 px-6 uppercase text-xs font-bold text-slate-500">{sub.courseType}</td>
                    <td className="py-4 px-6 font-mono text-xs">{sub.totalSyllabusHours} hrs</td>
                    <td className="py-4 px-6 font-mono text-xs">{sub.plannedTotalSessions} sessions</td>
                    <td className="py-4 px-6">
                      <span className={`badge ${sub.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                        {sub.status}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-right space-x-2">
                      <button
                        type="button"
                        onClick={() => openCourseOutcomesModal(sub)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-100 transition shadow-2xs active:scale-95"
                        title="Configure Official Syllabus Modules & Course Outcomes (CO1–CO4)"
                      >
                        <BookOpen className="h-3.5 w-3.5 text-brand-600" />
                        <span>Syllabus & COs</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingSubject(sub);
                          setSubjClassId(sub.classId);
                          setCourseCode(sub.courseCode);
                          setCourseName(sub.courseName);
                          setCourseType(sub.courseType);
                          setTotalSyllabusHours(sub.totalSyllabusHours);
                          setPlannedTotalSessions(sub.plannedTotalSessions);
                          setShowSubjectModal(true);
                        }}
                        className="btn-secondary !py-1 !px-2.5 !text-xs"
                      >
                        <Edit2 className="h-3.5 w-3.5" /> Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleStatus('subjects', sub.id, sub.status)}
                        className="btn-secondary !py-1 !px-2.5 !text-xs"
                      >
                        {sub.status === 'active' ? <Archive className="h-3.5 w-3.5" /> : <RotateCcw className="h-3.5 w-3.5" />}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Modal 1: Year Modal */}
      {showYearModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="glass-card max-w-md w-full p-6 bg-white relative">
            <div className="flex justify-between items-center pb-3 border-b">
              <h2 className="text-base font-bold text-slate-900">
                {editingYear ? 'Edit Academic Year' : 'Add Academic Year'}
              </h2>
              <button type="button" onClick={() => setShowYearModal(false)}><X className="h-5 w-5 text-slate-400" /></button>
            </div>
            <form onSubmit={handleSaveYear} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Year Label (e.g. 2025-26)</label>
                <input
                  type="text"
                  required
                  placeholder="2025-26"
                  value={yearLabel}
                  onChange={(e) => setYearLabel(e.target.value)}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Curriculum Scheme (e.g. 2023-27)</label>
                <input
                  type="text"
                  required
                  placeholder="2023-27"
                  value={curriculumScheme}
                  onChange={(e) => setCurriculumScheme(e.target.value)}
                  className="input-field"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Start Date</label>
                  <input
                    type="date"
                    required
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">End Date</label>
                  <input
                    type="date"
                    required
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="input-field"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2 pt-2">
                <input
                  id="chk-current"
                  type="checkbox"
                  checked={isCurrent}
                  onChange={(e) => setIsCurrent(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                />
                <label htmlFor="chk-current" className="text-xs text-slate-700 font-medium">
                  Set as Current Working Academic Year
                </label>
              </div>
              <div className="pt-4 flex justify-end gap-2 border-t mt-4">
                <button type="button" onClick={() => setShowYearModal(false)} className="btn-secondary">Cancel</button>
                <button type="submit" disabled={submitting} className="btn-primary">
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Save Year
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Class Modal */}
      {showClassModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="glass-card max-w-md w-full p-6 bg-white relative">
            <div className="flex justify-between items-center pb-3 border-b">
              <h2 className="text-base font-bold text-slate-900">
                {editingClass ? 'Edit Class Cohort' : 'Add Class Cohort'}
              </h2>
              <button type="button" onClick={() => setShowClassModal(false)}><X className="h-5 w-5 text-slate-400" /></button>
            </div>
            <form onSubmit={handleSaveClass} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Department</label>
                <select
                  required
                  value={selectedDeptId}
                  onChange={(e) => setSelectedDeptId(e.target.value)}
                  className="input-field"
                >
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>{d.name} ({d.code})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Academic Year</label>
                <select
                  required
                  value={selectedYearId}
                  onChange={(e) => setSelectedYearId(e.target.value)}
                  className="input-field"
                >
                  {years.map((y) => (
                    <option key={y.id} value={y.id}>{y.yearLabel} (Scheme {y.curriculumScheme})</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Year Group</label>
                  <select
                    value={yearGroup}
                    onChange={(e) => setYearGroup(e.target.value as YearGroup)}
                    className="input-field"
                  >
                    <option value="First Year">First Year</option>
                    <option value="Second Year">Second Year</option>
                    <option value="Third Year">Third Year</option>
                    <option value="Final Year">Final Year</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Semester Number</label>
                  <input
                    type="number"
                    min="1"
                    max="8"
                    required
                    value={semesterNumber}
                    onChange={(e) => setSemesterNumber(Number(e.target.value))}
                    className="input-field"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Division / Cohort Label</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. BECSE-DS / VII"
                  value={division}
                  onChange={(e) => setDivision(e.target.value)}
                  className="input-field"
                />
              </div>
              <div className="pt-4 flex justify-end gap-2 border-t mt-4">
                <button type="button" onClick={() => setShowClassModal(false)} className="btn-secondary">Cancel</button>
                <button type="submit" disabled={submitting} className="btn-primary">
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Save Class
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 3: Subject Modal */}
      {showSubjectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="glass-card max-w-lg w-full p-6 bg-white relative">
            <div className="flex justify-between items-center pb-3 border-b">
              <h2 className="text-base font-bold text-slate-900">
                {editingSubject ? 'Edit Subject / Course' : 'Add Subject / Course'}
              </h2>
              <button type="button" onClick={() => setShowSubjectModal(false)}><X className="h-5 w-5 text-slate-400" /></button>
            </div>
            <form onSubmit={handleSaveSubject} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Class &amp; Division</label>
                <select
                  required
                  value={subjClassId}
                  onChange={(e) => setSubjClassId(e.target.value)}
                  className="input-field"
                >
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.division} ({c.departmentName} · {c.academicYearLabel})
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-1">
                  <label className="block text-xs font-bold text-slate-700 mb-1">Course Code</label>
                  <input
                    type="text"
                    required
                    placeholder="CSDO7023"
                    value={courseCode}
                    onChange={(e) => setCourseCode(e.target.value)}
                    className="input-field uppercase font-mono font-bold"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">Course Name</label>
                  <input
                    type="text"
                    required
                    placeholder="Game Theory for Data Science (TH)"
                    value={courseName}
                    onChange={(e) => setCourseName(e.target.value)}
                    className="input-field"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Course Type</label>
                  <select
                    value={courseType}
                    onChange={(e) => setCourseType(e.target.value as 'theory' | 'practical')}
                    className="input-field"
                  >
                    <option value="theory">Theory (TH)</option>
                    <option value="practical">Practical (PR)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Syllabus Hours</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={totalSyllabusHours}
                    onChange={(e) => setTotalSyllabusHours(Number(e.target.value))}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Planned Sessions</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={plannedTotalSessions}
                    onChange={(e) => setPlannedTotalSessions(Number(e.target.value))}
                    className="input-field"
                  />
                </div>
              </div>
              <div className="pt-4 flex justify-end gap-2 border-t mt-4">
                <button type="button" onClick={() => setShowSubjectModal(false)} className="btn-secondary">Cancel</button>
                <button type="submit" disabled={submitting} className="btn-primary">
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Save Subject
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 4: Official Syllabus & Course Outcomes (CO1–CO4) Modal */}
      {showCoModal && targetSubjectForCo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-3 sm:p-6">
          <div className="glass-card max-w-4xl w-full max-h-[90vh] flex flex-col bg-white relative rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
            {/* 1. Modal Header */}
            <div className="p-4 sm:p-5 border-b border-slate-100 flex items-start justify-between shrink-0 bg-white">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700 border border-brand-100 shrink-0">
                  <BookOpen className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-slate-900">Official Syllabus & Course Outcomes Setup</h2>
                    <span className="badge bg-brand-50 text-brand-700 border border-brand-200 font-mono font-bold">
                      {targetSubjectForCo.courseCode}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    {targetSubjectForCo.courseName} · {targetSubjectForCo.classDivision} · Total {targetSubjectForCo.totalSyllabusHours} Contact Hours
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCoModal(false)}
                className="text-slate-400 hover:text-slate-600 transition p-1"
                title="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Tab Switcher */}
            <div className="px-5 pt-3 pb-0 border-b border-slate-100 flex items-center gap-2 bg-slate-50/50">
              <button
                type="button"
                onClick={() => setActiveSyllabusTab('modules')}
                className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition ${
                  activeSyllabusTab === 'modules'
                    ? 'border-brand-600 text-brand-700 bg-white rounded-t-lg'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <BookOpen className="h-3.5 w-3.5" />
                <span>1. Syllabus Modules ({syllabusModules.length})</span>
                {(() => {
                  const total = syllabusModules.reduce((acc, m) => acc + Number(m.hours || 0), 0);
                  const isBal = total === targetSubjectForCo.totalSyllabusHours;
                  return (
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${isBal ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                      {total}h
                    </span>
                  );
                })()}
              </button>
              <button
                type="button"
                onClick={() => setActiveSyllabusTab('cos')}
                className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition ${
                  activeSyllabusTab === 'cos'
                    ? 'border-brand-600 text-brand-700 bg-white rounded-t-lg'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <Target className="h-3.5 w-3.5" />
                <span>2. Course Outcomes (CO1–CO4)</span>
                {(() => {
                  const total = coList.reduce((acc, c) => acc + Number(c.syllabusHours || 0), 0);
                  const isBal = total === targetSubjectForCo.totalSyllabusHours;
                  return (
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${isBal ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                      {total}h
                    </span>
                  );
                })()}
              </button>
            </div>

            {/* 2. Scrollable Body */}
            <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-4">
              {loadingCos ? (
                <div className="py-12 text-center">
                  <Loader2 className="mx-auto h-8 w-8 animate-spin text-brand-600 mb-2" />
                  <p className="text-xs font-medium text-slate-500">Loading syllabus & course outcomes...</p>
                </div>
              ) : activeSyllabusTab === 'modules' ? (
                /* TAB 1: SYLLABUS MODULES */
                <div className="space-y-4">
                  {/* Presets & Hours Bar */}
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-600">Module Hours Tally:</span>
                      {(() => {
                        const total = syllabusModules.reduce((acc, m) => acc + Number(m.hours || 0), 0);
                        const target = targetSubjectForCo.totalSyllabusHours;
                        const matches = total === target;
                        return (
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold font-mono ${
                              matches
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-amber-50 text-amber-700 border border-amber-200'
                            }`}
                          >
                            {matches ? <Check className="h-3.5 w-3.5" /> : null}
                            {total} / {target} hrs
                            {matches ? ' (Balanced)' : ` (${Math.abs(target - total)}h difference)`}
                          </span>
                        );
                      })()}
                    </div>

                    <div className="flex items-center gap-2">
                      {targetSubjectForCo.courseCode.toUpperCase() === 'CSC701' && (
                        <button
                          type="button"
                          onClick={() => {
                            setSyllabusModules(CSC701_MODULES);
                            setPrerequisites('Basic mathematics and Statistical concepts, Linear algebra, Machine Learning');
                            toast.success('Loaded Mumbai University CSC701 Deep Learning Syllabus!');
                          }}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 hover:text-brand-800 bg-white px-2.5 py-1 rounded-lg border border-brand-200 shadow-2xs hover:bg-brand-50 transition"
                        >
                          <Sparkles className="h-3.5 w-3.5 text-brand-600" />
                          Load CSC701 Preset
                        </button>
                      )}
                      {targetSubjectForCo.courseCode.toUpperCase() === 'CSDO7023' && (
                        <button
                          type="button"
                          onClick={() => {
                            setSyllabusModules(CSDO7023_MODULES);
                            toast.success('Loaded CSDO7023 Game Theory Syllabus!');
                          }}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 hover:text-brand-800 bg-white px-2.5 py-1 rounded-lg border border-brand-200 shadow-2xs hover:bg-brand-50 transition"
                        >
                          <Sparkles className="h-3.5 w-3.5 text-brand-600" />
                          Load CSDO7023 Preset
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Course Prerequisites */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Course Prerequisites (Optional)
                    </label>
                    <input
                      type="text"
                      value={prerequisites}
                      onChange={(e) => setPrerequisites(e.target.value)}
                      placeholder="e.g. Basic mathematics, Linear algebra, Machine Learning concepts"
                      className="input-field text-xs"
                    />
                  </div>

                  {/* Modules List */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                        Modular Curriculum Breakdown
                      </h3>
                      <button
                        type="button"
                        onClick={handleAddModule}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:text-brand-800 bg-brand-50 border border-brand-200 px-2.5 py-1 rounded-lg transition"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span>Add Module</span>
                      </button>
                    </div>

                    {syllabusModules.map((mod, idx) => (
                      <div
                        key={mod.moduleNo || idx}
                        className="p-3.5 rounded-xl border border-slate-200 bg-white hover:border-slate-300 transition shadow-2xs space-y-2.5"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2 flex-1">
                            <span className="flex h-6 px-2 items-center justify-center rounded-md bg-brand-600 text-white font-mono font-bold text-xs shrink-0 shadow-2xs">
                              M{mod.moduleNo}
                            </span>
                            <input
                              type="text"
                              required
                              value={mod.moduleName}
                              onChange={(e) => {
                                const val = e.target.value;
                                setSyllabusModules((prev) =>
                                  prev.map((item, i) => (i === idx ? { ...item, moduleName: val } : item))
                                );
                              }}
                              placeholder="Module Title (e.g. Fundamentals of Neural Network)"
                              className="w-full rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-800 focus:border-brand-500 focus:outline-none"
                            />
                          </div>

                          <div className="flex items-center gap-3 shrink-0">
                            <div className="flex items-center gap-1.5">
                              <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                                Hours:
                              </label>
                              <input
                                type="number"
                                min="1"
                                max="40"
                                required
                                value={mod.hours}
                                onChange={(e) => {
                                  const val = Number(e.target.value);
                                  setSyllabusModules((prev) =>
                                    prev.map((item, i) => (i === idx ? { ...item, hours: val } : item))
                                  );
                                }}
                                className="w-16 rounded-lg border border-slate-200 px-2 py-1 text-xs font-mono font-bold text-slate-800 text-center focus:border-brand-500 focus:outline-none"
                              />
                              <span className="text-xs text-slate-400 font-mono">hrs</span>
                            </div>

                            {syllabusModules.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleRemoveModule(idx)}
                                className="text-slate-300 hover:text-red-600 transition p-1"
                                title={`Remove Module ${mod.moduleNo}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </div>

                        <div>
                          <textarea
                            rows={3}
                            required
                            value={mod.topics}
                            onChange={(e) => {
                              const val = e.target.value;
                              setSyllabusModules((prev) =>
                                prev.map((item, i) => (i === idx ? { ...item, topics: val } : item))
                              );
                            }}
                            placeholder="Enter topics & subtopics for this module (e.g. 1.1 History of Deep Learning, MLPs, Sigmoid Neurons, Gradient Descent...)"
                            className="w-full rounded-lg border border-slate-200 p-2.5 text-xs text-slate-800 placeholder-slate-400 focus:border-brand-500 focus:outline-none resize-none leading-relaxed"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                /* TAB 2: COURSE OUTCOMES */
                <div className="space-y-4">
                  {/* Actions & Hours Bar */}
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-600">CO Hours Tally:</span>
                      {(() => {
                        const total = coList.reduce((acc, c) => acc + Number(c.syllabusHours || 0), 0);
                        const target = targetSubjectForCo.totalSyllabusHours;
                        const matches = total === target;
                        return (
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold font-mono ${
                              matches
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-amber-50 text-amber-700 border border-amber-200'
                            }`}
                          >
                            {matches ? <Check className="h-3.5 w-3.5" /> : null}
                            {total} / {target} hrs
                            {matches ? ' (Balanced)' : ` (${Math.abs(target - total)}h difference)`}
                          </span>
                        );
                      })()}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleDraftCosWithAi}
                        disabled={draftingCosAi}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 hover:text-brand-800 bg-white px-2.5 py-1 rounded-lg border border-brand-200 shadow-2xs hover:bg-brand-50 transition"
                      >
                        {draftingCosAi ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 text-brand-600" />}
                        <span>Auto-Draft COs from Syllabus (AI)</span>
                      </button>

                      {targetSubjectForCo.courseCode.toUpperCase() === 'CSC701' && (
                        <button
                          type="button"
                          onClick={loadCsc701Template}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-white px-2.5 py-1 rounded-lg border border-slate-200 shadow-2xs hover:bg-slate-50 transition"
                        >
                          Load CSC701 COs
                        </button>
                      )}
                      {targetSubjectForCo.courseCode.toUpperCase() === 'CSDO7023' && (
                        <button
                          type="button"
                          onClick={loadCsdo7023Template}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-white px-2.5 py-1 rounded-lg border border-slate-200 shadow-2xs hover:bg-slate-50 transition"
                        >
                          Load CSDO7023 COs
                        </button>
                      )}
                    </div>
                  </div>

                  <form id="co-form" onSubmit={handleSaveCourseOutcomes} className="space-y-3.5">
                    {coList.map((co, idx) => (
                      <div
                        key={co.coCode}
                        className="p-3.5 rounded-xl border border-slate-200 bg-white hover:border-slate-300 transition shadow-2xs"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="flex h-6 w-12 items-center justify-center rounded-md bg-brand-600 text-white font-mono font-bold text-xs shadow-2xs">
                              {co.coCode}
                            </span>
                            <span className="text-xs font-bold text-slate-700">Course Outcome {co.coNumber}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-1.5">
                              <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                                Hours:
                              </label>
                              <input
                                type="number"
                                min="1"
                                max="40"
                                required
                                value={co.syllabusHours}
                                onChange={(e) => {
                                  const val = Number(e.target.value);
                                  setCoList((prev) =>
                                    prev.map((item, i) => (i === idx ? { ...item, syllabusHours: val } : item))
                                  );
                                }}
                                className="w-16 rounded-lg border border-slate-200 px-2 py-1 text-xs font-mono font-bold text-slate-800 text-center focus:border-brand-500 focus:outline-none"
                              />
                              <span className="text-xs text-slate-400 font-mono">hrs</span>
                            </div>

                            {coList.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleRemoveCo(idx)}
                                className="text-slate-300 hover:text-red-600 transition p-1"
                                title={`Remove ${co.coCode}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </div>

                        <textarea
                          required
                          rows={2}
                          placeholder={`Enter formal syllabus statement for ${co.coCode}...`}
                          value={co.description}
                          onChange={(e) => {
                            const val = e.target.value;
                            setCoList((prev) =>
                              prev.map((item, i) => (i === idx ? { ...item, description: val } : item))
                            );
                          }}
                          className="w-full rounded-lg border border-slate-200 p-2.5 text-xs text-slate-800 placeholder-slate-400 focus:border-brand-500 focus:outline-none resize-none leading-relaxed"
                        />
                      </div>
                    ))}

                    {coList.length < 4 ? (
                      <button
                        type="button"
                        onClick={handleAddCo}
                        className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-brand-200 hover:border-brand-500 bg-brand-50/30 hover:bg-brand-50/70 py-3 text-xs font-bold text-brand-700 transition"
                      >
                        <Plus className="h-4 w-4" />
                        Add Course Outcome (CO{coList.length + 1})
                      </button>
                    ) : (
                      <div className="p-2.5 rounded-lg bg-slate-50 text-center text-xs text-slate-500 border border-slate-200">
                        Maximum 4 Course Outcomes (CO1 to CO4) configured for prototype scope.
                      </div>
                    )}

                    <p className="text-[11px] text-slate-400 italic">
                      Note: Course Outcomes configured here are strictly bound to NBA OBE requirements and will be synchronized to any teacher assigned to this course.
                    </p>
                  </form>
                </div>
              )}
            </div>

            {/* 3. Fixed Modal Footer */}
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between shrink-0">
              <span className="text-xs text-slate-500 font-medium">
                {syllabusModules.length} module{syllabusModules.length !== 1 ? 's' : ''} · {coList.length} outcome{coList.length !== 1 ? 's' : ''} · {targetSubjectForCo.totalSyllabusHours} target hours
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowCoModal(false)}
                  className="btn-secondary !py-2 !px-3.5 !text-xs"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={(e) => handleSaveCourseOutcomes(e as any)}
                  disabled={savingCos}
                  className="btn-primary !py-2 !px-4 !text-xs"
                >
                  {savingCos ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  Save Syllabus & COs
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
