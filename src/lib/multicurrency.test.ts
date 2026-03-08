import { describe, test, expect } from 'vitest';
import { purchaseToEur, hufToEur, eurToHuf, createManualRates, isRateDeviant, isRateStale, FALLBACK_RATES, FxRateConfig } from './fxRates';
import { parsePriceBreaks, getEffectivePurchasePrice, buildPriceData } from './priceUtils';
import { parseRows, analyzeSkus } from './calculations';
import type { RawRow } from './types';

// ═══════════════════════════════════════════════════════════════════════════════
// 1. FX Rate Conversions
// ═══════════════════════════════════════════════════════════════════════════════

describe('FX rate conversions', () => {
  const rates = FALLBACK_RATES;

  test('EUR → EUR is identity', () => {
    expect(purchaseToEur(100, 'EUR', rates)).toBe(100);
  });

  test('USD → EUR uses usdEur rate', () => {
    expect(purchaseToEur(100, 'USD', rates)).toBeCloseTo(92.4, 1);
  });

  test('negative amount returns 0', () => {
    expect(purchaseToEur(-50, 'USD', rates)).toBe(0);
  });

  test('Infinity amount returns 0', () => {
    expect(purchaseToEur(Infinity, 'EUR', rates)).toBe(0);
  });

  test('NaN amount returns 0', () => {
    expect(purchaseToEur(NaN, 'USD', rates)).toBe(0);
  });

  test('HUF to EUR conversion', () => {
    expect(hufToEur(392.5, rates)).toBeCloseTo(1.0, 2);
    expect(hufToEur(11600, rates)).toBeCloseTo(29.55, 1);
  });

  test('EUR to HUF conversion', () => {
    expect(eurToHuf(1, rates)).toBeCloseTo(392.5, 1);
    expect(eurToHuf(29.55, rates)).toBeCloseTo(11591.875, 0);
  });

  test('hufToEur with zero returns 0', () => {
    expect(hufToEur(0, rates)).toBe(0);
  });

  test('hufToEur with Infinity returns 0', () => {
    expect(hufToEur(Infinity, rates)).toBe(0);
  });

  test('invalid rate falls back to FALLBACK_RATES', () => {
    const badRates: FxRateConfig = { ...rates, usdEur: 0, eurHuf: -1 };
    expect(purchaseToEur(100, 'USD', badRates)).toBeCloseTo(92.4, 1);
    expect(hufToEur(392.5, badRates)).toBeCloseTo(1.0, 2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. Manual Rate Creation
// ═══════════════════════════════════════════════════════════════════════════════

describe('Manual rate creation', () => {
  test('creates valid manual config', () => {
    const manual = createManualRates(0.90, 400);
    expect(manual.usdEur).toBe(0.90);
    expect(manual.eurHuf).toBe(400);
    expect(manual.usdHuf).toBeCloseTo(360, 1);
    expect(manual.source).toBe('manual');
    expect(manual.manualOverride).toBe(true);
  });

  test('invalid values fall back', () => {
    const manual = createManualRates(-1, NaN);
    expect(manual.usdEur).toBe(FALLBACK_RATES.usdEur);
    expect(manual.eurHuf).toBe(FALLBACK_RATES.eurHuf);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. Rate Deviation & Staleness
// ═══════════════════════════════════════════════════════════════════════════════

describe('Rate deviation and staleness', () => {
  test('normal rates are not deviant', () => {
    expect(isRateDeviant(FALLBACK_RATES)).toBe(false);
  });

  test('30%+ deviation detected', () => {
    const wild: FxRateConfig = { ...FALLBACK_RATES, usdEur: 0.5 };
    expect(isRateDeviant(wild)).toBe(true);
  });

  test('fresh rate is not stale', () => {
    const fresh: FxRateConfig = { ...FALLBACK_RATES, lastUpdated: new Date().toISOString() };
    expect(isRateStale(fresh)).toBe(false);
  });

  test('old rate is stale', () => {
    const old: FxRateConfig = { ...FALLBACK_RATES, lastUpdated: '2020-01-01T00:00:00Z' };
    expect(isRateStale(old)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. Price Break Parsing
// ═══════════════════════════════════════════════════════════════════════════════

describe('parsePriceBreaks', () => {
  const rates = FALLBACK_RATES;

  test('parses single break (base price)', () => {
    const row = { purchase_price_1: '31.90' };
    const breaks = parsePriceBreaks(row, 'USD', rates);
    expect(breaks).toHaveLength(1);
    expect(breaks[0].minQty).toBe(1);
    expect(breaks[0].price).toBeCloseTo(31.90, 2);
    expect(breaks[0].priceEur).toBeCloseTo(29.47, 1);
  });

  test('parses multiple descending breaks', () => {
    const row = {
      purchase_price_1: '31.90', purchase_qty_1: '1',
      purchase_price_2: '29.50', purchase_qty_2: '10',
      purchase_price_3: '27.00', purchase_qty_3: '25',
    };
    const breaks = parsePriceBreaks(row, 'USD', rates);
    expect(breaks).toHaveLength(3);
    expect(breaks[0].minQty).toBe(1);
    expect(breaks[1].minQty).toBe(10);
    expect(breaks[2].minQty).toBe(25);
    // Prices strictly descending
    expect(breaks[0].price).toBeGreaterThan(breaks[1].price);
    expect(breaks[1].price).toBeGreaterThan(breaks[2].price);
  });

  test('skips non-descending price break', () => {
    const row = {
      purchase_price_1: '30', purchase_qty_1: '1',
      purchase_price_2: '35', purchase_qty_2: '10', // higher → skip
      purchase_price_3: '25', purchase_qty_3: '25',
    };
    const breaks = parsePriceBreaks(row, 'EUR', rates);
    expect(breaks).toHaveLength(2); // only break 1 and 3
    expect(breaks[0].price).toBe(30);
    expect(breaks[1].price).toBe(25);
  });

  test('skips break with missing qty (break 2+)', () => {
    const row = {
      purchase_price_1: '30',
      purchase_price_2: '25', // no qty → skip
    };
    const breaks = parsePriceBreaks(row, 'EUR', rates);
    expect(breaks).toHaveLength(1);
  });

  test('returns empty for no valid prices', () => {
    const row = { purchase_price_1: 'abc' };
    expect(parsePriceBreaks(row, 'EUR', rates)).toHaveLength(0);
  });

  test('returns empty for empty row', () => {
    expect(parsePriceBreaks({}, 'EUR', rates)).toHaveLength(0);
  });

  test('EUR prices pass through without conversion', () => {
    const row = { purchase_price_1: '29.50' };
    const breaks = parsePriceBreaks(row, 'EUR', rates);
    expect(breaks[0].priceEur).toBe(29.50);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. Effective Purchase Price Lookup
// ═══════════════════════════════════════════════════════════════════════════════

describe('getEffectivePurchasePrice', () => {
  const breaks: import('./types').PriceBreak[] = [
    { minQty: 1, price: 30, priceEur: 30 },
    { minQty: 10, price: 25, priceEur: 25 },
    { minQty: 50, price: 20, priceEur: 20 },
  ];

  test('qty=1 gets base price', () => {
    expect(getEffectivePurchasePrice(breaks, 1)?.priceEur).toBe(30);
  });

  test('qty=10 gets second break', () => {
    expect(getEffectivePurchasePrice(breaks, 10)?.priceEur).toBe(25);
  });

  test('qty=49 still gets second break', () => {
    expect(getEffectivePurchasePrice(breaks, 49)?.priceEur).toBe(25);
  });

  test('qty=50 gets best break', () => {
    expect(getEffectivePurchasePrice(breaks, 50)?.priceEur).toBe(20);
  });

  test('qty=0 gets base price (fallback)', () => {
    expect(getEffectivePurchasePrice(breaks, 0)?.priceEur).toBe(30);
  });

  test('empty breaks returns null', () => {
    expect(getEffectivePurchasePrice([], 10)).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. buildPriceData
// ═══════════════════════════════════════════════════════════════════════════════

describe('buildPriceData', () => {
  const rates = FALLBACK_RATES;

  test('full data: selling HUF + USD purchase + breaks', () => {
    const row = {
      selling_price_huf: '11600',
      purchase_currency: 'USD',
      purchase_price_1: '31.90', purchase_qty_1: '1',
      purchase_price_2: '29.50', purchase_qty_2: '10',
      unit_price: '25',
    };
    const pd = buildPriceData(row, 5, rates);

    expect(pd.hasSellingPrice).toBe(true);
    expect(pd.hasPurchasePrice).toBe(true);
    expect(pd.hasMarginData).toBe(true);
    expect(pd.sellingPriceHuf).toBe(11600);
    expect(pd.sellingPriceEur).toBeCloseTo(29.55, 1);
    expect(pd.sellingPriceEstimated).toBe(false);
    expect(pd.purchaseCurrency).toBe('USD');
    expect(pd.priceBreaks).toHaveLength(2);
    expect(pd.effectivePurchasePriceEur).toBeCloseTo(29.47, 1); // qty=5, base price
    expect(pd.marginEur).toBeCloseTo(0.08, 1);
  });

  test('backward compat: no new columns, only unit_price', () => {
    const row = { unit_price: '25.00' };
    const pd = buildPriceData(row, 10, rates);

    expect(pd.hasSellingPrice).toBe(true);
    expect(pd.sellingPriceEstimated).toBe(true);
    expect(pd.sellingPriceHuf).toBeCloseTo(9812.5, 0);
    expect(pd.sellingPriceEur).toBeCloseTo(25, 0);
    expect(pd.hasPurchasePrice).toBe(false);
    expect(pd.hasMarginData).toBe(false);
    expect(pd.marginEur).toBeNull();
    expect(pd.purchaseCurrency).toBe('EUR');
  });

  test('no prices at all: fully functional but margin disabled', () => {
    const row = {};
    const pd = buildPriceData(row, 10, rates);

    expect(pd.hasSellingPrice).toBe(false);
    expect(pd.hasPurchasePrice).toBe(false);
    expect(pd.hasMarginData).toBe(false);
    expect(pd.sellingPriceHuf).toBeNull();
    expect(pd.marginEur).toBeNull();
    expect(pd.marginPct).toBeNull();
  });

  test('negative margin is still reported', () => {
    const row = {
      selling_price_huf: '3925', // 10 EUR
      purchase_price_1: '15',    // 15 EUR
    };
    const pd = buildPriceData(row, 1, rates);
    expect(pd.hasMarginData).toBe(true);
    expect(pd.marginEur!).toBeLessThan(0);
  });

  test('next price break opportunity detected', () => {
    const row = {
      selling_price_huf: '11600',
      purchase_price_1: '30', purchase_qty_1: '1',
      purchase_price_2: '25', purchase_qty_2: '10',
    };
    const pd = buildPriceData(row, 5, rates);
    expect(pd.nextPriceBreakQty).toBe(5); // need 5 more to reach 10
    expect(pd.nextPriceBreakSaving).toBeGreaterThan(0);
  });

  test('at best break: no next opportunity', () => {
    const row = {
      selling_price_huf: '11600',
      purchase_price_1: '30', purchase_qty_1: '1',
      purchase_price_2: '25', purchase_qty_2: '10',
    };
    const pd = buildPriceData(row, 15, rates);
    expect(pd.nextPriceBreakQty).toBeNull();
    expect(pd.effectivePurchasePriceEur).toBe(25);
  });

  test('purchase_currency defaults to EUR', () => {
    const row = { purchase_price_1: '20' };
    const pd = buildPriceData(row, 1, rates);
    expect(pd.purchaseCurrency).toBe('EUR');
    expect(pd.priceBreaks[0].priceEur).toBe(20);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. Integration: analyzeSkus produces priceData
// ═══════════════════════════════════════════════════════════════════════════════

describe('analyzeSkus priceData integration', () => {

  function makeRow(overrides: Partial<import('./types').RawRow> = {}): import('./types').RawRow {
    return {
      sku: 'TEST-001',
      sku_name: 'Test',
      supplier: 'Sup',
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

  test('existing CSV without new columns: priceData defaults gracefully', () => {
    const map = parseRows([makeRow()]);
    const start = new Date('2025-01-01');
    const end = new Date('2025-12-31');
    const results = analyzeSkus(map, start, end, 90);

    expect(results).toHaveLength(1);
    const pd = results[0].priceData;
    expect(pd.hasPurchasePrice).toBe(false);
    expect(pd.hasSellingPrice).toBe(true); // estimated from unit_price
    expect(pd.sellingPriceEstimated).toBe(true);
    expect(pd.hasMarginData).toBe(false); // no purchase price
    expect(pd.purchaseCurrency).toBe('EUR');
  });

  test('new columns produce full priceData', () => {
    const row = makeRow({
      selling_price_huf: '11600' as any,
      purchase_currency: 'USD' as any,
      purchase_price_1: '31.90' as any,
      purchase_qty_1: '1' as any,
      purchase_price_2: '29.50' as any,
      purchase_qty_2: '10' as any,
    });
    const map = parseRows([row]);
    const results = analyzeSkus(map, new Date('2025-01-01'), new Date('2025-12-31'), 90);

    const pd = results[0].priceData;
    expect(pd.hasPurchasePrice).toBe(true);
    expect(pd.hasSellingPrice).toBe(true);
    expect(pd.hasMarginData).toBe(true);
    expect(pd.purchaseCurrency).toBe('USD');
    expect(pd.priceBreaks.length).toBeGreaterThanOrEqual(1);
    expect(pd.marginEur).toBeDefined();
  });
});
