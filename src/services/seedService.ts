import { writeBatch, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';

export const OFFICIAL_GLOBAL_OUTCOMES = [
  // PROGRAM OUTCOMES (POs)
  {
    id: 'PO1',
    type: 'PO',
    code: 'PO 01',
    shortLabel: 'PO1',
    sortOrder: 1,
    description:
      'Apply knowledge of mathematics, science, engineering fundamentals and computer engineering to the conceptualization of engineering models.',
  },
  {
    id: 'PO2',
    type: 'PO',
    code: 'PO 02',
    shortLabel: 'PO2',
    sortOrder: 2,
    description:
      'Identify, formulate, research literature and solve complex computer engineering problems reaching substantiated conclusions using first principles of mathematics and engineering sciences.',
  },
  {
    id: 'PO3',
    type: 'PO',
    code: 'PO 03',
    shortLabel: 'PO3',
    sortOrder: 3,
    description:
      'Design solutions for complex engineering problems and design systems, components or processes that meet specified needs with appropriate consideration for public health and safety, cultural, societal and environmental considerations.',
  },
  {
    id: 'PO4',
    type: 'PO',
    code: 'PO 04',
    shortLabel: 'PO4',
    sortOrder: 4,
    description:
      'Conduct investigations of complex problems including design of experiments, analysis and interpretation of data, and synthesis of information to provide valid conclusions.',
  },
  {
    id: 'PO5',
    type: 'PO',
    code: 'PO 05',
    shortLabel: 'PO5',
    sortOrder: 5,
    description:
      'Create, select and apply appropriate techniques, resources, and modern computing tools, including prediction and modeling, to complex engineering activities, with an understanding of the limitations.',
  },
  {
    id: 'PO6',
    type: 'PO',
    code: 'PO 06',
    shortLabel: 'PO6',
    sortOrder: 6,
    description:
      'Demonstrate understanding of the societal, health, safety, legal and cultural issues and the consequent responsibilities relevant to engineering practice.',
  },
  {
    id: 'PO7',
    type: 'PO',
    code: 'PO 07',
    shortLabel: 'PO7',
    sortOrder: 7,
    description:
      'Understand the impact of engineering solutions in a societal context and demonstrate knowledge of and need for sustainable development.',
  },
  {
    id: 'PO8',
    type: 'PO',
    code: 'PO 08',
    shortLabel: 'PO8',
    sortOrder: 8,
    description:
      'Understand and commit to professional ethics and responsibilities and norms of computer engineering practice.',
  },
  {
    id: 'PO9',
    type: 'PO',
    code: 'PO 09',
    shortLabel: 'PO9',
    sortOrder: 9,
    description:
      'Function effectively as an individual, and as a member or leader in diverse teams and in multi-disciplinary settings.',
  },
  {
    id: 'PO10',
    type: 'PO',
    code: 'PO 10',
    shortLabel: 'PO10',
    sortOrder: 10,
    description:
      'Communicate effectively on complex engineering activities with the engineering community and with society at large, such as being able to comprehend and write effective reports and design documentation, make effective presentations, and give and receive clear instructions.',
  },
  {
    id: 'PO11',
    type: 'PO',
    code: 'PO 11',
    shortLabel: 'PO11',
    sortOrder: 11,
    description:
      'Demonstrate a knowledge and understanding of management and business practices, such as risk and change management, and understand their limitations.',
  },
  {
    id: 'PO12',
    type: 'PO',
    code: 'PO 12',
    shortLabel: 'PO12',
    sortOrder: 12,
    description:
      'Recognize the need for, and have the ability to engage in independent and life-long learning.',
  },

  // PROGRAM EDUCATIONAL OBJECTIVES (PEOs)
  {
    id: 'PEO1',
    type: 'PEO',
    code: 'PEO 1',
    shortLabel: 'PEO1',
    sortOrder: 13,
    description:
      'To equip learners with a solid foundation in mathematics, statistics, and data science principles, along with core engineering knowledge.',
  },
  {
    id: 'PEO2',
    type: 'PEO',
    code: 'PEO 2',
    shortLabel: 'PEO2',
    sortOrder: 14,
    description:
      'To encourage learners to engage in self-learning and to use modern data science tools to address real-world problems.',
  },
  {
    id: 'PEO3',
    type: 'PEO',
    code: 'PEO 3',
    shortLabel: 'PEO3',
    sortOrder: 15,
    description:
      'To provide a broad education that helps learners understand the role of data science in global and social contexts, with a focus on ethical data use.',
  },
  {
    id: 'PEO4',
    type: 'PEO',
    code: 'PEO 4',
    shortLabel: 'PEO4',
    sortOrder: 16,
    description:
      'To encourage lifelong learning and professional development in the fast-growing field of data science.',
  },
  {
    id: 'PEO5',
    type: 'PEO',
    code: 'PEO 5',
    shortLabel: 'PEO5',
    sortOrder: 17,
    description:
      'To cultivate professional and ethical attitudes, good leadership skills, and a commitment to social responsibility in learners.',
  },

  // PROGRAM SPECIFIC OBJECTIVES (PSOs)
  {
    id: 'PSO1',
    type: 'PSO',
    code: 'PSO 01',
    shortLabel: 'PSO1',
    sortOrder: 18,
    description:
      'An ability to apply data science fundamentals to address complex and data-centric real world challenges.',
  },
  {
    id: 'PSO2',
    type: 'PSO',
    code: 'PSO 02',
    shortLabel: 'PSO2',
    sortOrder: 19,
    description:
      'An ability to design and develop effective solutions by incorporating data science methodologies and integrating new technologies that address societal needs.',
  },
] as const;

export async function seedOfficialGlobalOutcomes(superAdminUid: string) {
  const batch = writeBatch(db);
  for (const outcome of OFFICIAL_GLOBAL_OUTCOMES) {
    const ref = doc(db, 'global_outcomes', outcome.id);
    batch.set(
      ref,
      {
        ...outcome,
        status: 'active',
        updatedAt: serverTimestamp(),
        updatedBy: superAdminUid,
      },
      { merge: true }
    );
  }
  await batch.commit();
}
