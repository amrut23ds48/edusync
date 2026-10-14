import { describe, expect, it, vi } from 'vitest';

vi.mock('../lib/firebase', () => ({ db: {}, auth: {} }));

import { OFFICIAL_GLOBAL_OUTCOMES } from '../services/seedService';

describe('OFFICIAL_GLOBAL_OUTCOMES', () => {
  const byType = (t: string) => OFFICIAL_GLOBAL_OUTCOMES.filter((o) => o.type === t);

  it('contains exactly 19 outcomes: 12 PO, 5 PEO, 2 PSO', () => {
    expect(OFFICIAL_GLOBAL_OUTCOMES).toHaveLength(19);
    expect(byType('PO')).toHaveLength(12);
    expect(byType('PEO')).toHaveLength(5);
    expect(byType('PSO')).toHaveLength(2);
  });

  it('has unique ids and contiguous sortOrder 1..19', () => {
    const ids = OFFICIAL_GLOBAL_OUTCOMES.map((o) => o.id);
    expect(new Set(ids).size).toBe(19);
    expect(OFFICIAL_GLOBAL_OUTCOMES.map((o) => o.sortOrder)).toEqual(Array.from({ length: 19 }, (_, i) => i + 1));
  });

  it('uses deterministic ids matching shortLabel and non-empty descriptions', () => {
    for (const o of OFFICIAL_GLOBAL_OUTCOMES) {
      expect(o.id).toBe(o.shortLabel);
      expect(o.description.trim().length).toBeGreaterThan(20);
      expect(o.description).not.toMatch(/cite/i);
    }
  });

  it('has the expected id sets', () => {
    expect(byType('PO').map((o) => o.id)).toEqual(Array.from({ length: 12 }, (_, i) => `PO${i + 1}`));
    expect(byType('PEO').map((o) => o.id)).toEqual(['PEO1', 'PEO2', 'PEO3', 'PEO4', 'PEO5']);
    expect(byType('PSO').map((o) => o.id)).toEqual(['PSO1', 'PSO2']);
  });
});
