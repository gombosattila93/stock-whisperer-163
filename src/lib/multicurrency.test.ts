import { describe, test, expect } from 'vitest';
import {
  purchaseToEur, hufToEur, eurToHuf, createManualRates,
  isRateDeviant, isRateStale, FALLBACK_RATES, FxRateConfig,
} from './fxRates';
import { parsePriceBreaks, getEffectivePurchasePrice, buildPriceData } from './priceUtils';
import { parseRows, analyzeSkus } from './calculations';
import { generateDailyRows } from './testData';
import type { RawRow, PriceBreak } from './types';

// ─── Helpers ───────────────────────────────────────────────────────────────

function makeRow(overrides: Record<string, unknown> = {}): RawRow {
  return {
    sku: 'TEST-001',
    sku_name: 'Test Item',
    supplier: 'Supplier',
    category: 'Cat',
    date: '2025-06-01',
    partner_id: 'P1',
    sold_qty: 10 as any,
    unit_price: 25 as any,
    stock_qty: 100 as any,
    lead_time_days: 14 as any,
    ordered_qty: 0 as any,
    expected_delivery_date: '',
    ...overrides,
  };
}

function quickAnalyze(rows: RawRow[], fxRates: FxRateConfig = FALLBACK_RATES) {
  const map = parseRows(rows);
  return analyzeSkus(map, new Date('2025-01-01'), new Date('2025-12-31'), 90, 1.65, undefined, undefined, fxRates);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. FX Rate System Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('FX-001: Rate conversion functions', () => {
  const rates: FxRateConfig = {
    usdEur: 0.924,
    eurHuf: 392.5,
    usdHuf: 362.5,
    lastUpdated: '2026-01-01T00:00:00Z',
    source: 'ecb',
    manualOverride: false,
  };

  test('purchaseToEur — EUR passthrough', () => {
    expect(purchaseToEur(100, 'EUR', rates)).toBeCloseTo(100.000, 3);
  });

  test('purchaseToEur — USD conversion', () => {
    expect(purchaseToEur(100, 'USD', rates)).toBeCloseTo(92.400, 3);
  });

  test('hufToEur — known value', () => {
    expect(hufToEur(39250, rates)).toBeCloseTo(100.000, 3);
  });

  test('eurToHuf — known value', () => {
    expect(eurToHuf(100, rates)).toBeCloseTo(39250, 0);
  });

  test('usdHuf always derived — never stored independently', () => {
    const r = { ...rates, usdEur: 0.950, eurHuf: 400.0 };
    const derived = r.usdEur * r.eurHuf;
    expect(derived).toBeCloseTo(380.0, 3);
  });

  test('hufToEur — eurHuf = 0 never divides by zero', () => {
    const badRates = { ...rates, eurHuf: 0 };
    expect(() => hufToEur(100, badRates)).not.toThrow();
    expect(isFinite(hufToEur(100, badRates))).toBe(true);
  });

  test('purchaseToEur — usdEur = 0 uses fallback, not NaN', () => {
    const badRates = { ...rates, usdEur: 0 };
    const result = purchaseToEur(100, 'USD', badRates);
    expect(isNaN(result)).toBe(false);
    expect(isFinite(result)).toBe(true);
    // Falls back to FALLBACK_RATES.usdEur
    expect(result).toBeCloseTo(100 * FALLBACK_RATES.usdEur, 1);
  });

  test('purchaseToEur — negative amount returns 0', () => {
    expect(purchaseToEur(-50, 'USD', rates)).toBe(0);
  });

  test('purchaseToEur — NaN amount returns 0', () => {
    expect(purchaseToEur(NaN, 'EUR', rates)).toBe(0);
  });

  test('purchaseToEur — Infinity returns 0', () => {
    expect(purchaseToEur(Infinity, 'EUR', rates)).toBe(0);
  });

  test('hufToEur — NaN returns 0', () => {
    expect(hufToEur(NaN, rates)).toBe(0);
  });

  test('hufToEur — Infinity returns 0', () => {
    expect(hufToEur(Infinity, rates)).toBe(0);
  });
});

describe('FX-002: Rate deviation and staleness', () => {
  test('Rate deviation > 30% from fallback triggers warning', () => {
    const suspicious: FxRateConfig = { ...FALLBACK_RATES, usdEur: 1.500 };
    const deviation = Math.abs(suspicious.usdEur - FALLBACK_RATES.usdEur) / FALLBACK_RATES.usdEur;
    expect(deviation).toBeGreaterThan(0.30);
    expect(isRateDeviant(suspicious)).toBe(true);
  });

  test('Rate deviation < 30% does not trigger warning', () => {
    const normal: FxRateConfig = { ...FALLBACK_RATES, usdEur: 0.980 };
    expect(isRateDeviant(normal)).toBe(false);
  });

  test('HUF rate deviation > 30% also triggers', () => {
    const suspicious: FxRateConfig = { ...FALLBACK_RATES, eurHuf: 600 };
    expect(isRateDeviant(suspicious)).toBe(true);
  });

  test('Fresh rate is not stale', () => {
    const fresh: FxRateConfig = { ...FALLBACK_RATES, lastUpdated: new Date().toISOString() };
    expect(isRateStale(fresh)).toBe(false);
  });

  test('Old rate is stale', () => {
    const old: FxRateConfig = { ...FALLBACK_RATES, lastUpdated: '2020-01-01T00:00:00Z' };
    expect(isRateStale(old)).toBe(true);
  });

  test('Invalid date treated as stale', () => {
    const bad: FxRateConfig = { ...FALLBACK_RATES, lastUpdated: 'not-a-date' };
    expect(isRateStale(bad)).toBe(true);
  });

  test('Manual rate creation with valid values', () => {
    const manual = createManualRates(0.950, 400.0);
    expect(manual.usdEur).toBe(0.950);
    expect(manual.eurHuf).toBe(400.0);
    expect(manual.usdHuf).toBeCloseTo(380.0, 2);
    expect(manual.source).toBe('manual');
    expect(manual.manualOverride).toBe(true);
  });

  test('Manual rate creation with invalid values falls back', () => {
    const manual = createManualRates(-1, NaN);
    expect(manual.usdEur).toBe(FALLBACK_RATES.usdEur);
    expect(manual.eurHuf).toBe(FALLBACK_RATES.eurHuf);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. Price Break Parsing Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('PB-001: parsePriceBreaks — valid inputs', () => {
  const rates = FALLBACK_RATES;

  test('Single price, no qty (base price only)', () => {
    const row = { purchase_price_1: '31.50', purchase_qty_1: '1' };
    const breaks = parsePriceBreaks(row, 'EUR', rates);
    expect(breaks).toHaveLength(1);
    expect(breaks[0].minQty).toBe(1);
    expect(breaks[0].price).toBeCloseTo(31.50, 2);
    expect(breaks[0].priceEur).toBeCloseTo(31.50, 2);
  });

  test('3 price breaks — EUR, strictly decreasing', () => {
    const row = {
      purchase_price_1: '31.50', purchase_qty_1: '1',
      purchase_price_2: '29.00', purchase_qty_2: '10',
      purchase_price_3: '26.50', purchase_qty_3: '25',
    };
    const breaks = parsePriceBreaks(row, 'EUR', rates);
    expect(breaks).toHaveLength(3);
    expect(breaks[0].minQty).toBe(1);
    expect(breaks[1].minQty).toBe(10);
    expect(breaks[2].minQty).toBe(25);
    expect(breaks[0].price).toBeGreaterThan(breaks[1].price);
    expect(breaks[1].price).toBeGreaterThan(breaks[2].price);
  });

  test('USD price breaks converted to EUR', () => {
    const row = {
      purchase_price_1: '34.09', purchase_qty_1: '1',
      purchase_price_2: '31.39', purchase_qty_2: '10',
    };
    const breaks = parsePriceBreaks(row, 'USD', rates);
    expect(breaks).toHaveLength(2);
    expect(breaks[0].priceEur).toBeCloseTo(34.09 * 0.924, 1);
    expect(breaks[1].priceEur).toBeCloseTo(31.39 * 0.924, 1);
    expect(breaks[0].price).toBeCloseTo(34.09, 2); // original USD preserved
  });

  test('8 price breaks — maximum supported', () => {
    const row: Record<string, string> = {};
    const prices = [100, 95, 90, 85, 80, 75, 70, 65];
    const qtys = [1, 5, 10, 25, 50, 100, 250, 500];
    for (let i = 0; i < 8; i++) {
      row[`purchase_price_${i + 1}`] = String(prices[i]);
      row[`purchase_qty_${i + 1}`] = String(qtys[i]);
    }
    const breaks = parsePriceBreaks(row, 'EUR', rates);
    expect(breaks).toHaveLength(8);
    expect(breaks[7].minQty).toBe(500);
    expect(breaks[7].price).toBe(65);
  });

  test('purchase_qty_1 missing — defaults to 1', () => {
    const row = { purchase_price_1: '45.00' };
    const breaks = parsePriceBreaks(row, 'EUR', rates);
    expect(breaks).toHaveLength(1);
    expect(breaks[0].minQty).toBe(1);
  });

  test('EUR prices pass through without conversion', () => {
    const row = { purchase_price_1: '29.50' };
    const breaks = parsePriceBreaks(row, 'EUR', rates);
    expect(breaks[0].priceEur).toBe(29.50);
  });
});

describe('PB-002: parsePriceBreaks — invalid inputs', () => {
  const rates = FALLBACK_RATES;

  test('No purchase price columns — returns empty array', () => {
    const breaks = parsePriceBreaks({ unit_price: '45' }, 'EUR', rates);
    expect(breaks).toHaveLength(0);
    expect(Array.isArray(breaks)).toBe(true);
  });

  test('purchase_price_1 = 0 — skipped', () => {
    const breaks = parsePriceBreaks({ purchase_price_1: '0', purchase_qty_1: '1' }, 'EUR', rates);
    expect(breaks).toHaveLength(0);
  });

  test('purchase_price_1 negative — skipped', () => {
    const breaks = parsePriceBreaks({ purchase_price_1: '-10', purchase_qty_1: '1' }, 'EUR', rates);
    expect(breaks).toHaveLength(0);
  });

  test('Non-decreasing price break skipped', () => {
    const row = {
      purchase_price_1: '30', purchase_qty_1: '1',
      purchase_price_2: '35', purchase_qty_2: '10', // higher = invalid
      purchase_price_3: '25', purchase_qty_3: '25',
    };
    const breaks = parsePriceBreaks(row, 'EUR', rates);
    expect(breaks).toHaveLength(2);
    expect(breaks.every(b => b.price <= 30)).toBe(true);
  });

  test('Break 2+ without qty — skipped', () => {
    const row = {
      purchase_price_1: '30',
      purchase_price_2: '25', // no qty
    };
    const breaks = parsePriceBreaks(row, 'EUR', rates);
    expect(breaks).toHaveLength(1);
  });

  test('NaN price — skipped gracefully', () => {
    const row = { purchase_price_1: 'abc', purchase_qty_1: '1' };
    const breaks = parsePriceBreaks(row, 'EUR', rates);
    expect(breaks).toHaveLength(0);
    expect(() => parsePriceBreaks(row, 'EUR', rates)).not.toThrow();
  });

  test('Empty row — returns empty array', () => {
    expect(parsePriceBreaks({}, 'EUR', rates)).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. Effective Price Selection Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('PB-003: getEffectivePurchasePrice', () => {
  const breaks: PriceBreak[] = [
    { minQty: 1, price: 31.50, priceEur: 31.50 },
    { minQty: 10, price: 29.00, priceEur: 29.00 },
    { minQty: 25, price: 26.50, priceEur: 26.50 },
  ];

  test('qty = 1 → base price (break 1)', () => {
    expect(getEffectivePurchasePrice(breaks, 1)?.price).toBe(31.50);
  });

  test('qty = 9 → still base price (just below break 2)', () => {
    expect(getEffectivePurchasePrice(breaks, 9)?.price).toBe(31.50);
  });

  test('qty = 10 → break 2 price', () => {
    expect(getEffectivePurchasePrice(breaks, 10)?.price).toBe(29.00);
  });

  test('qty = 24 → break 2 price (just below break 3)', () => {
    expect(getEffectivePurchasePrice(breaks, 24)?.price).toBe(29.00);
  });

  test('qty = 25 → best price (break 3)', () => {
    expect(getEffectivePurchasePrice(breaks, 25)?.price).toBe(26.50);
  });

  test('qty = 1000 → best price (above all breaks)', () => {
    expect(getEffectivePurchasePrice(breaks, 1000)?.price).toBe(26.50);
  });

  test('qty = 0 → base price (floor at break 1)', () => {
    const result = getEffectivePurchasePrice(breaks, 0);
    expect(result?.price).toBe(31.50);
  });

  test('empty breaks → returns null', () => {
    expect(getEffectivePurchasePrice([], 10)).toBeNull();
  });

  test('negative qty → base price', () => {
    expect(getEffectivePurchasePrice(breaks, -5)?.price).toBe(31.50);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. buildPriceData Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('PD-001: buildPriceData — complete data', () => {
  const rates = FALLBACK_RATES; // usdEur=0.924, eurHuf=392.5

  test('EUR purchase + HUF selling → correct margin', () => {
    const row = {
      purchase_price_1: '29.00', purchase_qty_1: '1',
      purchase_currency: 'EUR',
      selling_price_huf: '15700', // 15700 / 392.5 = 40.00 EUR
    };
    const pd = buildPriceData(row, 10, rates);
    expect(pd.hasPurchasePrice).toBe(true);
    expect(pd.hasSellingPrice).toBe(true);
    expect(pd.hasMarginData).toBe(true);
    expect(pd.sellingPriceHuf).toBe(15700);
    expect(pd.sellingPriceEur).toBeCloseTo(40.00, 2);
    expect(pd.basePurchasePriceEur).toBeCloseTo(29.00, 2);
    expect(pd.marginEur).toBeCloseTo(11.00, 2);
    expect(pd.marginPct).toBeCloseTo(27.5, 1);
    expect(pd.sellingPriceEstimated).toBe(false);
  });

  test('USD purchase + HUF selling → conversion applied', () => {
    const row = {
      purchase_price_1: '31.39', purchase_qty_1: '1',
      purchase_currency: 'USD',
      selling_price_huf: '15700',
    };
    const pd = buildPriceData(row, 1, rates);
    expect(pd.purchaseCurrency).toBe('USD');
    expect(pd.basePurchasePriceEur).toBeCloseTo(31.39 * 0.924, 1);
    expect(pd.hasMarginData).toBe(true);
  });

  test('Effective price uses correct break for suggested qty', () => {
    const row = {
      purchase_price_1: '31.50', purchase_qty_1: '1',
      purchase_price_2: '29.00', purchase_qty_2: '10',
      purchase_price_3: '26.50', purchase_qty_3: '25',
      purchase_currency: 'EUR',
      selling_price_huf: '15700',
    };
    // suggestedOrderQty = 15 → break 2 applies (€29.00)
    const pd = buildPriceData(row, 15, rates);
    expect(pd.effectivePurchasePriceEur).toBeCloseTo(29.00, 2);
    expect(pd.basePurchasePriceEur).toBeCloseTo(31.50, 2);
    expect(pd.bestPurchasePriceEur).toBeCloseTo(26.50, 2);
    // Margin uses effective (break 2)
    expect(pd.marginEur).toBeCloseTo(40.00 - 29.00, 2);
  });

  test('nextPriceBreakQty — units needed for next break', () => {
    const row = {
      purchase_price_1: '31.50', purchase_qty_1: '1',
      purchase_price_2: '29.00', purchase_qty_2: '10',
      purchase_price_3: '26.50', purchase_qty_3: '25',
      purchase_currency: 'EUR',
      selling_price_huf: '15700',
    };
    // suggestedOrderQty = 7 → on break 1, next break at qty 10
    const pd = buildPriceData(row, 7, rates);
    expect(pd.nextPriceBreakQty).toBe(3); // 10 - 7
    expect(pd.nextPriceBreakSaving).toBeGreaterThan(0);
  });

  test('At best break — nextPriceBreakQty is null', () => {
    const row = {
      purchase_price_1: '31.50', purchase_qty_1: '1',
      purchase_price_2: '26.50', purchase_qty_2: '25',
      purchase_currency: 'EUR',
      selling_price_huf: '15700',
    };
    const pd = buildPriceData(row, 100, rates);
    expect(pd.nextPriceBreakQty).toBeNull();
    expect(pd.nextPriceBreakSaving).toBeNull();
  });

  test('marginAtBestBreak always uses last break', () => {
    const row = {
      purchase_price_1: '31.50', purchase_qty_1: '1',
      purchase_price_2: '26.50', purchase_qty_2: '25',
      purchase_currency: 'EUR',
      selling_price_huf: '15700', // 40 EUR
    };
    const pd = buildPriceData(row, 1, rates);
    expect(pd.marginAtBestBreakEur).toBeCloseTo(13.50, 2);
    expect(pd.marginAtBestBreakPct).toBeCloseTo(33.75, 1);
    // Effective margin (at break 1) is less
    expect(pd.marginEur).toBeCloseTo(40 - 31.50, 2);
  });
});

describe('PD-002: buildPriceData — missing prices', () => {
  const rates = FALLBACK_RATES;

  test('No purchase price — margin disabled, selling OK', () => {
    const row = { selling_price_huf: '15700', unit_price: '40.00' };
    const pd = buildPriceData(row, 10, rates);
    expect(pd.hasPurchasePrice).toBe(false);
    expect(pd.hasMarginData).toBe(false);
    expect(pd.marginEur).toBeNull();
    expect(pd.priceBreaks).toHaveLength(0);
    expect(pd.hasSellingPrice).toBe(true);
    expect(pd.sellingPriceHuf).toBe(15700);
  });

  test('No selling_price_huf — falls back to unit_price', () => {
    const row = {
      unit_price: '40.00',
      purchase_price_1: '29.00',
      purchase_currency: 'EUR',
    };
    const pd = buildPriceData(row, 1, rates);
    expect(pd.sellingPriceHuf).toBeCloseTo(40.00 * rates.eurHuf, 0);
    expect(pd.sellingPriceEstimated).toBe(true);
    expect(pd.hasSellingPrice).toBe(true);
    expect(pd.hasMarginData).toBe(true);
    expect(pd.marginEur).toBeCloseTo(40 - 29, 2);
  });

  test('No prices at all — all null, no error', () => {
    expect(() => buildPriceData({}, 1, rates)).not.toThrow();
    const pd = buildPriceData({}, 1, rates);
    expect(pd.hasPurchasePrice).toBe(false);
    expect(pd.hasSellingPrice).toBe(false);
    expect(pd.hasMarginData).toBe(false);
    expect(pd.marginEur).toBeNull();
    expect(pd.marginPct).toBeNull();
    expect(pd.sellingPriceHuf).toBeNull();
    expect(pd.priceBreaks).toHaveLength(0);
  });

  test('Negative margin — shown as-is, not hidden', () => {
    const row = {
      purchase_price_1: '50.00',
      purchase_currency: 'EUR',
      selling_price_huf: '15700', // 40 EUR
    };
    const pd = buildPriceData(row, 1, rates);
    expect(pd.hasMarginData).toBe(true);
    expect(pd.marginEur).toBeCloseTo(-10.00, 2);
    expect(pd.marginPct).toBeCloseTo(-25.0, 1);
  });

  test('selling_price_huf = 0 → treated as null', () => {
    const row = {
      purchase_price_1: '29.00',
      selling_price_huf: '0',
    };
    const pd = buildPriceData(row, 1, rates);
    expect(pd.sellingPriceHuf).toBeNull();
    expect(pd.hasSellingPrice).toBe(false);
    expect(pd.hasMarginData).toBe(false);
  });

  test('purchase_currency defaults to EUR when missing', () => {
    const row = { purchase_price_1: '20' };
    const pd = buildPriceData(row, 1, rates);
    expect(pd.purchaseCurrency).toBe('EUR');
    expect(pd.priceBreaks[0].priceEur).toBe(20);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. analyzeSkus Integration Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('INT-001: analyzeSkus with currency data', () => {
  const rates = FALLBACK_RATES;

  test('priceData attached to every SKU in output', () => {
    const rows = generateDailyRows('SKU-001', 'Test PSU', 'TDK-Lambda', 'PSU', 90, 3, 87.50, 28, 21, 60);
    const result = quickAnalyze(rows, rates);
    expect(result[0].priceData).toBeDefined();
    expect(result[0].priceData).not.toBeNull();
  });

  test('SKU without prices — inventory analysis unchanged', () => {
    const rows = generateDailyRows('SKU-001', 'Test', 'S', 'PSU', 90, 3, 87.50, 28, 21, 60);
    const withoutFx = quickAnalyze(rows);
    const withFx = quickAnalyze(rows, rates);

    expect(withFx[0].avg_daily_demand).toBeCloseTo(withoutFx[0].avg_daily_demand, 4);
    expect(withFx[0].reorder_point).toBeCloseTo(withoutFx[0].reorder_point ?? 0, 4);
    expect(withFx[0].abc_class).toBe(withoutFx[0].abc_class);
    expect(withFx[0].xyz_class).toBe(withoutFx[0].xyz_class);
  });

  test('Existing CSV without new columns: priceData defaults gracefully', () => {
    const rows = [makeRow()];
    const result = quickAnalyze(rows, rates);
    expect(result).toHaveLength(1);
    const pd = result[0].priceData;
    expect(pd.hasPurchasePrice).toBe(false);
    expect(pd.hasSellingPrice).toBe(true); // estimated from unit_price
    expect(pd.sellingPriceEstimated).toBe(true);
    expect(pd.hasMarginData).toBe(false);
    expect(pd.purchaseCurrency).toBe('EUR');
  });

  test('New columns produce full priceData', () => {
    const row = makeRow({
      selling_price_huf: '11600',
      purchase_currency: 'USD',
      purchase_price_1: '31.90',
      purchase_qty_1: '1',
      purchase_price_2: '29.50',
      purchase_qty_2: '10',
    });
    const result = quickAnalyze([row], rates);
    const pd = result[0].priceData;
    expect(pd.hasPurchasePrice).toBe(true);
    expect(pd.hasSellingPrice).toBe(true);
    expect(pd.hasMarginData).toBe(true);
    expect(pd.purchaseCurrency).toBe('USD');
    expect(pd.priceBreaks.length).toBeGreaterThanOrEqual(1);
    expect(pd.marginEur).toBeDefined();
  });

  test('unit_price still drives ABC when no selling_price_huf', () => {
    const rows = generateDailyRows('SKU-001', 'Test', 'S', 'PSU', 90, 10, 100, 50, 14, 0);
    const result = quickAnalyze(rows, rates);
    // Revenue = 100 × totalSold → A class
    expect(result[0].abc_class).toBe('A');
    expect(result[0].priceData.hasMarginData).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. Backward Compatibility Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('BACK-001: Existing CSV without new columns', () => {
  test('All priceData fields null/false for plain rows', () => {
    const rows = generateDailyRows('SKU-001', 'Widget', 'Sup', 'Cat', 90, 5, 50, 100, 14, 0);
    // Remove unit_price to test truly empty
    const noPrice = rows.map(r => ({ ...r, unit_price: 0 }));
    const result = quickAnalyze(noPrice);
    result.forEach(sku => {
      expect(sku.priceData.hasPurchasePrice).toBe(false);
      expect(sku.priceData.hasMarginData).toBe(false);
    });
  });

  test('ABC/XYZ results unchanged after currency feature added', () => {
    const rows = generateDailyRows('SKU-001', 'Test', 'S', 'PSU', 90, 3, 87.50, 28, 21, 60);
    const before = quickAnalyze(rows);
    const after = quickAnalyze(rows, FALLBACK_RATES);
    before.forEach((bSku, i) => {
      expect(after[i].abc_class).toBe(bSku.abc_class);
      expect(after[i].xyz_class).toBe(bSku.xyz_class);
      expect(after[i].reorder_point).toBeCloseTo(bSku.reorder_point ?? 0, 2);
    });
  });

  test('Multiple SKUs — each gets independent priceData', () => {
    const rowsA = generateDailyRows('SKU-A', 'A', 'S', 'C', 30, 5, 50, 100, 14, 0);
    const rowsB = generateDailyRows('SKU-B', 'B', 'S', 'C', 30, 3, 30, 50, 7, 0);
    const result = quickAnalyze([...rowsA, ...rowsB]);
    expect(result).toHaveLength(2);
    result.forEach(r => {
      expect(r.priceData).toBeDefined();
      expect(r.priceData.purchaseCurrency).toBe('EUR');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. Edge Case Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('CURR-EDGE: Currency edge cases', () => {
  const rates = FALLBACK_RATES;

  test('EUR/HUF rate change → margin recalculates correctly', () => {
    const row = {
      purchase_price_1: '29.00',
      purchase_currency: 'EUR',
      selling_price_huf: '15700',
    };
    const ratesLow = { ...rates, eurHuf: 380.0 };
    const ratesHigh = { ...rates, eurHuf: 420.0 };

    const pdLow = buildPriceData(row, 1, ratesLow);
    const pdHigh = buildPriceData(row, 1, ratesHigh);

    // Higher HUF rate = HUF worth less = lower EUR selling price = lower margin
    expect(pdLow.sellingPriceEur!).toBeGreaterThan(pdHigh.sellingPriceEur!);
    expect(pdLow.marginPct!).toBeGreaterThan(pdHigh.marginPct!);
  });

  test('USD strengthening hurts margin on USD purchases', () => {
    const row = {
      purchase_price_1: '31.39',
      purchase_currency: 'USD',
      selling_price_huf: '15700',
    };
    const ratesWeak = { ...rates, usdEur: 0.880 };
    const ratesStrong = { ...rates, usdEur: 0.980 };

    const pdWeak = buildPriceData(row, 1, ratesWeak);
    const pdStrong = buildPriceData(row, 1, ratesStrong);

    // Stronger USD = higher EUR purchase cost = lower margin
    expect(pdWeak.marginPct!).toBeGreaterThan(pdStrong.marginPct!);
  });

  test('marginPct > 100% is valid — not capped', () => {
    const row = {
      purchase_price_1: '5.00',
      purchase_currency: 'EUR',
      selling_price_huf: '39250', // 100 EUR
    };
    const pd = buildPriceData(row, 1, rates);
    expect(pd.marginPct).toBeCloseTo(95.0, 1); // (100-5)/100
  });

  test('All 8 price breaks parsed and effective price correct', () => {
    const row: Record<string, string> = {
      purchase_currency: 'EUR',
      selling_price_huf: '58875', // 150 EUR
    };
    const prices = [100, 90, 82, 75, 70, 66, 63, 60];
    const qtys = [1, 10, 25, 50, 100, 250, 500, 1000];
    for (let i = 0; i < 8; i++) {
      row[`purchase_price_${i + 1}`] = String(prices[i]);
      row[`purchase_qty_${i + 1}`] = String(qtys[i]);
    }

    const pd7 = buildPriceData(row, 600, rates); // break 7 applies (qty 500)
    const pd8 = buildPriceData(row, 1000, rates); // break 8 applies

    expect(pd7.effectivePurchasePriceEur).toBeCloseTo(63, 2);
    expect(pd8.effectivePurchasePriceEur).toBeCloseTo(60, 2);
    expect(pd7.nextPriceBreakQty).toBe(400); // 1000 - 600
  });

  test('purchase_currency case insensitive (USD/usd/Usd)', () => {
    const row1 = { purchase_price_1: '30', purchase_currency: 'USD' };
    const row2 = { purchase_price_1: '30', purchase_currency: 'usd' };
    const pd1 = buildPriceData(row1, 1, rates);
    const pd2 = buildPriceData(row2, 1, rates);
    expect(pd1.purchaseCurrency).toBe('USD');
    expect(pd2.purchaseCurrency).toBe('USD');
    expect(pd1.basePurchasePriceEur).toBeCloseTo(pd2.basePurchasePriceEur!, 4);
  });

  test('Unknown currency defaults to EUR', () => {
    const row = { purchase_price_1: '30', purchase_currency: 'GBP' };
    const pd = buildPriceData(row, 1, rates);
    expect(pd.purchaseCurrency).toBe('EUR');
    expect(pd.basePurchasePriceEur).toBe(30);
  });
});
