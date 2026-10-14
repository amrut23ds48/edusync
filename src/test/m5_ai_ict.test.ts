import { describe, it, expect } from 'vitest';
import {
  AiTeachingPlanIctSchema,
  requestAiTeachingPlanIct,
  buildTeachingPlanIctUserPayload,
} from '../services/cagsAiService';

describe('Milestone 5 AI ICT Suggestion Service', () => {
  it('validates schema with proper ICT tools, activity idea, and remarks', () => {
    const valid = {
      recommendedIct: 'Chalk Board, Presentation',
      specificActivityIdea: 'Interactive payoff matrix simulation and student pair exercise.',
      suggestedRemark: 'Taken Extra Lecture',
    };
    const parsed = AiTeachingPlanIctSchema.safeParse(valid);
    expect(parsed.success).toBe(true);

    const invalid = {
      recommendedIct: 'C', // too short
      specificActivityIdea: 'A',
      suggestedRemark: '',
    };
    expect(AiTeachingPlanIctSchema.safeParse(invalid).success).toBe(false);
  });

  it('builds payload without student PII', () => {
    const payload = buildTeachingPlanIctUserPayload(
      'Game Theory for Data Science (TH)',
      'Games with Perfect Information',
      'Nash Equilibrium',
      'CO2',
      'extra'
    );
    expect(payload.courseName).toBe('Game Theory for Data Science (TH)');
    expect(payload.topicTitle).toBe('Nash Equilibrium');
    expect(payload.lectureMode).toBe('extra');
    expect((payload as any).students).toBeUndefined();
  });

  it('provides reliable ICT suggestions and remarks (live or fallback)', async () => {
    const res = await requestAiTeachingPlanIct(
      'Game Theory for Data Science (TH)',
      'Introduction to Strategic Games',
      'Prisoner Dilemma Online Quiz',
      'CO1',
      'online'
    );
    expect(res.recommendedIct).toBeDefined();
    expect(res.suggestedRemark).toBe('Taken Online Lecture');
    expect(res.specificActivityIdea.length).toBeGreaterThan(10);
  });
});

