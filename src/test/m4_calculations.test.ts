import { describe, it, expect } from 'vitest';
import {
  deriveStrength,
  coPercentOfTotal,
  calculateTableA,
  calculatePoSummary,
  buildMatrix,
  formatMappedCos,
  validateCourseOutcomes,
  enforceMinimumMappingCoverage,
} from '../lib/cagsCalculations';

const cos = [
  { id: 's_CO1', coCode: 'CO1' as const, description: 'd1', syllabusHours: 7 },
  { id: 's_CO2', coCode: 'CO2' as const, description: 'd2', syllabusHours: 10 },
  { id: 's_CO3', coCode: 'CO3' as const, description: 'd3', syllabusHours: 12 },
  { id: 's_CO4', coCode: 'CO4' as const, description: 'd4', syllabusHours: 10 },
];

describe('M4 calculation engine', () => {
  it('derives strength at every boundary', () => {
    expect(deriveStrength(0)).toBe(0);
    expect(deriveStrength(0.99)).toBe(0);
    expect(deriveStrength(1)).toBe(1);
    expect(deriveStrength(39.99)).toBe(1);
    expect(deriveStrength(40)).toBe(2);
    expect(deriveStrength(69.99)).toBe(2);
    expect(deriveStrength(70)).toBe(3);
    expect(deriveStrength(100)).toBe(3);
  });

  it('Table A percentages of 39 hours sum to 100', () => {
    expect(coPercentOfTotal(7)).toBeCloseTo(17.95, 2);
    const a = calculateTableA(cos);
    expect(a.totalHours).toBe(39);
    expect(a.totalPercent).toBeCloseTo(100, 6);
  });

  it('Table B derives hours, % and strength from the matrix', () => {
    const m = buildMatrix(cos);
    m.CO1.mappings.PO1.level = 3;
    m.CO2.mappings.PO1.level = 2;
    m.CO3.mappings.PO1.level = 1;
    m.CO4.mappings.PO1.level = 3; // all four -> 39h -> 100% -> 3
    m.CO1.mappings.PO2.level = 1; // 7h -> 17.95% -> 1
    m.CO2.mappings.PO3.level = 2;
    m.CO3.mappings.PO3.level = 2; // 22h -> 56.41% -> 2
    const s = calculatePoSummary(m, cos);
    expect(s.PO1).toMatchObject({ mappedHours: 39, percentageMapping: 100, calculatedStrength: 3 });
    expect(s.PO2).toMatchObject({ mappedHours: 7, calculatedStrength: 1 });
    expect(s.PO3).toMatchObject({ mappedHours: 22, calculatedStrength: 2 });
    expect(s.PO4).toMatchObject({ mappedHours: 0, percentageMapping: 0, calculatedStrength: 0 });
    expect(Object.keys(s)).toHaveLength(14);
  });

  it('M4-V3: editing a matrix cell changes derived strength immediately', () => {
    const m = buildMatrix(cos);
    m.CO3.mappings.PO5.level = 3; // 12h -> 30.77% -> 1
    expect(calculatePoSummary(m, cos).PO5.calculatedStrength).toBe(1);
    m.CO2.mappings.PO5.level = 2;
    m.CO4.mappings.PO5.level = 1; // 32h -> 82.05% -> 3
    expect(calculatePoSummary(m, cos).PO5.calculatedStrength).toBe(3);
    m.CO4.mappings.PO5.level = null; // 22h -> 56.4% -> 2
    expect(calculatePoSummary(m, cos).PO5.calculatedStrength).toBe(2);
  });

  it('formats mapped CO lists like the workbook', () => {
    expect(formatMappedCos([])).toBe('—');
    expect(formatMappedCos(['CO1', 'CO2', 'CO3', 'CO4'])).toBe('CO1–CO4');
    expect(formatMappedCos(['CO2', 'CO4'])).toBe('CO2, CO4');
  });

  it('M4-V1: validates CO1–CO4 with hours summing to 39 and blocks CO5', () => {
    expect(validateCourseOutcomes(cos).valid).toBe(true);
    const bad = validateCourseOutcomes([...cos, { coCode: 'CO5', syllabusHours: 0 }]);
    expect(bad.valid).toBe(false);
    expect(bad.errors.join(' ')).toMatch(/CO5 is not allowed/);
    const wrongSum = validateCourseOutcomes(cos.map((c) => ({ ...c, syllabusHours: 5 })));
    expect(wrongSum.valid).toBe(false);
  });

  it('guarantees at least 80% (12 of 14) cells are filled per CO row', () => {
    const empty = buildMatrix(cos);
    // Initially 0 mapped
    for (const row of Object.values(empty)) {
      expect(Object.values(row.mappings).filter((c) => c.level !== null)).toHaveLength(0);
    }
    const filled = enforceMinimumMappingCoverage(empty, 0.8);
    for (const row of Object.values(filled)) {
      const mapped = Object.values(row.mappings).filter((c) => c.level !== null);
      // 12 of 14 = 85.7% >= 80%
      expect(mapped.length).toBeGreaterThanOrEqual(12);
      expect(mapped.length / 14).toBeGreaterThanOrEqual(0.8);
    }
  });

  it('preserves existing mapped cells when enforcing 80% coverage', () => {
    const m = buildMatrix(cos);
    m.CO1.mappings.PO1 = { level: 3, aiSuggestedLevel: 3, rationale: 'custom rationale', status: 'approved' };
    const filled = enforceMinimumMappingCoverage(m, 0.8);
    expect(filled.CO1.mappings.PO1).toMatchObject({
      level: 3,
      rationale: 'custom rationale',
      status: 'approved',
    });
    const mapped = Object.values(filled.CO1.mappings).filter((c) => c.level !== null);
    expect(mapped.length).toBeGreaterThanOrEqual(12);
  });
});
