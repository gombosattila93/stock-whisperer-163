import { describe, it, expect } from 'vitest';
import { parseRows, analyzeSkus } from '@/lib/calculations';
import { DEFAULT_THRESHOLDS } from '@/lib/classificationTypes';
import { DEFAULT_COST_SETTINGS } from '@/lib/costSettings';
import { FALLBACK_RATES } from '@/lib/fxRates';
import type { RawRow } from '@/lib/types';

// The worker logic is tested directly (not via postMessage) since Web Workers
// are mocked in the test environment. We test the same pipeline the worker uses.

const makeRow = (overrides: Partial<RawRow> = {}): RawRow => ({
  sku: 'SKU-001',
  sku_name: 'Test SKU',
  supplier: 'TestCo',
  category: 'Parts',
  date: '2025-01-01',
  partner_id: 'P001',
  sold_qty: 10,
  unit_price: 5.0,
  stock_qty: 100,
  lead_time_days: 7,
  ordered_qty: 0,
  expected_delivery_date: '',
  ...overrides,
});

describe('worker pipeline — parseRows + analyzeSkus', () => {
  const rows: RawRow[] = [
    makeRow({ date: '2025-01-01', sold_qty: 10 }),
    makeRow({ date: '2025-02-01', sold_qty: 20 }),
    makeRow({ date: '2025-03-01', sold_qty: 15 }),
  ];

  it('produces one analysis entry per SKU', () => {
    const skuMap = parseRows(rows);
    const end = new Date('2026-01-01');
    const start = new Date('2025-01-01');
    const analyses = analyzeSkus(skuMap, start, end, 90, 1.65, DEFAULT_THRESHOLDS, DEFAULT_COST_SETTINGS, FALLBACK_RATES);
    expect(analyses).toHaveLength(1);
    expect(analyses[0].sku).toBe('SKU-001');
  });

  it('avg_daily_demand is non-negative', () => {
    const skuMap = parseRows(rows);
    const end = new Date('2026-01-01');
    const start = new Date('2025-01-01');
    const analyses = analyzeSkus(skuMap, start, end, 90, 1.65, DEFAULT_THRESHOLDS, DEFAULT_COST_SETTINGS, FALLBACK_RATES);
    expect(analyses[0].avg_daily_demand).toBeGreaterThanOrEqual(0);
  });

  it('safety_stock is null when lead time is 0', () => {
    const zeroLtRows = [makeRow({ lead_time_days: 0, sold_qty: 10 })];
    const skuMap = parseRows(zeroLtRows);
    const end = new Date('2026-01-01');
    const start = new Date('2025-01-01');
    const analyses = analyzeSkus(skuMap, start, end, 90, 1.65, DEFAULT_THRESHOLDS, DEFAULT_COST_SETTINGS, FALLBACK_RATES);
    expect(analyses[0].safety_stock).toBeNull();
  });

  it('leadTimeClamped is true when lead_time_days > 365', () => {
    const clampedRows = [makeRow({ lead_time_days: 400, sold_qty: 5 })];
    const skuMap = parseRows(clampedRows);
    expect(skuMap.get('SKU-001')!.leadTimeClamped).toBe(true);
    expect(skuMap.get('SKU-001')!.lead_time_days).toBe(365);
  });

  it('XYZ falls back to DEFAULT_THRESHOLDS when thresholds are invalid', () => {
    const skuMap = parseRows(rows);
    const end = new Date('2026-01-01');
    const start = new Date('2025-01-01');
    const badThresholds = { abcA: 80, abcB: 95, xyzX: NaN, xyzY: NaN };
    const analyses = analyzeSkus(skuMap, start, end, 90, 1.65, badThresholds, DEFAULT_COST_SETTINGS, FALLBACK_RATES);
    // Should not throw and xyz_class should be a valid value
    expect(['X', 'Y', 'Z', 'N/A']).toContain(analyses[0].xyz_class);
  });
});
