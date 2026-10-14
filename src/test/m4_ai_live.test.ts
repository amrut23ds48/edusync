import { describe, it, expect } from 'vitest';
import { requestAiCoPoMapping, requestAiActionPlans } from '../services/cagsAiService';
import { calculatePoSummary, buildMatrix } from '../lib/cagsCalculations';

import { OFFICIAL_GLOBAL_OUTCOMES } from '../services/seedService';

// Live OpenAI smoke test. Runs only when RUN_LIVE_AI=1 and a key exists in .env.local.
const live = process.env.RUN_LIVE_AI === '1' && !!import.meta.env.VITE_OPENAI_API_KEY;

const cos = [
  { coCode: 'CO1', description: 'Analyze and discuss the notion of a strategic game and equilibria.', syllabusHours: 7 },
  { coCode: 'CO2', description: 'Discuss the use of Nash Equilibrium for other problems.', syllabusHours: 10 },
  { coCode: 'CO3', description: 'Identify applications of Bayesian Games and implement a virtual business scenario.', syllabusHours: 12 },
  { coCode: 'CO4', description: 'Identify and discuss the working principle of Non-Cooperative Games.', syllabusHours: 10 },
];
const outcomes = OFFICIAL_GLOBAL_OUTCOMES.filter((o) => o.type === 'PO' || o.type === 'PSO').map((o) => ({
  id: o.shortLabel,
  description: o.description,
}));

describe.skipIf(!live)('M4-V2 live OpenAI', () => {
  it('returns validated CO–PO mapping in under 10s', async () => {
    const t0 = Date.now();
    const res = await requestAiCoPoMapping('Game Theory for Data Science', 'CSDO7023', cos, outcomes);
    const secs = (Date.now() - t0) / 1000;
    console.log(`AI mapping took ${secs.toFixed(1)}s`);
    expect(res.courseMappings.length).toBeGreaterThan(0);
    for (const row of res.courseMappings) {
      const mapped = row.mappings.filter((m) => m.level !== null).length;
      console.log(`${row.coCode}: ${mapped} mapped`);
      expect(mapped).toBeGreaterThanOrEqual(4);
    }
    expect(secs).toBeLessThan(10);
    const matrix = buildMatrix(cos.map((c) => ({ id: c.coCode, coCode: c.coCode as 'CO1', syllabusHours: c.syllabusHours })));
    for (const row of res.courseMappings) {
      for (const m of row.mappings) matrix[row.coCode].mappings[m.outcomeCode].level = m.level;
    }
    const summary = calculatePoSummary(matrix, cos.map((c) => ({ coCode: c.coCode as 'CO1', syllabusHours: c.syllabusHours })));
    expect(Object.keys(summary)).toHaveLength(14);
  }, 30000);

  it('returns validated action plans', async () => {
    const res = await requestAiActionPlans('Game Theory for Data Science', cos);
    expect(res.actionPlans.length).toBeGreaterThan(0);
  }, 30000);
});
