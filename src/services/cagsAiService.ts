import { z } from 'zod';
import { openaiClient, OPENAI_MODEL } from '../lib/openai';
import { ALLOWED_COS, ALLOWED_OUTCOMES } from '../lib/cagsCalculations';

import type { SyllabusModule } from '../types';

// ---------------------------------------------------------------------------
// Schemas (AI_INTEGRATION.md §2.2 and §4)
// ---------------------------------------------------------------------------
export const AiMappingCellSchema = z.object({
  outcomeCode: z.enum(ALLOWED_OUTCOMES),
  level: z.union([z.literal(1), z.literal(2), z.literal(3), z.null()]),
  rationale: z.string().max(250),
});

export const AiCoRowSchema = z.object({
  coCode: z.enum(ALLOWED_COS),
  mappings: z.array(AiMappingCellSchema),
});

export const AiCoPoMappingResponseSchema = z.object({
  courseMappings: z.array(AiCoRowSchema),
});

export const AiActionPlanResponseSchema = z.object({
  actionPlans: z.array(
    z.object({
      coCode: z.enum(ALLOWED_COS),
      cayMinus1Plan: z.string().optional().default(''),
      cayPlan: z.string().min(1).max(600),
      cayPlus1Plan: z.string().optional().default(''),
    })
  ),
});

export const AiTeachingPlanIctSchema = z.object({
  recommendedIct: z.string().min(2).max(60),
  specificActivityIdea: z.string().max(200),
  suggestedRemark: z.string().max(60),
});

export const AiDraftCoSchema = z.object({
  coNumber: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  coCode: z.enum(['CO1', 'CO2', 'CO3', 'CO4']),
  description: z.string().min(10),
  syllabusHours: z.number().int().positive(),
});

export const AiDraftCosResponseSchema = z.object({
  courseOutcomes: z.array(AiDraftCoSchema).length(4),
});

export const AiGeneratedLectureSchema = z.object({
  sequenceNo: z.number().int().positive(),
  chapterNo: z.number().int().positive(),
  chapterTitle: z.string().min(1),
  topicTitle: z.string().min(1),
  mappedCoCode: z.enum(['CO1', 'CO2', 'CO3', 'CO4']),
  recommendedIct: z.string().min(1),
  pedagogicalGoal: z.string().optional().default(''),
});

export const AiFullSyllabusPlanResponseSchema = z.object({
  lectures: z.array(AiGeneratedLectureSchema),
});

export type AiCoPoMappingResponse = z.infer<typeof AiCoPoMappingResponseSchema>;
export type AiActionPlanResponse = z.infer<typeof AiActionPlanResponseSchema>;
export type AiTeachingPlanIctResponse = z.infer<typeof AiTeachingPlanIctSchema>;
export type AiDraftCo = z.infer<typeof AiDraftCoSchema>;
export type AiDraftCosResponse = z.infer<typeof AiDraftCosResponseSchema>;
export type AiGeneratedLecture = z.infer<typeof AiGeneratedLectureSchema>;
export type AiFullSyllabusPlanResponse = z.infer<typeof AiFullSyllabusPlanResponseSchema>;


// ---------------------------------------------------------------------------
// Payloads (course-level data only: zero student PII)
// ---------------------------------------------------------------------------
export interface AiCoInput {
  coCode: string;
  description: string;
  syllabusHours: number;
}
export interface AiOutcomeInput {
  id: string;
  description: string;
}

