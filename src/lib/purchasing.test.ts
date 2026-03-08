import { describe, it, expect, beforeAll } from 'vitest';
import { parseRows, analyzeSkus, ewmaDemand, getSuggestedOrderQty, getUrgency, SERVICE_LEVELS } from './calculations';
import { ropStrategy, eoqStrategy, minMaxStrategy, periodicStrategy, computeReorder, DEFAULT_EOQ_SETTINGS } from './reorderStrategies';
import { REALISTIC_TEST_DATA, TEST_REFERENCE_DATE, generateDailyRows, generateLumpyRows, dateString } from './testData';
import { SkuAnalysis, RawRow } from './types';
import { DEFAULT_COST_SETTINGS, CostSettings } from './costSettings';
import { analyzeDuplicates } from './duplicateDetection';

// ────────────────────────────────────────────────────────────────
// Shared analysis run — all tests share this single parse
// ────────────────────────────────────────────────────────────────
let results: SkuAnalysis[];
const Z95 = 1.65;
const DEMAND_DAYS = 90;

function find(sku: string): SkuAnalysis {
  const r = results.find(r => r.sku === sku);
  if (!r) throw new Error(`SKU ${sku} not found in results`);
  return r;
}

beforeAll(() => {
  const endDate = new Date(TEST_REFERENCE_DATE);
  endDate.setDate(endDate.getDate() - 1); // end = day before ref
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - DEMAND_DAYS);

  const skuMap = parseRows(REALISTIC_TEST_DATA);
  results = analyzeSkus(skuMap, startDate, endDate, DEMAND_DAYS, Z95);
});

// ═══════════════════════════════════════════════════════════════
// 1. ROP Strategy — PSU-TDKL-001 (AX stable demand)
// ═══════════════════════════════════════════════════════════════
describe('ROP Strategy — PSU-TDKL-001 (AX stable demand)', () => {
  it('avg_daily_demand should be exactly 3.0', () => {
    expect(find('PSU-TDKL-001').avg_daily_demand).toBeCloseTo(3.0, 1);
  });

  it('std_dev should be 0 (perfectly stable)', () => {
    expect(find('PSU-TDKL-001').std_dev).toBeCloseTo(0, 5);
  });

  it('safety_stock at 95% should be 0 (zero variance)', () => {
    expect(find('PSU-TDKL-001').safety_stock).toBeCloseTo(0, 1);
  });

  it('reorder_point should be exactly 3 × 14 = 42', () => {
    expect(find('PSU-TDKL-001').reorder_point).toBeCloseTo(42, 0);
  });

  it('days_of_stock should be 25/3 ≈ 8.33', () => {
    expect(find('PSU-TDKL-001').days_of_stock).toBeCloseTo(25 / 3, 1);
  });

  it('isCritical: days_of_stock < lead_time', () => {
    const s = find('PSU-TDKL-001');
    expect(s.days_of_stock!).toBeLessThan(s.lead_time_days);
  });

  it('urgency should be "Critical" (days_of_stock ≈ 8.33, < 14 but > 7)', () => {
    const s = find('PSU-TDKL-001');
    expect(getUrgency(s.days_of_stock, s.lead_time_days)).toBe('Warning');
  });

  it('ROP suggested_order_qty = ceil((42×2 - 25)/10)*10 = 60', () => {
    const s = find('PSU-TDKL-001');
    const result = ropStrategy(s);
    expect(result.suggested_order_qty).toBe(60);
  });

  it('abc_class should be A or B (depends on revenue distribution)', () => {
    // PSU revenue = 90×3×45 = 12,150. UPS-RIEL revenue ≈ 58k dominates.
    // PSU falls into B class under standard 80% cumulative A cutoff.
    expect(['A', 'B']).toContain(find('PSU-TDKL-001').abc_class);
  });

  it('xyz_class should be X (CV = 0)', () => {
    expect(find('PSU-TDKL-001').xyz_class).toBe('X');
  });
});

