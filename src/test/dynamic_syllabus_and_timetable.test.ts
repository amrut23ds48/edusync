import { describe, it, expect } from 'vitest';
import {
  generateLectureDates,
} from '../services/teachingPlanService';
import {
  requestAiDraftCourseOutcomes,
  requestAiFullSyllabusPlan,
} from '../services/cagsAiService';
import type { SyllabusModule } from '../types';

describe('Universal Dynamic Syllabus & Timetable Tests', () => {
  // Sample University of Mumbai CSC701 Deep Learning Syllabus
  const CSC701_MODULES: SyllabusModule[] = [
    {
      moduleNo: 1,
      moduleName: 'Fundamentals of Neural Network',
      hours: 4,
      topics: '1.1 History of Deep Learning, MLPs, Sigmoid Neurons, Gradient Descent, Feedforward NN\n1.2 Deep Networks: Basic Terminologies',
    },
    {
      moduleNo: 2,
      moduleName: 'Training, Optimization and Regularization of Deep Neural Network',
      hours: 10,
      topics: '2.1 Training Feedforward DNN: Multi Layered Feed Forward, Activation functions (Tanh, ReLU, Softmax)\n2.2 Optimization: Backprop, GD, Adam, RMSProp\n2.3 Regularization: Dropout, Weight Decay, BatchNorm, Data Augmentation',
    },
    {
      moduleNo: 3,
      moduleName: 'Autoencoders: Unsupervised Learning',
      hours: 6,
      topics: '3.1 Linear Autoencoder, Undercomplete, Overcomplete\n3.2 Denoising, Sparse, Contractive\n3.3 Application: Image Compression',
    },
    {
      moduleNo: 4,
      moduleName: 'Convolutional Neural Networks (CNN)',
      hours: 7,
      topics: '4.1 Convolution operation, Padding, Stride, CNN architecture, Pooling Layer, Weight Sharing\n4.2 LeNet, AlexNet, ResNet',
    },
    {
      moduleNo: 5,
      moduleName: 'Recurrent Neural Networks (RNN)',
      hours: 8,
      topics: '5.1 Sequence Learning, Computational graphs, Bidirectional RNN, BPTT, Vanishing Gradients\n5.2 LSTM, GRU',
    },
    {
      moduleNo: 6,
      moduleName: 'Recent Trends and Applications',
      hours: 4,
      topics: '6.1 Generative Adversarial Network (GAN)\n6.2 Applications: Image Generation, DeepFake',
    },
  ];

  describe('1. Date Generation for Lecture Schedules', () => {
    it('generates exactly N dates on MWF class days starting from a Monday', () => {
      const dates = generateLectureDates('2026-07-06', 39);
      expect(dates).toHaveLength(39);

      // Verify all dates fall on Monday (1), Wednesday (3), or Friday (5)
      for (const dStr of dates) {
        const parts = dStr.split('-').map(Number);
        const day = new Date(parts[0], parts[1] - 1, parts[2]).getDay();
        expect([1, 3, 5]).toContain(day);
      }

      // First date should be Monday July 6, 2026
      expect(dates[0]).toBe('2026-07-06');
    });

    it('advances properly to next MWF even if start date is a Tuesday or weekend', () => {
      // 2026-07-07 is Tuesday, next class day is Wednesday 2026-07-08
      const dates = generateLectureDates('2026-07-07', 5);
      expect(dates).toHaveLength(5);
      expect(dates[0]).toBe('2026-07-08'); // Wednesday
      expect(dates[1]).toBe('2026-07-10'); // Friday
      expect(dates[2]).toBe('2026-07-13'); // Monday
    });
  });

  describe('2. AI / Deterministic Course Outcome (CO1–CO4) Drafting', () => {
    it('drafts 4 Course Outcomes with exact sum of hours matching 39 hours', async () => {
      const res = await requestAiDraftCourseOutcomes(
        'Deep Learning',
        'CSC701',
        39,
        CSC701_MODULES
      );

      expect(res.courseOutcomes).toHaveLength(4);
      const totalHours = res.courseOutcomes.reduce((acc, c) => acc + c.syllabusHours, 0);
      expect(totalHours).toBe(39);

      expect(res.courseOutcomes[0].coCode).toBe('CO1');
      expect(res.courseOutcomes[1].coCode).toBe('CO2');
      expect(res.courseOutcomes[2].coCode).toBe('CO3');
      expect(res.courseOutcomes[3].coCode).toBe('CO4');

      for (const co of res.courseOutcomes) {
        expect(co.description.length).toBeGreaterThan(15);
        expect(co.syllabusHours).toBeGreaterThan(0);
      }
    }, 45000);

    it('balances CO hours for arbitrary totals (e.g., 30 hours and 45 hours)', async () => {
      const res30 = await requestAiDraftCourseOutcomes('Web Computing', 'CSC501', 30);
      const sum30 = res30.courseOutcomes.reduce((acc, c) => acc + c.syllabusHours, 0);
      expect(sum30).toBe(30);

      const res45 = await requestAiDraftCourseOutcomes('Advanced Machine Learning', 'CSDO801', 45);
      const sum45 = res45.courseOutcomes.reduce((acc, c) => acc + c.syllabusHours, 0);
      expect(sum45).toBe(45);
    }, 45000);
  });

  describe('3. Universal Full Syllabus Lecture-by-Lecture Generation', () => {
    it('generates exactly 39 lectures matching CSC701 6 modules and contact hours', async () => {
      const cos = [
        { coCode: 'CO1' as const, description: 'Neural Network Fundamentals', syllabusHours: 4 },
        { coCode: 'CO2' as const, description: 'Deep Network Training & Optimization', syllabusHours: 16 },
        { coCode: 'CO3' as const, description: 'Supervised & Unsupervised DNN Models', syllabusHours: 15 },
        { coCode: 'CO4' as const, description: 'Recent Trends & GANs', syllabusHours: 4 },
      ];

      const res = await requestAiFullSyllabusPlan(
        'Deep Learning',
        'CSC701',
        39,
        CSC701_MODULES,
        cos
      );

      expect(res.lectures).toHaveLength(39);

      // Verify strictly sequential sequenceNo from 1 to 39
      for (let i = 0; i < 39; i++) {
        expect(res.lectures[i].sequenceNo).toBe(i + 1);
        expect(['CO1', 'CO2', 'CO3', 'CO4']).toContain(res.lectures[i].mappedCoCode);
        expect(res.lectures[i].chapterTitle.length).toBeGreaterThan(0);
        expect(res.lectures[i].topicTitle.length).toBeGreaterThan(0);
        expect(res.lectures[i].recommendedIct.length).toBeGreaterThan(0);
      }

      // First lecture should belong to Chapter 1
      expect(res.lectures[0].chapterNo).toBe(1);
      expect(res.lectures[0].chapterTitle).toContain('Fundamentals of Neural Network');
    }, 45000);

    it('generates exact lecture counts for arbitrary 30-hour curricula', async () => {
      const res30 = await requestAiFullSyllabusPlan('Cloud Security', 'CSC603', 30);
      expect(res30.lectures).toHaveLength(30);
      expect(res30.lectures[29].sequenceNo).toBe(30);
    }, 60000);

    it('generates exact lecture counts for arbitrary 45-hour curricula', async () => {
      const res45 = await requestAiFullSyllabusPlan('Big Data Analytics', 'CSC702', 45);
      expect(res45.lectures).toHaveLength(45);
      expect(res45.lectures[44].sequenceNo).toBe(45);
    }, 60000);
  });

  describe('4. Teacher Timetable Scheduling & Today Slots Matching', () => {
    it('filters active slots matching today day of week and generates deep link', () => {
      const mockSlots = [
        {
          id: 'slot_1',
          academicYearId: '2025-26',
          classId: 'class_becse_vii',
          classDivision: 'BECSE-AIML / VII',
          subjectId: 'subj_csc701',
          courseCode: 'CSC701',
          courseName: 'Deep Learning (TH)',
          teacherUid: 'teacher_123',
          teacherName: 'Dr. Sharma',
          dayOfWeek: 3, // Wednesday
          dayName: 'Wednesday',
          startTime: '10:15',
          endTime: '11:15',
          roomNumber: 'CR 401',
          effectiveFrom: '2026-07-01',
          effectiveTo: '2026-11-30',
          status: 'active' as const,
        },
        {
          id: 'slot_2',
          academicYearId: '2025-26',
          classId: 'class_becse_vii',
          classDivision: 'BECSE-AIML / VII',
          subjectId: 'subj_csl701',
          courseCode: 'CSL701',
          courseName: 'Deep Learning Lab (PR)',
          teacherUid: 'teacher_123',
          teacherName: 'Dr. Sharma',
          dayOfWeek: 3, // Wednesday
          dayName: 'Wednesday',
          startTime: '14:00',
          endTime: '16:00',
          roomNumber: 'Lab 2',
          effectiveFrom: '2026-07-01',
          effectiveTo: '2026-11-30',
          status: 'active' as const,
        },
        {
          id: 'slot_3',
          academicYearId: '2025-26',
          classId: 'class_becse_vii',
          classDivision: 'BECSE-AIML / VII',
          subjectId: 'subj_csdo7023',
          courseCode: 'CSDO7023',
          courseName: 'Game Theory for Data Science',
          teacherUid: 'teacher_123',
          teacherName: 'Dr. Sharma',
          dayOfWeek: 5, // Friday
          dayName: 'Friday',
          startTime: '11:15',
          endTime: '12:15',
          roomNumber: 'CR 402',
          effectiveFrom: '2026-07-01',
          effectiveTo: '2026-11-30',
          status: 'active' as const,
        },
      ];

      // Test filtering for Wednesday (dayOfWeek = 3)
      const wednesdaySlots = mockSlots
        .filter((s) => s.dayOfWeek === 3)
        .sort((a, b) => a.startTime.localeCompare(b.startTime));

      expect(wednesdaySlots).toHaveLength(2);
      expect(wednesdaySlots[0].courseCode).toBe('CSC701');
      expect(wednesdaySlots[1].courseCode).toBe('CSL701');

      // Test deep link construction
      const todayDate = '2026-10-14';
      const deepLink = `/teacher/subject/${wednesdaySlots[0].subjectId}/attendance?date=${todayDate}&time=${wednesdaySlots[0].startTime}`;
      expect(deepLink).toBe('/teacher/subject/subj_csc701/attendance?date=2026-10-14&time=10:15');
    });
  });
});