export const MAPPING_SYSTEM_PROMPT = `You are an NBA/AICTE Outcome-Based Education (OBE) curriculum expert for an undergraduate Computer Science & Engineering (Data Science) department.
Your task is to evaluate Course Outcomes (CO1 through CO4) against Program Outcomes (PO1 through PO12) and Program Specific Outcomes (PSO1 through PSO2) and assign appropriate correlation levels.

Correlation Level Rubric:
- 3 (High): The Course Outcome directly and substantially addresses the PO/PSO through core mathematical, analytical, design, or implementation concepts.
- 2 (Moderate): The Course Outcome moderately supports the PO/PSO through secondary problem-solving, tooling, or applied contexts.
- 1 (Low): The Course Outcome has a minor or peripheral connection to the PO/PSO.
- null (Not Mapped): The Course Outcome does not meaningfully address the PO/PSO.

Instructions for realistic OBE curriculum mapping:
- Output ONLY the mapped cells (level 1, 2 or 3) for each CO; omit unmapped outcomes entirely. Every CO1–CO4 must appear in the output.
- In this technical engineering discipline, each CO must realistically map to between 8 and 11 outcomes (out of the 14 total outcomes).
- Core technical engineering outcomes (PO1 Engineering Knowledge, PO2 Problem Analysis, PO3 Design/Development, PO4 Investigations, PO5 Modern Tool Usage, PO12 Life-long Learning, PSO1 Data Science Foundations, PSO2 Intelligent Systems) MUST be evaluated and almost always mapped with levels 2 or 3 across all COs.
- Professional practice outcomes (PO9 Individual & Team Work, PO10 Communication, PO11 Project Management) should be mapped with levels 1 or 2 where collaborative tutorials, reports, or mini-projects apply.
- Unrelated non-technical outcomes (e.g. PO6 Societal, PO7 Environment & Sustainability, PO8 Ethics) may be left unmapped if there is no genuine academic link.
- Use a natural distribution of correlation levels (mix of 3s, 2s, and 1s). Keep each rationale concise (under 15 words).

Return ONLY valid JSON matching this schema:
{"courseMappings":[{"coCode":"CO1","mappings":[{"outcomeCode":"PO1","level":3,"rationale":"short reason"}]}]}`;

export const ACTION_PLAN_SYSTEM_PROMPT = `You are an NBA/AICTE Outcome-Based Education (OBE) advisor for an undergraduate Computer Science Engineering curriculum.
For each provided Course Outcome (CO1 through CO4), generate a complete continuous improvement action plan covering all 3 academic cycles:
1. "cayMinus1Plan": Previous academic year baseline or prior pedagogical observation (e.g., "Delivered foundational theoretical concepts; observed student difficulty in complex analytical formulations during mid-term assessments.").
2. "cayPlan": Current academic year targeted pedagogical interventions, active learning, problem-solving tutorials, virtual simulations, or case studies to strengthen attainment.
3. "cayPlus1Plan": Next academic year planned continuous improvement action (e.g., "Integrate advanced computational simulation toolkits, industry guest lectures, and peer-assisted problem sessions to elevate higher-order design skills.").

Return ONLY valid JSON:
{
  "actionPlans": [
    {
      "coCode": "CO1",
      "cayMinus1Plan": "...",
      "cayPlan": "...",
      "cayPlus1Plan": "..."
    }
  ]
}`;

export function buildMappingUserPayload(
  courseName: string,
  courseCode: string,
  cos: AiCoInput[],
  outcomes: AiOutcomeInput[]
) {
  return {
    courseName,
    courseCode,
    courseOutcomes: cos.map((c) => ({
      coCode: c.coCode,
      description: c.description,
      syllabusHours: c.syllabusHours,
    })),
    globalOutcomes: outcomes.map((o) => ({ id: o.id, description: o.description })),
  };
}

export function buildActionPlanUserPayload(courseName: string, cos: AiCoInput[]) {
  return {
    courseName,
    courseOutcomes: cos.map((c) => ({ coCode: c.coCode, description: c.description })),
  };
}

export const TEACHING_PLAN_ICT_SYSTEM_PROMPT = `You are an academic teaching-plan assistant for an engineering faculty member.
Given a course name, chapter title, lecture topic, mapped CO, and lecture mode ("scheduled", "extra", or "online"), suggest:
1. "recommendedIct": One concise ICT delivery method aligned with CAGS workbook conventions: "Chalk Board", "Presentation", "Chalk Board, Presentation", "Online Tool", "Flipped", "Quiz", or "PPT". (If lectureMode is "online", prefer "Online Tool" or "Presentation").
2. "specificActivityIdea": A 1-sentence practical classroom or tool idea for teaching this specific topic.
3. "suggestedRemark": If lectureMode is "extra", return "Taken Extra Lecture". If lectureMode is "online", return "Taken Online Lecture". Otherwise return "".

Return ONLY valid JSON:
{
  "recommendedIct": "...",
  "specificActivityIdea": "...",
  "suggestedRemark": "..."
}`;

