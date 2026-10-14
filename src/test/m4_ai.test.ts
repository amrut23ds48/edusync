import { describe, it, expect } from 'vitest';
import {
  AiCoPoMappingResponseSchema,
  AiActionPlanResponseSchema,
  buildMappingUserPayload,
  buildActionPlanUserPayload,
  MAPPING_SYSTEM_PROMPT,
} from '../services/cagsAiService';

const cos = [
  { coCode: 'CO1', description: 'Analyze games', syllabusHours: 7 },
  { coCode: 'CO2', description: 'Nash', syllabusHours: 10 },
];
const outcomes = [{ id: 'PO1', description: 'Engineering knowledge' }];

describe('M4-V2 AI schemas & payloads', () => {
  it('accepts a valid mapping response including null levels', () => {
    const r = AiCoPoMappingResponseSchema.safeParse({
      courseMappings: [
        { coCode: 'CO1', mappings: [
          { outcomeCode: 'PO1', level: 3, rationale: 'core' },
          { outcomeCode: 'PO6', level: null, rationale: '' },
        ] },
      ],
    });
    expect(r.success).toBe(true);
  });

  it('rejects CO5, PO15 and levels outside 1–3', () => {
    const base = (coCode: string, outcomeCode: string, level: unknown) => ({
      courseMappings: [{ coCode, mappings: [{ outcomeCode, level, rationale: 'x' }] }],
    });
    expect(AiCoPoMappingResponseSchema.safeParse(base('CO5', 'PO1', 3)).success).toBe(false);
    expect(AiCoPoMappingResponseSchema.safeParse(base('CO1', 'PO15', 3)).success).toBe(false);
    expect(AiCoPoMappingResponseSchema.safeParse(base('CO1', 'PO1', 4)).success).toBe(false);
  });

  it('validates action plan responses', () => {
    expect(AiActionPlanResponseSchema.safeParse({ actionPlans: [{ coCode: 'CO1', cayPlan: 'Do X' }] }).success).toBe(true);
    expect(AiActionPlanResponseSchema.safeParse({ actionPlans: [{ coCode: 'CO7', cayPlan: 'Do X' }] }).success).toBe(false);
  });

  it('request payloads contain zero student PII', () => {
    const body = JSON.stringify([
      MAPPING_SYSTEM_PROMPT,
      buildMappingUserPayload('Game Theory', 'CSDO7023', cos, outcomes),
      buildActionPlanUserPayload('Game Theory', cos),
    ]).toLowerCase();
    for (const banned of ['rollno', 'studentname', 'email', 'contactno', '@']) {
      expect(body).not.toContain(banned);
    }
  });
});
