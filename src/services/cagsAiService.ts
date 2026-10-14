import { z } from 'zod';
import { openaiClient, OPENAI_MODEL } from '../lib/openai';
import { ALLOWED_COS, ALLOWED_OUTCOMES } from '../lib/cagsCalculations';

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

export type AiCoPoMappingResponse = z.infer<typeof AiCoPoMappingResponseSchema>;
export type AiActionPlanResponse = z.infer<typeof AiActionPlanResponseSchema>;

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
    console.warn('[CAGS AI] Mapping response failed validation:', parsed.error.issues.slice(0, 5));
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