export function buildTeachingPlanIctUserPayload(
  courseName: string,
  chapterTitle: string,
  topicTitle: string,
  mappedCoCode: string,
  lectureMode: 'scheduled' | 'extra' | 'online' | 'cancelled'
) {
  return {
    courseName,
    chapterTitle,
    topicTitle,
    mappedCoCode,
    lectureMode: lectureMode === 'cancelled' ? 'scheduled' : lectureMode,
  };
}

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------
export class AiUnavailableError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'AiUnavailableError';
  }
}

function hasApiKey(): boolean {
  const key = import.meta.env.VITE_OPENAI_API_KEY as string | undefined;
  return !!key && key !== 'missing-key' && !key.includes('your-openai-api-key');
}

function explainError(err: unknown): string {
  const e = err as { status?: number; name?: string; message?: string };
  if (e?.status === 401) return 'invalid OpenAI API key (401)';
  if (e?.status === 429) return 'rate limit or quota exceeded (429)';
  if (e?.name === 'AbortError' || /abort|timeout/i.test(e?.message || '')) return 'request timed out';
  if (err instanceof z.ZodError) return 'AI returned an invalid response format';
  if (err instanceof SyntaxError) return 'AI returned malformed JSON';
  return e?.message || 'unknown error';
}

async function callJson(system: string, payload: unknown, maxTokens: number): Promise<unknown> {
  if (!hasApiKey()) throw new AiUnavailableError('VITE_OPENAI_API_KEY is missing');
  try {
    const res = await openaiClient.chat.completions.create(
      {
        model: OPENAI_MODEL,
        temperature: 0.2,
        max_tokens: maxTokens,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: JSON.stringify(payload) },
        ],
      },
      { signal: AbortSignal.timeout(30000) }
    );
    const text = res.choices[0]?.message?.content || '';
    return JSON.parse(text);
  } catch (err) {
    throw new AiUnavailableError(explainError(err));
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
export async function requestAiCoPoMapping(
  courseName: string,
  courseCode: string,
  cos: AiCoInput[],
  outcomes: AiOutcomeInput[]
): Promise<AiCoPoMappingResponse> {
  const raw = await callJson(
    MAPPING_SYSTEM_PROMPT,
    buildMappingUserPayload(courseName, courseCode, cos, outcomes),
    1800
  );
  const parsed = AiCoPoMappingResponseSchema.safeParse(raw);
  if (!parsed.success) {
    console.warn('[EduSync AI] Mapping response failed validation:', parsed.error.issues.slice(0, 5));
    throw new AiUnavailableError('AI returned an invalid response format');
  }
  return parsed.data;
}

export async function requestAiActionPlans(
  courseName: string,
  cos: AiCoInput[]
): Promise<AiActionPlanResponse> {
  const raw = await callJson(
    ACTION_PLAN_SYSTEM_PROMPT,
    buildActionPlanUserPayload(courseName, cos),
    2000
  );
  const parsed = AiActionPlanResponseSchema.safeParse(raw);
  if (!parsed.success) throw new AiUnavailableError('AI returned an invalid response format');
  return parsed.data;
}

/**
 * AI-assisted ICT recommendation and remark generator for teaching plan entries
 * and lecture attendance sessions.
 */
export async function requestAiTeachingPlanIct(
  courseName: string,
  chapterTitle: string,
  topicTitle: string,
  mappedCoCode: string,
  lectureMode: 'scheduled' | 'extra' | 'online' | 'cancelled' = 'scheduled'
): Promise<AiTeachingPlanIctResponse> {
  // If OpenAI is unavailable or errors, use pedagogical heuristics fallback
  try {
    const raw = await callJson(
      TEACHING_PLAN_ICT_SYSTEM_PROMPT,
      buildTeachingPlanIctUserPayload(courseName, chapterTitle, topicTitle, mappedCoCode, lectureMode),
      600
    );
    const parsed = AiTeachingPlanIctSchema.safeParse(raw);
    if (parsed.success) {
      return parsed.data;
    }
  } catch (err) {
    console.warn('[EduSync AI] ICT generation fallback engaged:', err);
  }

  // Fallback defaults aligned with EduSync institutional conventions
  let recommendedIct = 'Chalk Board, Presentation';
  if (lectureMode === 'online') {
    recommendedIct = 'Online Tool';
  } else if (/quiz|test|assessment/i.test(topicTitle)) {
    recommendedIct = 'Quiz';
  } else if (/case study|discussion|flipped/i.test(topicTitle)) {
    recommendedIct = 'Flipped';
  }

  let suggestedRemark = '';
  if (lectureMode === 'extra') suggestedRemark = 'Taken Extra Lecture';
  if (lectureMode === 'online') suggestedRemark = 'Taken Online Lecture';
  if (lectureMode === 'cancelled') suggestedRemark = 'Lecture Cancelled';

  return {
    recommendedIct,
    specificActivityIdea: `Review core theoretical foundations and solve illustrative problems on ${topicTitle}.`,
    suggestedRemark,
  };
}

// ---------------------------------------------------------------------------
// Universal AI Syllabus & Course Outcome Generators
// ---------------------------------------------------------------------------
export const DRAFT_COS_SYSTEM_PROMPT = `You are an NBA/AICTE Outcome-Based Education (OBE) curriculum expert.
Given a university engineering course, its modular syllabus, and total contact hours, draft exactly 4 Course Outcomes (CO1 to CO4).
Guidelines:
- Use active Bloom's Taxonomy verbs (e.g., CO1: Understand/Recall, CO2: Analyze/Apply, CO3: Design/Develop, CO4: Evaluate/Synthesize).
- Allocate syllabusHours for each CO such that CO1 + CO2 + CO3 + CO4 = totalSyllabusHours exactly.
- Return ONLY valid JSON matching this schema:
{
  "courseOutcomes": [
    { "coNumber": 1, "coCode": "CO1", "description": "...", "syllabusHours": 6 },
    { "coNumber": 2, "coCode": "CO2", "description": "...", "syllabusHours": 10 },
    { "coNumber": 3, "coCode": "CO3", "description": "...", "syllabusHours": 13 },
    { "coNumber": 4, "coCode": "CO4", "description": "...", "syllabusHours": 10 }
  ]
}`;

export async function requestAiDraftCourseOutcomes(
  courseName: string,
  courseCode: string,
  totalHours: number,
  syllabusModules: SyllabusModule[] = []
): Promise<AiDraftCosResponse> {
  const modulesSummary = syllabusModules.length > 0
    ? syllabusModules.map((m) => `Module ${m.moduleNo}: ${m.moduleName} (${m.hours} hrs) - Topics: ${m.topics.slice(0, 150)}`).join('\n')
    : 'Standard semester curriculum';

  const userPayload = `Course: ${courseCode} - ${courseName}
Total Syllabus Hours: ${totalHours}
Syllabus Modules:
${modulesSummary}

Draft exactly 4 Course Outcomes (CO1 to CO4) ensuring the sum of syllabusHours equals exactly ${totalHours}.`;

  try {
    const raw = await callJson(DRAFT_COS_SYSTEM_PROMPT, userPayload, 1200);
    const parsed = AiDraftCosResponseSchema.safeParse(raw);
    if (parsed.success) {
      // Validate hour sum matches totalHours exactly
      const sum = parsed.data.courseOutcomes.reduce((acc, c) => acc + c.syllabusHours, 0);
      if (sum === totalHours) {
        return parsed.data;
      }
      // Rebalance difference into CO3/CO4
      const diff = totalHours - sum;
      parsed.data.courseOutcomes[2].syllabusHours += diff;
      return parsed.data;
    }
  } catch (err) {
    console.warn('[EduSync AI] Draft COs generation fallback engaged:', err);
  }

  // Deterministic Fallback based on Bloom's taxonomy & module distribution
  const h1 = Math.round(totalHours * 0.18);
  const h2 = Math.round(totalHours * 0.28);
  const h3 = Math.round(totalHours * 0.30);
  const h4 = totalHours - (h1 + h2 + h3);

  const m1Title = syllabusModules[0]?.moduleName || 'fundamental principles';
  const m2Title = syllabusModules[1]?.moduleName || 'theoretical frameworks';
  const m3Title = syllabusModules[2]?.moduleName || syllabusModules[3]?.moduleName || 'design architectures';
  const m4Title = syllabusModules[syllabusModules.length - 1]?.moduleName || 'advanced applications';

  return {
    courseOutcomes: [
      {
        coNumber: 1,
        coCode: 'CO1',
        description: `Understand and describe foundational concepts and core principles of ${m1Title}.`,
        syllabusHours: h1,
      },
      {
        coNumber: 2,
        coCode: 'CO2',
        description: `Analyze, formulate, and apply mathematical models and algorithms in ${m2Title}.`,
        syllabusHours: h2,
      },
      {
        coNumber: 3,
        coCode: 'CO3',
        description: `Design and evaluate computational systems and optimization techniques for ${m3Title}.`,
        syllabusHours: h3,
      },
      {
        coNumber: 4,
        coCode: 'CO4',
        description: `Synthesize and implement practical applications, modern tools, and recent trends in ${m4Title}.`,
        syllabusHours: h4,
      },
    ],
  };
}

export const FULL_SYLLABUS_PLAN_SYSTEM_PROMPT = `You are an NBA/AICTE Outcome-Based Education (OBE) curriculum planner.
Given a university course, total syllabus hours (N), syllabus modules, and Course Outcomes (CO1..CO4), generate a complete lecture-by-lecture Teaching Plan for EXACTLY N lectures.
Requirements:
1. Output EXACTLY N lectures in the array (sequenceNo 1 through N).
2. Distribute lectures across chapters according to each module's assigned contact hours.
3. Provide a clear, granular topicTitle for each individual 1-hour session.
4. Assign mappedCoCode ('CO1' | 'CO2' | 'CO3' | 'CO4') aligned with that chapter's scope.
5. Recommend an appropriate ICT/pedagogical tool (e.g. "Chalk Board, Presentation", "Colab Notebook / Python Demo", "Online Simulation", "Quiz", "Case Study").
Return ONLY valid JSON matching this schema:
{
  "lectures": [
    {
      "sequenceNo": 1,
      "chapterNo": 1,
      "chapterTitle": "...",
      "topicTitle": "...",
      "mappedCoCode": "CO1",
      "recommendedIct": "Presentation",
      "pedagogicalGoal": "..."
    }
  ]
}`;

export async function requestAiFullSyllabusPlan(
  courseName: string,
  courseCode: string,
  totalHours: number,
  syllabusModules: SyllabusModule[] = [],
  cos: Array<{ coCode: 'CO1' | 'CO2' | 'CO3' | 'CO4'; description: string; syllabusHours: number }> = []
): Promise<AiFullSyllabusPlanResponse> {
  const modulesSummary = syllabusModules.length > 0
    ? syllabusModules.map((m) => `Module ${m.moduleNo} (${m.hours} hrs): ${m.moduleName}\nContent: ${m.topics}`).join('\n\n')
    : `Course Overview: ${courseName} (Standard curriculum)`;

  const cosSummary = cos.length > 0
    ? cos.map((c) => `${c.coCode} (${c.syllabusHours} hrs): ${c.description}`).join('\n')
    : 'CO1 to CO4 mapped sequentially';

  const userPayload = `Course: ${courseCode} - ${courseName}
Total Contact Hours: ${totalHours} lectures
Modules Breakdown:
${modulesSummary}

Course Outcomes:
${cosSummary}

Generate exactly ${totalHours} sequential lecture entries (sequenceNo 1 to ${totalHours}).`;

  try {
    const raw = await callJson(FULL_SYLLABUS_PLAN_SYSTEM_PROMPT, userPayload, 3800);
    const parsed = AiFullSyllabusPlanResponseSchema.safeParse(raw);
    if (parsed.success && parsed.data.lectures.length === totalHours) {
      return parsed.data;
    }
    if (parsed.success && parsed.data.lectures.length > 0) {
      // If slight discrepancy in count, slice or pad to totalHours
      const lectures = parsed.data.lectures.slice(0, totalHours);
      while (lectures.length < totalHours) {
        const last = lectures[lectures.length - 1];
        lectures.push({
          sequenceNo: lectures.length + 1,
          chapterNo: last.chapterNo,
          chapterTitle: last.chapterTitle,
          topicTitle: `Advanced Case Studies & Problem Solving in ${last.chapterTitle}`,
          mappedCoCode: last.mappedCoCode,
          recommendedIct: 'Presentation, Quiz',
          pedagogicalGoal: 'Reinforce analytical concepts',
        });
      }
      return { lectures };
    }
  } catch (err) {
    console.warn('[EduSync AI] Full syllabus plan AI generation fallback engaged:', err);
  }

  // Deterministic Fallback: Distribute module topics across exact hour counts
  const lectures: AiGeneratedLecture[] = [];
  let seq = 1;

  // If no modules defined, create a generic module set
  const modulesToUse: SyllabusModule[] = syllabusModules.length > 0
    ? syllabusModules
    : [
        { moduleNo: 1, moduleName: 'Foundations and Overview', hours: Math.round(totalHours * 0.2), topics: 'Introduction, Historical Context, Basic Terminologies, Core Frameworks' },
        { moduleNo: 2, moduleName: 'Theoretical Modeling & Analysis', hours: Math.round(totalHours * 0.25), topics: 'Formulation, Mathematical Models, Analytical Methods, Evaluation' },
        { moduleNo: 3, moduleName: 'Design and Optimization', hours: Math.round(totalHours * 0.3), topics: 'Architectures, Algorithms, Optimization Techniques, Performance Metrics' },
        { moduleNo: 4, moduleName: 'Applications and Emerging Trends', hours: totalHours - (Math.round(totalHours * 0.2) + Math.round(totalHours * 0.25) + Math.round(totalHours * 0.3)), topics: 'Case Studies, Practical Implementations, Industry Tools, Future Trends' },
      ];

  // Map COs based on cumulative hours or module index
  for (let mIdx = 0; mIdx < modulesToUse.length; mIdx++) {
    const mod = modulesToUse[mIdx];
    const modHours = mod.hours > 0 ? mod.hours : 1;
    
    // Parse subtopics from topics string (split by numbered items like 1.1, newlines, semicolons or commas)
    const rawSubtopics = mod.topics
      .split(/\n|;|\d+\.\d+\s+/)
      .map((s) => s.trim().replace(/^[-*•]\s*/, ''))
      .filter((s) => s.length > 3);

    // Map module to CO: Module 1 -> CO1, Module 2 -> CO2, Module 3/4 -> CO3, Module 5/6 -> CO4
    let coCode: 'CO1' | 'CO2' | 'CO3' | 'CO4' = 'CO1';
    const progressRatio = seq / totalHours;
    if (progressRatio <= 0.25) coCode = 'CO1';
    else if (progressRatio <= 0.55) coCode = 'CO2';
    else if (progressRatio <= 0.85) coCode = 'CO3';
    else coCode = 'CO4';

    for (let h = 0; h < modHours && seq <= totalHours; h++) {
      let topic = rawSubtopics[h];
      if (!topic) {
        if (h === 0) topic = `Overview & Core Principles of ${mod.moduleName}`;
        else if (h === modHours - 1) topic = `Tutorial & Problem Solving: ${mod.moduleName}`;
        else topic = `${mod.moduleName} - Topic ${h + 1}`;
      }

      let ict = 'Chalk Board, Presentation';
      if (/tutorial|problem|numerical/i.test(topic)) ict = 'Chalk Board';
      else if (/demo|tool|notebook|python|code/i.test(topic)) ict = 'Colab Notebook / Python Demo';
      else if (/quiz|review|summary/i.test(topic)) ict = 'Quiz, Presentation';

      lectures.push({
        sequenceNo: seq,
        chapterNo: mod.moduleNo,
        chapterTitle: mod.moduleName,
        topicTitle: topic,
        mappedCoCode: coCode,
        recommendedIct: ict,
        pedagogicalGoal: `Understand and apply concepts of ${topic}`,
      });
      seq++;
    }
  }

  // Ensure total count matches totalHours exactly
  while (lectures.length < totalHours) {
    const last = lectures[lectures.length - 1];
    lectures.push({
      sequenceNo: lectures.length + 1,
      chapterNo: last.chapterNo,
      chapterTitle: last.chapterTitle,
      topicTitle: `Comprehensive Review and Case Study on ${last.chapterTitle}`,
      mappedCoCode: 'CO4',
      recommendedIct: 'Presentation, Quiz',
      pedagogicalGoal: 'Consolidate course learnings',
    });
  }

  return { lectures: lectures.slice(0, totalHours) };
}

