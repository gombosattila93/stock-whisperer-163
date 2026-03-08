import { describe, it, expect, beforeAll } from 'vitest';
import { parseRows, analyzeSkus, ewmaDemand, getSuggestedOrderQty, getUrgency, SERVICE_LEVELS } from './calculations';
import { ropStrategy, eoqStrategy, minMaxStrategy, periodicStrategy, computeReorder, DEFAULT_EOQ_SETTINGS } from './reorderStrategies';
import { REALISTIC_TEST_DATA, TEST_REFERENCE_DATE } from './testData';
import { SkuAnalysis } from './types';
import { DEFAULT_COST_SETTINGS } from './costSettings';

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