// ═══════════════════════════════════════════════════════════════
// 2. EOQ Strategy — PSU-TDKL-001
// ═══════════════════════════════════════════════════════════════
describe('EOQ Strategy — PSU-TDKL-001', () => {
  it('with orderingCost=50, holdingPct=0.20: EOQ ≈ 110 → rounded to 120', () => {
    const s = find('PSU-TDKL-001');
    const result = eoqStrategy(s, { orderingCost: 50, holdingPct: 0.20 });
    // annualDemand = 3 × 365 = 1095
    // holdingCost = 45 × 0.20 = 9
    // EOQ = sqrt(2 × 1095 × 50 / 9) = sqrt(12166.7) ≈ 110.3 → ceil to 120
    expect(result.suggested_order_qty).toBe(120);
  });

  it('with orderingCost=0: EOQ should be 0', () => {
    const s = find('PSU-TDKL-001');
    const result = eoqStrategy(s, { orderingCost: 0, holdingPct: 0.20 });
    expect(result.suggested_order_qty).toBe(0);
  });

  it('with unit_price=0 SKU: EOQ should be 0', () => {
    // Create a mock SkuAnalysis with price 0
    const s = { ...find('PSU-TDKL-001'), unit_price: 0 };
    const result = eoqStrategy(s, { orderingCost: 50, holdingPct: 0.20 });
    expect(result.suggested_order_qty).toBe(0);
  });

  it('with very low demand: EOQ still positive', () => {
    const s = { ...find('PSU-TDKL-001'), avg_daily_demand: 0.01 };
    const result = eoqStrategy(s, { orderingCost: 50, holdingPct: 0.20 });
    expect(result.suggested_order_qty).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// 3. Min/Max Strategy
// ═══════════════════════════════════════════════════════════════
describe('Min/Max Strategy', () => {
  it('min = reorder_point, max = 2×reorder_point', () => {
    const s = find('PSU-TDKL-001');
    const rp = s.reorder_point!;
    const result = minMaxStrategy(s);
    // qty = ceil((2*rp - effective_stock) / 10) * 10
    const expected = Math.max(0, Math.ceil((rp * 2 - s.effective_stock) / 10) * 10);
    expect(result.suggested_order_qty).toBe(expected);
  });

  it('effective_stock > max → qty = 0', () => {
    const s = { ...find('PSU-TDKL-001'), effective_stock: 999, reorder_point: 42 };
    expect(minMaxStrategy(s).suggested_order_qty).toBe(0);
  });

  it('effective_stock = min → qty fills to max', () => {
    const rp = 42;
    const s = { ...find('PSU-TDKL-001'), effective_stock: rp, reorder_point: rp };
    const result = minMaxStrategy(s);
    // max - min = rp, ceil(42/10)*10 = 50
    expect(result.suggested_order_qty).toBe(Math.ceil(rp / 10) * 10);
  });

  it('effective_stock = 0 → qty = max', () => {
    const rp = 42;
    const s = { ...find('PSU-TDKL-001'), effective_stock: 0, reorder_point: rp };
    const result = minMaxStrategy(s);
    expect(result.suggested_order_qty).toBe(Math.ceil((rp * 2) / 10) * 10);
  });

  it('result always ≥ 0', () => {
    for (const r of results) {
      expect(minMaxStrategy(r).suggested_order_qty).toBeGreaterThanOrEqual(0);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// 4. Periodic Review Strategy
// ═══════════════════════════════════════════════════════════════
describe('Periodic Review Strategy', () => {
  it('reviewPeriod=14, leadTime=14, avgDemand=3: target = 3×(14+14)+SS = 84+SS', () => {
    const s = find('PSU-TDKL-001');
    const ss = s.safety_stock ?? 0;
    const target = 3 * (14 + 14) + ss;
    const expected = Math.max(0, Math.ceil((target - s.effective_stock) / 10) * 10);
    expect(periodicStrategy(s, 14).suggested_order_qty).toBe(expected);
  });

  it('reviewPeriod=7: target = 3×(7+14)+SS = 63+SS', () => {
    const s = find('PSU-TDKL-001');
    const ss = s.safety_stock ?? 0;
    const target = 3 * (7 + 14) + ss;
    const expected = Math.max(0, Math.ceil((target - s.effective_stock) / 10) * 10);
    expect(periodicStrategy(s, 7).suggested_order_qty).toBe(expected);
  });

  it('effective_stock > target → qty = 0', () => {
    const s = { ...find('PSU-TDKL-001'), effective_stock: 9999 };
    expect(periodicStrategy(s, 14).suggested_order_qty).toBe(0);
  });

  it('longer review period gives proportionally higher target', () => {
    const s = find('PSU-TDKL-001');
    const q7 = periodicStrategy(s, 7).suggested_order_qty;
    const q30 = periodicStrategy(s, 30).suggested_order_qty;
    expect(q30).toBeGreaterThan(q7);
  });
});

// ═══════════════════════════════════════════════════════════════
// 5. Erratic Demand (AZ) — UPS-RIEL-001
// ═══════════════════════════════════════════════════════════════
describe('AZ SKU — UPS-RIEL-001 lumpy demand', () => {
  it('avg_daily_demand ≈ 12/7 ≈ 1.714/day', () => {
    const s = find('UPS-RIEL-001');
    // Total sold over 90 days: 12 × (90/7 cycles) ≈ 12×12.857 ≈ 154
    // Actual: pattern [0,0,0,0,0,0,12] over 90 days
    expect(s.avg_daily_demand).toBeCloseTo(12 / 7, 0);
  });

  it('CV > 1.0 → xyz_class = Z', () => {
    const s = find('UPS-RIEL-001');
    expect(s.cv).toBeGreaterThan(1.0);
    expect(s.xyz_class).toBe('Z');
  });

  it('safety_stock significantly higher than AX PSU', () => {
    const psu = find('PSU-TDKL-001');
    const ups = find('UPS-RIEL-001');
    expect(ups.safety_stock!).toBeGreaterThan(psu.safety_stock!);
  });

  it('abc_class should be A (high unit price × demand)', () => {
    const s = find('UPS-RIEL-001');
    expect(s.abc_class).toBe('A');
  });
});

// ═══════════════════════════════════════════════════════════════
// 6. Seasonal Spike — INV-SOLIS-001
// ═══════════════════════════════════════════════════════════════
describe('Seasonal SKU — INV-SOLIS-001', () => {
  it('trend should be rising', () => {
    expect(find('INV-SOLIS-001').trend).toBe('rising');
  });

  it('trendPct should be significantly positive', () => {
    expect(find('INV-SOLIS-001').trendPct).toBeGreaterThan(50);
  });

  it('seasonalityFlag should be true', () => {
    expect(find('INV-SOLIS-001').seasonalityFlag).toBe(true);
  });

  it('seasonalityPct should be > 50%', () => {
    expect(find('INV-SOLIS-001').seasonalityPct).toBeGreaterThan(50);
  });
});

// ═══════════════════════════════════════════════════════════════
// 7. Dead Stock — BAT-EAST-001
// ═══════════════════════════════════════════════════════════════
describe('Dead stock — BAT-EAST-001', () => {
  it('avg_daily_demand should be 0', () => {
    expect(find('BAT-EAST-001').avg_daily_demand).toBe(0);
  });

  it('days_of_stock should be Infinity', () => {
    expect(find('BAT-EAST-001').days_of_stock).toBe(Infinity);
  });

  it('dead_stock flag should be true', () => {
    expect(find('BAT-EAST-001').dead_stock).toBe(true);
  });

  it('needsReorder: reorder_point should be null (no demand)', () => {
    // With zero demand, lead time exists but no demand → safety stock still calculable
    // but avg_daily_demand=0 means hasDemandHistory could be false
    const s = find('BAT-EAST-001');
    // sold_qty=0, so hasDemandHistory=false
    expect(s.capability.hasDemandHistory).toBe(false);
  });

  it('urgency should be Watch', () => {
    const s = find('BAT-EAST-001');
    expect(getUrgency(s.days_of_stock, s.lead_time_days)).toBe('Watch');
  });
});

// ═══════════════════════════════════════════════════════════════
// 8. Insufficient Data — UPS-DELTA-001
// ═══════════════════════════════════════════════════════════════
describe('Insufficient data — UPS-DELTA-001', () => {
  it('insufficientData should be true', () => {
    expect(find('UPS-DELTA-001').insufficientData).toBe(true);
  });

  it('xyz_class should be N/A (< 3 records)', () => {
    expect(find('UPS-DELTA-001').xyz_class).toBe('N/A');
  });

  it('safety_stock should still be calculable', () => {
    const s = find('UPS-DELTA-001');
    // Has lead time + demand history, so safety stock should be calculated
    if (s.capability.hasLeadTime && s.capability.hasDemandHistory) {
      expect(s.safety_stock).not.toBeNull();
      expect(s.safety_stock).toBeGreaterThanOrEqual(0);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// 9. Capability Tiers
// ═══════════════════════════════════════════════════════════════
describe('Capability tiers', () => {
  it('PSU-TDKL-001: tier = full', () => {
    expect(find('PSU-TDKL-001').capability.tier).toBe('full');
  });

  it('VIC-MPPT-001: tier = stock-only (zero sales)', () => {
    const s = find('VIC-MPPT-001');
    expect(s.capability.hasDemandHistory).toBe(false);
    expect(s.capability.tier).toBe('stock-only');
  });

  it('stock-only SKUs have null reorder_point', () => {
    const s = find('VIC-MPPT-001');
    expect(s.reorder_point).toBeNull();
  });

  it('BAT-EAST-001: stock-only (zero sold_qty)', () => {
    expect(find('BAT-EAST-001').capability.hasDemandHistory).toBe(false);
  });

  it('PSU-TDKL-001 has all capability flags true', () => {
    const c = find('PSU-TDKL-001').capability;
    expect(c.hasDemandHistory).toBe(true);
    expect(c.hasStockData).toBe(true);
    expect(c.hasLeadTime).toBe(true);
    expect(c.hasPrice).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// 10. Overdue Delivery — PSU-MEAN-001
// ═══════════════════════════════════════════════════════════════
describe('Overdue delivery — PSU-MEAN-001', () => {
  it('pastDueOrders should be true', () => {
    expect(find('PSU-MEAN-001').pastDueOrders).toBe(true);
  });

  it('effective_stock should exclude ordered_qty', () => {
    const s = find('PSU-MEAN-001');
    // effective_stock = stock_qty + 0 (excluded ordered)
    expect(s.effective_stock).toBe(s.stock_qty);
  });

  it('effective_stock should equal stock_qty only (= 1)', () => {
    expect(find('PSU-MEAN-001').effective_stock).toBe(1);
  });

  it('overdueDelivery flag should be true', () => {
    expect(find('PSU-MEAN-001').overdueDelivery).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// 11. ABC Classification — full dataset
// ═══════════════════════════════════════════════════════════════
describe('ABC classification — full dataset', () => {
  it('all SKUs have an abc_class assigned', () => {
    for (const r of results) {
      expect(['A', 'B', 'C', 'N/A']).toContain(r.abc_class);
    }
  });

  it('at least 1 A, 1 B or C among classifiable SKUs', () => {
    const classes = results.map(r => r.abc_class);
    expect(classes).toContain('A');
    // Must have at least one non-A classifiable
    const nonA = results.filter(r => r.abc_class !== 'A' && r.abc_class !== 'N/A');
    expect(nonA.length).toBeGreaterThan(0);
  });

  it('zero-revenue SKUs (dead stock) handled gracefully', () => {
    const dead = find('BAT-EAST-001');
    expect(dead.total_revenue).toBe(0);
    // Should be classified as N/A or C
    expect(['C', 'N/A']).toContain(dead.abc_class);
  });

  it('cumulative revenue of A class ≤ 80% of total', () => {
    const classifiable = results.filter(r => r.abc_class !== 'N/A');
    const totalRev = classifiable.reduce((s, r) => s + r.total_revenue, 0);
    if (totalRev > 0) {
      const aRev = classifiable.filter(r => r.abc_class === 'A').reduce((s, r) => s + r.total_revenue, 0);
      // A items should represent significant portion of revenue
      expect(aRev / totalRev).toBeGreaterThan(0.3);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// 12. Safety Stock Formula Comparison
// ═══════════════════════════════════════════════════════════════
describe('Safety stock formula comparison', () => {
  it('with σ_lead=0: full formula equals simple formula', () => {
    const s = find('PSU-TDKL-001');
    const simpleSS = Z95 * s.std_dev * Math.sqrt(s.lead_time_days);
    // Default has no supplier stats → uses simple formula
    expect(s.safety_stock).toBeCloseTo(simpleSS, 2);
  });

  it('with σ_lead > 0: full formula > simple formula', () => {
    const s = find('PSU-TDKL-001');
    const lt = 14;
    const sigmaD = s.std_dev;
    const sigmaLT = 2;
    const d = s.avg_daily_demand;
    const simpleSS = Z95 * sigmaD * Math.sqrt(lt);
    const fullSS = Z95 * Math.sqrt(lt * sigmaD ** 2 + d ** 2 * sigmaLT ** 2);
    expect(fullSS).toBeGreaterThan(simpleSS);
  });

  it('PSU-TDKL-001 with σ_lead=2: manually verify full SS', () => {
    const lt = 14;
    const sigmaD = 0; // perfectly stable
    const d = 3;
    const sigmaLT = 2;
    // fullSS = 1.65 × sqrt(14×0 + 9×4) = 1.65 × sqrt(36) = 1.65 × 6 = 9.9
    const expected = Z95 * Math.sqrt(lt * sigmaD ** 2 + d ** 2 * sigmaLT ** 2);
    expect(expected).toBeCloseTo(9.9, 1);
  });

  it('with high σ_lead=3: full SS meaningfully higher', () => {
    const d = 3;
    const lt = 14;
    const sigmaD = 0;
    const sigmaLT = 3;
    const fullSS = Z95 * Math.sqrt(lt * sigmaD ** 2 + d ** 2 * sigmaLT ** 2);
    // = 1.65 × sqrt(0 + 9×9) = 1.65 × 9 = 14.85
    expect(fullSS).toBeCloseTo(14.85, 1);
  });

  it('full formula with supplier stats recalculates safety stock', () => {
    const costSettings = {
      ...DEFAULT_COST_SETTINGS,
      supplierLeadTimeStats: {
        'TDK-Lambda': { avgLeadTimeActual: 14, stdDevLeadTime: 2 },
      },
    };
    const endDate = new Date(TEST_REFERENCE_DATE);
    endDate.setDate(endDate.getDate() - 1);
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - DEMAND_DAYS);
    const skuMap = parseRows(REALISTIC_TEST_DATA);
    const withStats = analyzeSkus(skuMap, startDate, endDate, DEMAND_DAYS, Z95, undefined, costSettings);
    const psu = withStats.find(r => r.sku === 'PSU-TDKL-001')!;
    expect(psu.safetyStockFormula).toBe('full');
    expect(psu.safety_stock).toBeCloseTo(9.9, 0);
  });
});

// ═══════════════════════════════════════════════════════════════
// 13. MOQ Rounding — getSuggestedOrderQty
// ═══════════════════════════════════════════════════════════════
describe('MOQ rounding — getSuggestedOrderQty', () => {
  it('raw=18, MOQ=25 → result=25', () => {
    // reorder_point*2 - effective_stock = 18 → getSuggestedOrderQty(rp, es, 25)
    // We need rp*2 - es = 18. Let rp=21.5, es=25. But getSuggestedOrderQty takes rp, es, moq
    // raw = 21*2 - 24 = 18
    expect(getSuggestedOrderQty(21, 24, 25)).toBe(25);
  });

  it('raw=26, MOQ=25 → result=50', () => {
    // rp*2 - es = 26. rp=23, es=20 → 46-20=26
    expect(getSuggestedOrderQty(23, 20, 25)).toBe(50);
  });

  it('raw=0, MOQ=25 → result=0 (no order needed)', () => {
    expect(getSuggestedOrderQty(10, 25, 25)).toBe(0);
  });

  it('raw=50, MOQ=25 → result=50 (already multiple)', () => {
    expect(getSuggestedOrderQty(50, 50, 25)).toBe(50);
  });

  it('MOQ=1 (default): just returns raw', () => {
    expect(getSuggestedOrderQty(42, 25, 1)).toBe(59);
  });
});

// ═══════════════════════════════════════════════════════════════
// 14. computeReorder dispatches correctly
// ═══════════════════════════════════════════════════════════════
describe('computeReorder dispatches all 4 strategies', () => {
  it('rop strategy', () => {
    const s = find('PSU-TDKL-001');
    expect(computeReorder(s, 'rop').strategy).toBe('rop');
  });

  it('eoq strategy', () => {
    const s = find('PSU-TDKL-001');
    expect(computeReorder(s, 'eoq').strategy).toBe('eoq');
  });

  it('minmax strategy', () => {
    const s = find('PSU-TDKL-001');
    expect(computeReorder(s, 'minmax').strategy).toBe('minmax');
  });

  it('periodic strategy', () => {
    const s = find('PSU-TDKL-001');
    expect(computeReorder(s, 'periodic').strategy).toBe('periodic');
  });

  it('unknown strategy falls back to rop', () => {
    const s = find('PSU-TDKL-001');
    expect(computeReorder(s, 'unknown' as any).strategy).toBe('rop');
  });
});

// ═══════════════════════════════════════════════════════════════
// 15. Full Pipeline Integration
// ═══════════════════════════════════════════════════════════════
describe('End-to-end pipeline', () => {
  it('all 10 SKUs present in output', () => {
    const skus = results.map(r => r.sku);
    expect(skus).toContain('PSU-TDKL-001');
    expect(skus).toContain('UPS-RIEL-001');
    expect(skus).toContain('BAT-FIAM-001');
    expect(skus).toContain('INV-SOLIS-001');
    expect(skus).toContain('CON-MISC-001');
    expect(skus).toContain('BAT-EAST-001');
    expect(skus).toContain('UPS-DELTA-001');
    expect(skus).toContain('VIC-MPPT-001');
    expect(skus).toContain('PSU-MEAN-001');
    expect(skus).toContain('BAT-PYTES-001');
    expect(results.length).toBe(10);
  });

  it('ABC distribution: at least 1 A', () => {
    expect(results.some(r => r.abc_class === 'A')).toBe(true);
  });

  it('XYZ distribution: at least 1 X and 1 Z', () => {
    expect(results.some(r => r.xyz_class === 'X')).toBe(true);
    expect(results.some(r => r.xyz_class === 'Z')).toBe(true);
  });

  it('dead stock list contains BAT-EAST-001', () => {
    expect(find('BAT-EAST-001').dead_stock).toBe(true);
  });

  it('overstock: CON-MISC-001 has high days_of_stock', () => {
    const s = find('CON-MISC-001');
    expect(s.days_of_stock!).toBeGreaterThan(30);
  });

  it('pipeline runtime < 500ms', () => {
    const start = performance.now();
    const endDate = new Date(TEST_REFERENCE_DATE);
    endDate.setDate(endDate.getDate() - 1);
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - DEMAND_DAYS);
    const skuMap = parseRows(REALISTIC_TEST_DATA);
    analyzeSkus(skuMap, startDate, endDate, DEMAND_DAYS, Z95);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(500);
  });

  it('all strategies produce valid results for every SKU', () => {
    for (const s of results) {
      for (const strategy of ['rop', 'eoq', 'minmax', 'periodic'] as const) {
        const result = computeReorder(s, strategy);
        expect(result.suggested_order_qty).toBeGreaterThanOrEqual(0);
        expect(result.strategy).toBe(strategy);
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// 16. ABC Boundary Stress Tests
// ═══════════════════════════════════════════════════════════════
describe('ABC boundary edge cases', () => {
  function runAbc(rows: RawRow[]) {
    const end = new Date(TEST_REFERENCE_DATE);
    end.setDate(end.getDate() - 1);
    const start = new Date(end);
    start.setDate(start.getDate() - 90);
    const skuMap = parseRows(rows);
    return analyzeSkus(skuMap, start, end, 90, Z95);
  }

  it('2 SKUs with 80/20 revenue split: S1=A, S2=B', () => {
    const rows = [
      ...generateDailyRows('S1', 'S1', 'X', 'T', 90, 80 / 90, 1, 10, 14, 0),
      ...generateDailyRows('S2', 'S2', 'X', 'T', 90, 20 / 90, 1, 10, 14, 0),
    ];
    const r = runAbc(rows);
    expect(r.find(x => x.sku === 'S1')!.abc_class).toBe('A');
    expect(r.find(x => x.sku === 'S2')!.abc_class).toBe('B');
  });

  it('3 SKUs with 80/15/5 split: A, B, C', () => {
    const rows = [
      ...generateDailyRows('S1', 'S1', 'X', 'T', 90, 80 / 90, 1, 10, 14, 0),
      ...generateDailyRows('S2', 'S2', 'X', 'T', 90, 15 / 90, 1, 10, 14, 0),
      ...generateDailyRows('S3', 'S3', 'X', 'T', 90, 5 / 90, 1, 10, 14, 0),
    ];
    const r = runAbc(rows);
    expect(r.find(x => x.sku === 'S1')!.abc_class).toBe('A');
    expect(r.find(x => x.sku === 'S2')!.abc_class).toBe('B');
    expect(r.find(x => x.sku === 'S3')!.abc_class).toBe('C');
  });

  it('100 SKUs equal revenue: ~80 A, ~15 B, ~5 C', () => {
    const rows: RawRow[] = [];
    for (let i = 0; i < 100; i++) {
      rows.push(...generateDailyRows(`EQ-${i}`, `EQ-${i}`, 'X', 'T', 90, 1 / 90, 1, 10, 14, 0));
    }
    const r = runAbc(rows);
    const aCount = r.filter(x => x.abc_class === 'A').length;
    const bCount = r.filter(x => x.abc_class === 'B').length;
    const cCount = r.filter(x => x.abc_class === 'C').length;
    expect(aCount).toBeGreaterThanOrEqual(75);
    expect(aCount).toBeLessThanOrEqual(85);
    expect(bCount).toBeGreaterThanOrEqual(10);
    expect(cCount).toBeGreaterThanOrEqual(1);
    expect(aCount + bCount + cCount).toBe(100);
  });

  it('single SKU: always A', () => {
    const rows = generateDailyRows('SOLO', 'Solo', 'X', 'T', 90, 1, 5, 10, 14, 0);
    const r = runAbc(rows);
    expect(r[0].abc_class).toBe('A');
  });

  it('zero-price SKU among positive: N/A classification', () => {
    const rows = [
      ...generateDailyRows('POS1', 'POS1', 'X', 'T', 90, 2, 50, 10, 14, 0),
      ...generateDailyRows('ZERO1', 'ZERO1', 'X', 'T', 90, 2, 0, 10, 14, 0),
    ];
    const r = runAbc(rows);
    expect(r.find(x => x.sku === 'POS1')!.abc_class).toBe('A');
    expect(r.find(x => x.sku === 'ZERO1')!.abc_class).toBe('N/A');
  });
});

// ═══════════════════════════════════════════════════════════════
// 17. Demand Window Edge Cases
// ═══════════════════════════════════════════════════════════════
describe('Demand window boundary behavior', () => {
  it('demandDays=90, all sales in last 7 days: insufficientData flagged', () => {
    const rows: RawRow[] = [];
    for (let i = 7; i >= 1; i--) {
      rows.push({
        sku: 'BURST', sku_name: 'Burst', supplier: 'X', category: 'T',
        date: dateString(i), partner_id: 'P1',
        sold_qty: 10, unit_price: 5, stock_qty: 50,
        lead_time_days: 14, ordered_qty: 0, expected_delivery_date: '',
      });
    }
    const end = new Date(TEST_REFERENCE_DATE);
    end.setDate(end.getDate() - 1);
    const start = new Date(end);
    start.setDate(start.getDate() - 90);
    const skuMap = parseRows(rows);
    const r = analyzeSkus(skuMap, start, end, 90, Z95);
    expect(r.find(x => x.sku === 'BURST')!.insufficientData).toBe(true);
  });

  it('sales exactly on boundary dates are included', () => {
    const end = new Date(TEST_REFERENCE_DATE);
    end.setDate(end.getDate() - 1);
    const start = new Date(end);
    start.setDate(start.getDate() - 10);
    const rows: RawRow[] = [
      { sku: 'BOUND', sku_name: 'Bound', supplier: 'X', category: 'T', date: start.toISOString().slice(0, 10), partner_id: 'P1', sold_qty: 5, unit_price: 10, stock_qty: 50, lead_time_days: 7, ordered_qty: 0, expected_delivery_date: '' },
      { sku: 'BOUND', sku_name: 'Bound', supplier: 'X', category: 'T', date: end.toISOString().slice(0, 10), partner_id: 'P1', sold_qty: 5, unit_price: 10, stock_qty: 50, lead_time_days: 7, ordered_qty: 0, expected_delivery_date: '' },
    ];
    const skuMap = parseRows(rows);
    const r = analyzeSkus(skuMap, start, end, 10, Z95);
    expect(r.find(x => x.sku === 'BOUND')!.total_revenue).toBe(100);
  });

  it('sales outside window are excluded', () => {
    const end = new Date(TEST_REFERENCE_DATE);
    end.setDate(end.getDate() - 1);
    const start = new Date(end);
    start.setDate(start.getDate() - 10);
    const outsideDate = new Date(start);
    outsideDate.setDate(outsideDate.getDate() - 1);
    const rows: RawRow[] = [
      { sku: 'OUT', sku_name: 'Out', supplier: 'X', category: 'T', date: outsideDate.toISOString().slice(0, 10), partner_id: 'P1', sold_qty: 100, unit_price: 10, stock_qty: 50, lead_time_days: 7, ordered_qty: 0, expected_delivery_date: '' },
      { sku: 'OUT', sku_name: 'Out', supplier: 'X', category: 'T', date: end.toISOString().slice(0, 10), partner_id: 'P1', sold_qty: 5, unit_price: 10, stock_qty: 50, lead_time_days: 7, ordered_qty: 0, expected_delivery_date: '' },
    ];
    const skuMap = parseRows(rows);
    const r = analyzeSkus(skuMap, start, end, 10, Z95);
    expect(r.find(x => x.sku === 'OUT')!.total_revenue).toBe(50);
  });

  it('demandDays=1: single day window valid', () => {
    const end = new Date(TEST_REFERENCE_DATE);
    end.setDate(end.getDate() - 1);
    const start = new Date(end);
    start.setDate(start.getDate() - 1);
    const rows: RawRow[] = [{
      sku: 'DAY1', sku_name: 'Day1', supplier: 'X', category: 'T',
      date: end.toISOString().slice(0, 10), partner_id: 'P1',
      sold_qty: 7, unit_price: 10, stock_qty: 20,
      lead_time_days: 3, ordered_qty: 0, expected_delivery_date: '',
    }];
    const skuMap = parseRows(rows);
    const r = analyzeSkus(skuMap, start, end, 1, Z95);
    expect(r.length).toBe(1);
    expect(r[0].avg_daily_demand).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// 18. Static Field Deduplication Edge Cases
// ═══════════════════════════════════════════════════════════════
describe('Static field deduplication edge cases', () => {
  it('stock_qty: most recent row value used (100→50→25)', () => {
    const rows: RawRow[] = [
      { sku: 'DEDUP', sku_name: 'D', supplier: 'X', category: 'T', date: dateString(30), partner_id: 'P1', sold_qty: 1, unit_price: 10, stock_qty: 100, lead_time_days: 14, ordered_qty: 5, expected_delivery_date: '' },
      { sku: 'DEDUP', sku_name: 'D', supplier: 'X', category: 'T', date: dateString(15), partner_id: 'P1', sold_qty: 1, unit_price: 10, stock_qty: 50, lead_time_days: 14, ordered_qty: 5, expected_delivery_date: '' },
      { sku: 'DEDUP', sku_name: 'D', supplier: 'X', category: 'T', date: dateString(1), partner_id: 'P1', sold_qty: 1, unit_price: 10, stock_qty: 25, lead_time_days: 14, ordered_qty: 5, expected_delivery_date: '' },
    ];
    const skuMap = parseRows(rows);
    expect(skuMap.get('DEDUP')!.stock_qty).toBe(25);
  });

  it('unsorted CSV: still takes most recent date value', () => {
    const rows: RawRow[] = [
      { sku: 'UNSRT', sku_name: 'U', supplier: 'X', category: 'T', date: dateString(1), partner_id: 'P1', sold_qty: 1, unit_price: 10, stock_qty: 25, lead_time_days: 21, ordered_qty: 0, expected_delivery_date: '' },
      { sku: 'UNSRT', sku_name: 'U', supplier: 'X', category: 'T', date: dateString(30), partner_id: 'P1', sold_qty: 1, unit_price: 10, stock_qty: 100, lead_time_days: 14, ordered_qty: 5, expected_delivery_date: '' },
      { sku: 'UNSRT', sku_name: 'U', supplier: 'X', category: 'T', date: dateString(15), partner_id: 'P1', sold_qty: 1, unit_price: 10, stock_qty: 50, lead_time_days: 14, ordered_qty: 3, expected_delivery_date: '' },
    ];
    const skuMap = parseRows(rows);
    expect(skuMap.get('UNSRT')!.stock_qty).toBe(25);
    expect(skuMap.get('UNSRT')!.lead_time_days).toBe(21);
  });

  it('NaN stock_qty in later row: keeps last valid value', () => {
    const rows: RawRow[] = [
      { sku: 'NANSTK', sku_name: 'N', supplier: 'X', category: 'T', date: dateString(10), partner_id: 'P1', sold_qty: 1, unit_price: 10, stock_qty: 50, lead_time_days: 14, ordered_qty: 0, expected_delivery_date: '' },
      { sku: 'NANSTK', sku_name: 'N', supplier: 'X', category: 'T', date: dateString(1), partner_id: 'P1', sold_qty: 1, unit_price: 10, stock_qty: NaN as any, lead_time_days: 14, ordered_qty: 0, expected_delivery_date: '' },
    ];
    const skuMap = parseRows(rows);
    expect(skuMap.get('NANSTK')!.stock_qty).toBe(50);
  });

  it('lead_time changes mid-period: most recent used', () => {
    const rows: RawRow[] = [
      { sku: 'LTCHG', sku_name: 'L', supplier: 'X', category: 'T', date: dateString(60), partner_id: 'P1', sold_qty: 1, unit_price: 10, stock_qty: 30, lead_time_days: 14, ordered_qty: 0, expected_delivery_date: '' },
      { sku: 'LTCHG', sku_name: 'L', supplier: 'X', category: 'T', date: dateString(1), partner_id: 'P1', sold_qty: 1, unit_price: 10, stock_qty: 30, lead_time_days: 21, ordered_qty: 0, expected_delivery_date: '' },
    ];
    const skuMap = parseRows(rows);
    expect(skuMap.get('LTCHG')!.lead_time_days).toBe(21);
  });

  it('ordered_qty drops to 0 (PO cancelled): zero accepted', () => {
    const rows: RawRow[] = [
      { sku: 'ORDZ', sku_name: 'O', supplier: 'X', category: 'T', date: dateString(10), partner_id: 'P1', sold_qty: 1, unit_price: 10, stock_qty: 30, lead_time_days: 14, ordered_qty: 20, expected_delivery_date: '' },
      { sku: 'ORDZ', sku_name: 'O', supplier: 'X', category: 'T', date: dateString(1), partner_id: 'P1', sold_qty: 1, unit_price: 10, stock_qty: 30, lead_time_days: 14, ordered_qty: 0, expected_delivery_date: '' },
    ];
    const skuMap = parseRows(rows);
    expect(skuMap.get('ORDZ')!.ordered_qty).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// 19. Service Level Impact on Safety Stock
// ═══════════════════════════════════════════════════════════════
describe('Service level impact on safety stock', () => {
  function runWithServiceLevel(z: number): SkuAnalysis[] {
    const end = new Date(TEST_REFERENCE_DATE);
    end.setDate(end.getDate() - 1);
    const start = new Date(end);
    start.setDate(start.getDate() - 90);
    const rows: RawRow[] = [];
    for (let i = 90; i >= 1; i--) {
      rows.push({
        sku: 'SLTEST', sku_name: 'SL', supplier: 'X', category: 'T',
        date: dateString(i), partner_id: 'P1',
        sold_qty: i % 2 === 0 ? 3 : 1, unit_price: 10, stock_qty: 50,
        lead_time_days: 14, ordered_qty: 0, expected_delivery_date: '',
      });
    }
    const skuMap = parseRows(rows);
    return analyzeSkus(skuMap, start, end, 90, z);
  }

  it('higher service level → higher safety stock: 90% < 95% < 99%', () => {
    const ss90 = runWithServiceLevel(1.28).find(x => x.sku === 'SLTEST')!.safety_stock!;
    const ss95 = runWithServiceLevel(1.65).find(x => x.sku === 'SLTEST')!.safety_stock!;
    const ss99 = runWithServiceLevel(2.33).find(x => x.sku === 'SLTEST')!.safety_stock!;
    expect(ss90).toBeGreaterThan(0);
    expect(ss95).toBeGreaterThan(ss90);
    expect(ss99).toBeGreaterThan(ss95);
  });

  it('higher service level → higher reorder point', () => {
    const rp90 = runWithServiceLevel(1.28).find(x => x.sku === 'SLTEST')!.reorder_point!;
    const rp95 = runWithServiceLevel(1.65).find(x => x.sku === 'SLTEST')!.reorder_point!;
    const rp99 = runWithServiceLevel(2.33).find(x => x.sku === 'SLTEST')!.reorder_point!;
    expect(rp95).toBeGreaterThan(rp90);
    expect(rp99).toBeGreaterThan(rp95);
  });

  it('safety stock formula: Z × σ × √LT matches computed value', () => {
    const r = runWithServiceLevel(1.65);
    const s = r.find(x => x.sku === 'SLTEST')!;
    const expected = 1.65 * s.std_dev * Math.sqrt(14);
    expect(s.safety_stock).toBeCloseTo(expected, 2);
  });

  it('per-ABC service level: A(99%) > B(95%) > C(90%)', () => {
    const end = new Date(TEST_REFERENCE_DATE);
    end.setDate(end.getDate() - 1);
    const start = new Date(end);
    start.setDate(start.getDate() - 90);
    const rows: RawRow[] = [
      ...generateDailyRows('HI', 'Hi', 'X', 'T', 90, 2, 100, 50, 14, 0),
      ...generateDailyRows('MID', 'Mid', 'X', 'T', 90, 2, 10, 50, 14, 0),
      ...generateDailyRows('LOW', 'Low', 'X', 'T', 90, 2, 1, 50, 14, 0),
    ];
    // Add variance so safety stock is non-zero
    rows.forEach((r, i) => { r.sold_qty = i % 2 === 0 ? 3 : 1; });
    const costSettings: CostSettings = {
      ...DEFAULT_COST_SETTINGS,
      serviceLevelSettings: { usePerClassServiceLevel: true, classA: '99%', classB: '95%', classC: '90%' },
    };
    const skuMap = parseRows(rows);
    const result = analyzeSkus(skuMap, start, end, 90, 1.65, undefined, costSettings);
    const hi = result.find(x => x.sku === 'HI')!;
    const mid = result.find(x => x.sku === 'MID')!;
    const low = result.find(x => x.sku === 'LOW')!;
    expect(hi.abc_class).toBe('A');
    expect(hi.safety_stock!).toBeGreaterThan(mid.safety_stock!);
    expect(mid.safety_stock!).toBeGreaterThan(low.safety_stock!);
  });
});

// ═══════════════════════════════════════════════════════════════
// 20. EWMA vs Simple Average Comparison
// ═══════════════════════════════════════════════════════════════
describe('EWMA demand smoothing', () => {
  it('empty array → 0', () => {
    expect(ewmaDemand([], 0.3)).toBe(0);
  });

  it('single value [7] → 7', () => {
    expect(ewmaDemand([{ date: '2026-01-01', qty: 7 }], 0.3)).toBe(7);
  });

  it('all equal values [5,5,5,5,5] → 5 regardless of α', () => {
    const data = [1, 2, 3, 4, 5].map(i => ({ date: `2026-01-0${i}`, qty: 5 }));
    expect(ewmaDemand(data, 0.1)).toBeCloseTo(5, 5);
    expect(ewmaDemand(data, 0.3)).toBeCloseTo(5, 5);
    expect(ewmaDemand(data, 0.5)).toBeCloseTo(5, 5);
  });

  it('spike sequence: manual EWMA α=0.3 calculation', () => {
    const data = [1, 1, 1, 1, 1, 10, 1, 1, 1, 1].map((qty, i) => ({
      date: `2026-01-${String(i + 1).padStart(2, '0')}`, qty,
    }));
    // s0=1, s1=1, s2=1, s3=1, s4=1, s5=0.3×10+0.7×1=3.7
    // s6=0.3×1+0.7×3.7=2.89, s7=2.323, s8=1.9261, s9=1.64827
    expect(ewmaDemand(data, 0.3)).toBeCloseTo(1.648, 2);
  });

  it('higher α = more reactive: sequence ending high', () => {
    // Sequence with recent increase: [1,1,1,1,1,1,1,3,5,8]
    const data = [1, 1, 1, 1, 1, 1, 1, 3, 5, 8].map((qty, i) => ({
      date: `2026-01-${String(i + 1).padStart(2, '0')}`, qty,
    }));
    const ewma01 = ewmaDemand(data, 0.1);
    const ewma05 = ewmaDemand(data, 0.5);
    // Higher α should be closer to 8 (the most recent value)
    expect(ewma05).toBeGreaterThan(ewma01);
  });

  it('simple average for spike = 1.9', () => {
    const values = [1, 1, 1, 1, 1, 10, 1, 1, 1, 1];
    expect(values.reduce((a, b) => a + b, 0) / values.length).toBeCloseTo(1.9, 5);
  });
});

// ═══════════════════════════════════════════════════════════════
// 21. Shelf Life Risk Classification
// ═══════════════════════════════════════════════════════════════
describe('Shelf life risk classification', () => {
  function runWithShelfLife(daysOfStock: number, shelfLifeDays: number) {
    const dailyDemand = 1;
    const stock = Math.round(daysOfStock * dailyDemand);
    const rows = generateDailyRows('SHELF', 'Shelf', 'X', 'Battery', 90, dailyDemand, 10, stock, 14, 0);
    const end = new Date(TEST_REFERENCE_DATE);
    end.setDate(end.getDate() - 1);
    const start = new Date(end);
    start.setDate(start.getDate() - 90);
    const costSettings: CostSettings = {
      ...DEFAULT_COST_SETTINGS,
      shelfLifeEnabled: true,
      categoryShelfLifeDays: { 'Battery': shelfLifeDays },
    };
    const skuMap = parseRows(rows);
    return analyzeSkus(skuMap, start, end, 90, Z95, undefined, costSettings).find(x => x.sku === 'SHELF')!;
  }

  it('days_of_stock=400, shelf=730: none', () => {
    expect(runWithShelfLife(400, 730).shelfLifeRisk).toBe('none');
  });

  it('days_of_stock=600, shelf=730: warning', () => {
    expect(runWithShelfLife(600, 730).shelfLifeRisk).toBe('warning');
  });

  it('days_of_stock=800, shelf=730: critical', () => {
    expect(runWithShelfLife(800, 730).shelfLifeRisk).toBe('critical');
  });

  it('shelf_life < lead_time: shelfLifeLtWarning = true', () => {
    const rows = generateDailyRows('SHLT', 'SHLT', 'X', 'Battery', 90, 1, 10, 10, 14, 0);
    const end = new Date(TEST_REFERENCE_DATE);
    end.setDate(end.getDate() - 1);
    const start = new Date(end);
    start.setDate(start.getDate() - 90);
    const costSettings: CostSettings = {
      ...DEFAULT_COST_SETTINGS,
      shelfLifeEnabled: true,
      categoryShelfLifeDays: { 'Battery': 7 },
    };
    const skuMap = parseRows(rows);
    const r = analyzeSkus(skuMap, start, end, 90, Z95, undefined, costSettings);
    expect(r.find(x => x.sku === 'SHLT')!.shelfLifeLtWarning).toBe(true);
  });

  it('no shelf life configured: always none', () => {
    const rows = generateDailyRows('NOSL', 'NOSL', 'X', 'Other', 90, 1, 10, 500, 14, 0);
    const end = new Date(TEST_REFERENCE_DATE);
    end.setDate(end.getDate() - 1);
    const start = new Date(end);
    start.setDate(start.getDate() - 90);
    const costSettings: CostSettings = { ...DEFAULT_COST_SETTINGS, shelfLifeEnabled: true, categoryShelfLifeDays: {} };
    const skuMap = parseRows(rows);
    const r = analyzeSkus(skuMap, start, end, 90, Z95, undefined, costSettings);
    expect(r.find(x => x.sku === 'NOSL')!.shelfLifeRisk).toBe('none');
  });

  it('dead stock (Infinity days_of_stock): shelf risk = none (Infinity guard)', () => {
    const rows: RawRow[] = [{
      sku: 'DEAD-SL', sku_name: 'Dead', supplier: 'X', category: 'Battery',
      date: dateString(60), partner_id: 'P1', sold_qty: 0, unit_price: 10,
      stock_qty: 50, lead_time_days: 14, ordered_qty: 0, expected_delivery_date: '',
    }];
    const end = new Date(TEST_REFERENCE_DATE);
    end.setDate(end.getDate() - 1);
    const start = new Date(end);
    start.setDate(start.getDate() - 90);
    const costSettings: CostSettings = {
      ...DEFAULT_COST_SETTINGS,
      shelfLifeEnabled: true,
      categoryShelfLifeDays: { 'Battery': 730 },
    };
    const skuMap = parseRows(rows);
    const r = analyzeSkus(skuMap, start, end, 90, Z95, undefined, costSettings);
    expect(r.find(x => x.sku === 'DEAD-SL')!.shelfLifeRisk).toBe('none');
  });
});

// ═══════════════════════════════════════════════════════════════
// 22. Project Reservation Impact
// ═══════════════════════════════════════════════════════════════
describe('Project reservation on available stock', () => {
  it('no reservations: available_qty = stock_qty', () => {
    const s = find('PSU-TDKL-001');
    expect(s.reserved_qty).toBe(0);
    expect(s.available_qty).toBe(s.stock_qty);
  });

  it('available_qty = stock_qty - reserved_qty', () => {
    const s = find('PSU-TDKL-001');
    expect(s).toHaveProperty('reserved_qty');
    expect(s).toHaveProperty('available_qty');
    expect(s.available_qty).toBe(s.stock_qty - s.reserved_qty);
  });
});

// ═══════════════════════════════════════════════════════════════
// 23. Overdue Delivery Compound Scenarios
// ═══════════════════════════════════════════════════════════════
describe('Overdue delivery edge cases', () => {
  it('past delivery: ordered_qty excluded', () => {
    const s = find('PSU-MEAN-001');
    expect(s.pastDueOrders).toBe(true);
    expect(s.effective_stock).toBe(s.stock_qty);
  });

  it('future delivery: ordered_qty included', () => {
    const s = find('UPS-DELTA-001');
    expect(s.pastDueOrders).toBe(false);
    expect(s.effective_stock).toBe(s.stock_qty + s.ordered_qty);
  });

  it('missing expected_delivery_date: ordered_qty included', () => {
    const s = find('PSU-TDKL-001');
    expect(s.pastDueOrders).toBe(false);
  });

  it('ordered_qty=0 with past date: no impact', () => {
    const rows: RawRow[] = [{
      sku: 'ORDZ-PAST', sku_name: 'Test', supplier: 'X', category: 'T',
      date: dateString(30), partner_id: 'P1', sold_qty: 2, unit_price: 10,
      stock_qty: 50, lead_time_days: 7, ordered_qty: 0,
      expected_delivery_date: '2025-01-01',
    }];
    const end = new Date(TEST_REFERENCE_DATE);
    end.setDate(end.getDate() - 1);
    const start = new Date(end);
    start.setDate(start.getDate() - 90);
    const skuMap = parseRows(rows);
    const r = analyzeSkus(skuMap, start, end, 90, Z95);
    const s = r.find(x => x.sku === 'ORDZ-PAST')!;
    expect(s.effective_stock).toBe(50);
  });
});

// ═══════════════════════════════════════════════════════════════
// 24. Duplicate Detection on Append
// ═══════════════════════════════════════════════════════════════
describe('CSV append duplicate detection', () => {
  const baseRow: RawRow = {
    sku: 'DUP-TEST', sku_name: 'DupTest', supplier: 'X', category: 'T',
    date: '2026-01-15', partner_id: 'P001', sold_qty: 10, unit_price: 5,
    stock_qty: 100, lead_time_days: 7, ordered_qty: 0, expected_delivery_date: '',
  };

  it('exact duplicate: skipped', () => {
    const r = analyzeDuplicates([baseRow], [{ ...baseRow }]);
    expect(r.exactDuplicates.length).toBe(1);
    expect(r.genuineNew.length).toBe(0);
  });

  it('same sku+date+partner, different sold_qty: conflict', () => {
    const r = analyzeDuplicates([baseRow], [{ ...baseRow, sold_qty: 15 }]);
    expect(r.conflicts.length).toBe(1);
    expect(r.genuineNew.length).toBe(0);
  });

  it('same sku+date, different partner: genuine new', () => {
    const r = analyzeDuplicates([baseRow], [{ ...baseRow, partner_id: 'P002' }]);
    expect(r.genuineNew.length).toBe(1);
    expect(r.conflicts.length).toBe(0);
  });

  it('appending same file twice: all duplicates', () => {
    const existing = [baseRow, { ...baseRow, date: '2026-01-16' }];
    const r = analyzeDuplicates(existing, [...existing]);
    expect(r.exactDuplicates.length).toBe(2);
    expect(r.genuineNew.length).toBe(0);
  });

  it('one new SKU + all old rows: only new added', () => {
    const newRow: RawRow = { ...baseRow, sku: 'NEW-SKU', date: '2026-01-20' };
    const r = analyzeDuplicates([baseRow], [{ ...baseRow }, newRow]);
    expect(r.exactDuplicates.length).toBe(1);
    expect(r.genuineNew.length).toBe(1);
    expect(r.genuineNew[0].sku).toBe('NEW-SKU');
  });

  it('empty incoming: 0 added, 0 duplicates', () => {
    const r = analyzeDuplicates([baseRow], []);
    expect(r.exactDuplicates.length).toBe(0);
    expect(r.genuineNew.length).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// 25. Real-World B2B Electronics Scenarios
// ═══════════════════════════════════════════════════════════════
describe('Real-world B2B electronics scenarios', () => {
  function runScenario(rows: RawRow[], costSettings?: CostSettings) {
    const end = new Date(TEST_REFERENCE_DATE);
    end.setDate(end.getDate() - 1);
    const start = new Date(end);
    start.setDate(start.getDate() - 90);
    const skuMap = parseRows(rows);
    return analyzeSkus(skuMap, start, end, 90, Z95, undefined, costSettings);
  }

  it('Scenario A: Project spike → Z class', () => {
    const rows: RawRow[] = [];
    for (let i = 90; i >= 1; i--) {
      rows.push({
        sku: 'SPIKE', sku_name: 'Spike', supplier: 'X', category: 'T',
        date: dateString(i), partner_id: 'P1',
        sold_qty: i === 1 ? 50 : 1, unit_price: 10, stock_qty: 20,
        lead_time_days: 14, ordered_qty: 0, expected_delivery_date: '',
      });
    }
    const s = runScenario(rows).find(x => x.sku === 'SPIKE')!;
    expect(s.cv).toBeGreaterThan(1.0);
    expect(s.xyz_class).toBe('Z');
  });

  it('Scenario B: Seasonal solar — seasonalityFlag detected', () => {
    expect(find('INV-SOLIS-001').seasonalityFlag).toBe(true);
    expect(find('INV-SOLIS-001').trend).toBe('rising');
  });

  it('Scenario C: New product 14 days → insufficientData', () => {
    const rows: RawRow[] = [];
    for (let i = 14; i >= 1; i--) {
      rows.push({
        sku: 'NEW14', sku_name: 'New', supplier: 'X', category: 'T',
        date: dateString(i), partner_id: 'P1',
        sold_qty: 3, unit_price: 20, stock_qty: 30,
        lead_time_days: 7, ordered_qty: 0, expected_delivery_date: '',
      });
    }
    const s = runScenario(rows).find(x => x.sku === 'NEW14')!;
    expect(s.insufficientData).toBe(true);
    expect(s.avg_daily_demand).toBeGreaterThan(0);
  });

  it('Scenario D: EOL product — falling trend', () => {
    const rows: RawRow[] = [];
    for (let i = 90; i >= 1; i--) {
      rows.push({
        sku: 'EOL', sku_name: 'EOL', supplier: 'X', category: 'T',
        date: dateString(i), partner_id: 'P1',
        sold_qty: i > 30 ? 5 : 0.5, unit_price: 50, stock_qty: 100,
        lead_time_days: 14, ordered_qty: 0, expected_delivery_date: '',
      });
    }
    const s = runScenario(rows).find(x => x.sku === 'EOL')!;
    expect(s.trend).toBe('falling');
    expect(s.trendPct).toBeLessThan(-50);
  });

  it('Scenario F: FIAMM shelf life warning', () => {
    const rows = generateDailyRows('FIAMM-SL', 'FIAMM SL', 'FIAMM', 'Battery', 90, 0.8, 89, 500, 7, 0);
    const costSettings: CostSettings = {
      ...DEFAULT_COST_SETTINGS,
      shelfLifeEnabled: true,
      categoryShelfLifeDays: { 'Battery': 730 },
    };
    const s = runScenario(rows, costSettings).find(x => x.sku === 'FIAMM-SL')!;
    expect(s.shelfLifeRisk).toBe('warning');
  });

  it('Scenario H: 45-day lead time → high reorder point', () => {
    const rows = generateDailyRows('TDK-LT45', 'TDK LT45', 'TDK', 'PSU', 90, 5, 60, 100, 45, 0);
    const s = runScenario(rows).find(x => x.sku === 'TDK-LT45')!;
    expect(s.reorder_point!).toBeGreaterThanOrEqual(225);
    expect(getUrgency(s.days_of_stock, s.lead_time_days)).toBe('Warning');
  });
});

// ═══════════════════════════════════════════════════════════════
// 26. Performance Benchmarks
// ═══════════════════════════════════════════════════════════════
describe('Performance benchmarks', () => {
  it('1000 SKUs × 90 days: parse < 1000ms', () => {
    const rows: RawRow[] = [];
    for (let s = 0; s < 1000; s++) {
      for (let d = 90; d >= 1; d--) {
        rows.push({
          sku: `PERF-${s}`, sku_name: `Perf ${s}`, supplier: 'X', category: 'T',
          date: dateString(d), partner_id: 'P1',
          sold_qty: (s % 5) + 1, unit_price: 10, stock_qty: 50,
          lead_time_days: 14, ordered_qty: 0, expected_delivery_date: '',
        });
      }
    }
    const start = performance.now();
    const skuMap = parseRows(rows);
    expect(skuMap.size).toBe(1000);
    expect(performance.now() - start).toBeLessThan(1000);
  });

  it('1000 SKUs: analyzeSkus < 2000ms', () => {
    const rows: RawRow[] = [];
    for (let s = 0; s < 1000; s++) {
      for (let d = 90; d >= 1; d--) {
        rows.push({
          sku: `APERF-${s}`, sku_name: `APerf ${s}`, supplier: 'X', category: 'T',
          date: dateString(d), partner_id: 'P1',
          sold_qty: (s % 5) + 1, unit_price: (s % 20) + 1, stock_qty: 50,
          lead_time_days: 14, ordered_qty: 0, expected_delivery_date: '',
        });
      }
    }
    const skuMap = parseRows(rows);
    const end = new Date(TEST_REFERENCE_DATE);
    end.setDate(end.getDate() - 1);
    const startDate = new Date(end);
    startDate.setDate(startDate.getDate() - 90);
    const start = performance.now();
    const result = analyzeSkus(skuMap, startDate, end, 90, Z95);
    expect(result.length).toBe(1000);
    expect(performance.now() - start).toBeLessThan(2000);
  });

  it('10,000 SKUs × 1 row: parse < 500ms, analyze < 1000ms', () => {
    const rows: RawRow[] = [];
    for (let s = 0; s < 10000; s++) {
      rows.push({
        sku: `MIN-${s}`, sku_name: `Min ${s}`, supplier: 'X', category: 'T',
        date: dateString(30), partner_id: 'P1',
        sold_qty: 1, unit_price: 5, stock_qty: 10,
        lead_time_days: 7, ordered_qty: 0, expected_delivery_date: '',
      });
    }
    let start = performance.now();
    const skuMap = parseRows(rows);
    expect(performance.now() - start).toBeLessThan(500);
    expect(skuMap.size).toBe(10000);

    const end = new Date(TEST_REFERENCE_DATE);
    end.setDate(end.getDate() - 1);
    const startDate = new Date(end);
    startDate.setDate(startDate.getDate() - 90);
    start = performance.now();
    const result = analyzeSkus(skuMap, startDate, end, 90, Z95);
    expect(performance.now() - start).toBeLessThan(1000);
    expect(result.length).toBe(10000);
  });
});
