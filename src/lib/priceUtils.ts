import { FxRateConfig, FALLBACK_RATES, purchaseToEur, hufToEur } from './fxRates';
import { PriceBreak, PriceData } from './types';

// ─── Parse wide-format price break columns from raw CSV row ────────────────

export function parsePriceBreaks(
  row: Record<string, unknown>,
  currency: 'USD' | 'EUR',
  rates: FxRateConfig,
): PriceBreak[] {
  const breaks: PriceBreak[] = [];
  let prevPrice = Infinity;

  for (let i = 1; i <= 8; i++) {
    const rawPrice = parseFloat(String(row[`purchase_price_${i}`] ?? ''));
    let rawQty = parseFloat(String(row[`purchase_qty_${i}`] ?? ''));

    if (isNaN(rawPrice) || rawPrice <= 0) continue;

    // qty defaults to 1 for first break, required for 2+
    if (isNaN(rawQty) || rawQty <= 0) {
      if (i === 1) {
        rawQty = 1;
      } else {
        continue; // skip: qty required for breaks 2-8
      }
    }

    // Breaks must be strictly descending in price
    if (rawPrice >= prevPrice) {
      // Skip non-descending break
      continue;
    }

    breaks.push({
      minQty: rawQty,
      price: rawPrice,
      priceEur: purchaseToEur(rawPrice, currency, rates),
    });

    prevPrice = rawPrice;
  }

  // Sort by minQty ascending
  breaks.sort((a, b) => a.minQty - b.minQty);
  return breaks;
}

// ─── Get effective purchase price for a given order quantity ────────────────

export function getEffectivePurchasePrice(
  breaks: PriceBreak[],
  orderQty: number,
): PriceBreak | null {
  if (breaks.length === 0) return null;

  // Find highest break where minQty <= orderQty
  let best: PriceBreak = breaks[0]; // fallback to base price
  for (const brk of breaks) {
    if (brk.minQty <= orderQty) {
      best = brk;
    }
  }
  return best;
}

// ─── Build complete PriceData for a SKU ────────────────────────────────────

export function buildPriceData(
  latestRow: Record<string, unknown>,
  suggestedOrderQty: number,
  rates: FxRateConfig = FALLBACK_RATES,
): PriceData {
  // Currency
  const rawCurrency = String(latestRow.purchase_currency ?? '').toUpperCase().trim();
  const purchaseCurrency: 'USD' | 'EUR' = rawCurrency === 'USD' ? 'USD' : 'EUR';

  // Price breaks
  const priceBreaks = parsePriceBreaks(latestRow, purchaseCurrency, rates);

  // Selling price
  const rawSellingHuf = parseFloat(String(latestRow.selling_price_huf ?? ''));
  const rawUnitPrice = parseFloat(String(latestRow.unit_price ?? ''));

  let sellingPriceHuf: number | null = null;
  let sellingPriceEstimated = false;

  if (!isNaN(rawSellingHuf) && rawSellingHuf > 0) {
    sellingPriceHuf = rawSellingHuf;
  } else if (!isNaN(rawUnitPrice) && rawUnitPrice > 0) {
    // Backward compat: unit_price assumed EUR, convert to HUF
    sellingPriceHuf = rawUnitPrice * rates.eurHuf;
    sellingPriceEstimated = true;
  }

  const sellingPriceEur = sellingPriceHuf !== null
    ? hufToEur(sellingPriceHuf, rates)
    : null;

  // Effective purchase price for suggested order qty
  const effectiveBreak = getEffectivePurchasePrice(priceBreaks, suggestedOrderQty);
  const effectivePurchasePriceEur = effectiveBreak?.priceEur ?? null;
  const basePurchasePriceEur = priceBreaks.length > 0 ? priceBreaks[0].priceEur : null;
  const bestPurchasePriceEur = priceBreaks.length > 0
    ? priceBreaks[priceBreaks.length - 1].priceEur
    : null;

  // Margin — only if both prices present
  const hasPurchasePrice = priceBreaks.length > 0;
  const hasSellingPrice = sellingPriceEur !== null;
  const hasMarginData = hasSellingPrice && effectivePurchasePriceEur !== null;

  let marginEur: number | null = null;
  let marginPct: number | null = null;

  if (hasMarginData && sellingPriceEur !== null && effectivePurchasePriceEur !== null) {
    marginEur = sellingPriceEur - effectivePurchasePriceEur;
    marginPct = sellingPriceEur > 0
      ? (marginEur / sellingPriceEur) * 100
      : null;
  }

  // Margin at best break
  let marginAtBestBreakEur: number | null = null;
  let marginAtBestBreakPct: number | null = null;

  if (sellingPriceEur !== null && bestPurchasePriceEur !== null) {
    marginAtBestBreakEur = sellingPriceEur - bestPurchasePriceEur;
    marginAtBestBreakPct = sellingPriceEur > 0
      ? (marginAtBestBreakEur / sellingPriceEur) * 100
      : null;
  }

  // Next price break opportunity
  const currentBreakIdx = effectiveBreak
    ? priceBreaks.indexOf(effectiveBreak)
    : -1;
  const nextBreak = currentBreakIdx >= 0 && currentBreakIdx < priceBreaks.length - 1
    ? priceBreaks[currentBreakIdx + 1]
    : null;

  const nextPriceBreakQty = nextBreak
    ? nextBreak.minQty - suggestedOrderQty
    : null;
  const nextPriceBreakSaving = nextBreak && effectiveBreak
    ? (effectiveBreak.priceEur - nextBreak.priceEur) * suggestedOrderQty
    : null;

  return {
    sellingPriceHuf,
    sellingPriceEur,
    sellingPriceEstimated,
    purchaseCurrency,
    priceBreaks,
    basePurchasePriceEur,
    bestPurchasePriceEur,
    effectivePurchasePriceEur,
    marginEur,
    marginPct,
    marginAtBestBreakEur,
    marginAtBestBreakPct,
    hasPurchasePrice,
    hasSellingPrice,
    hasMarginData,
    nextPriceBreakQty,
    nextPriceBreakSaving,
  };
}
