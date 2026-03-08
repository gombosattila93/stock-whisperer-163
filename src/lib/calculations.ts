import { RawRow, SkuData, SkuAnalysis, SaleRecord, AbcClass, XyzClass, TrendDirection, SkuCapability, PriceData } from './types';
import { ClassificationThresholds, DEFAULT_THRESHOLDS } from './classificationTypes';
import { CostSettings, DEFAULT_COST_SETTINGS } from './costSettings';
import { parseFlexibleDate } from './dateUtils';
import { FxRateConfig, FALLBACK_RATES } from './fxRates';
import { buildPriceData } from './priceUtils';

// ─── Thresholds ────────────────────────────────────────────────────────────
/** Minimum fraction of demandDays with actual sales to consider data sufficient */
const INSUFFICIENT_DATA_THRESHOLD = 0.3;
/** Percent change in 30-day avg demand to classify as rising/falling trend */
const TREND_THRESHOLD_PCT = 15;
/** Conservative std_dev multiplier when only a single sale record exists */
const SINGLE_RECORD_STD_DEV_FACTOR = 0.5;

export const SERVICE_LEVELS: Record<string, number> = {
  '90%': 1.28,
  '95%': 1.65,
  '99%': 2.33,
};

export function parseRows(rows: RawRow[]): Map<string, SkuData> {
  const map = new Map<string, SkuData>();
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const todayTs = today.getTime();

  // Cache parsed dates by unique date string — many rows share the same date,
  // so this reduces parseFlexibleDate + new Date() calls from N to unique_dates
  const parsedDateCache = new Map<string, { parsedDate: string; ts: number }>();
  const getCachedDate = (dateStr: string) => {
    let entry = parsedDateCache.get(dateStr);
    if (!entry) {
      const parsedDate = parseFlexibleDate(dateStr) ?? dateStr;
      entry = { parsedDate, ts: new Date(parsedDate).getTime() };
      parsedDateCache.set(dateStr, entry);
    }
    return entry;
  };

  // Pre-extract timestamps into a numeric array so the sort comparator does
  // pure number subtraction instead of Map lookups on every comparison
  const timestamps = rows.map(row => getCachedDate(row.date).ts);
  const indices = Array.from({ length: rows.length }, (_, i) => i);
  indices.sort((a, b) => timestamps[a] - timestamps[b]);
  const sorted = indices.map(i => rows[i]);

  for (const row of sorted) {
    // 1b) Filter out future dates
    const { parsedDate, ts: dateTs } = getCachedDate(row.date);
    if (dateTs > todayTs) continue; // skip future dates

    // 1d) Negative unit_price → treat as 0
    const rawPrice = Number(row.unit_price);
    const unitPrice = (!isNaN(rawPrice) && rawPrice >= 0) ? rawPrice : 0;

    // 1e/1f) Lead time: 0 or blank = missing (kept as 0), >365 capped
    const rawLeadTime = Number(row.lead_time_days);
    let leadTime = (!isNaN(rawLeadTime) && rawLeadTime > 0) ? rawLeadTime : 0;
    const leadTimeClamped = leadTime > 365;
    if (leadTime > 365) leadTime = 365;

    const sale: SaleRecord = {
      sku: row.sku,
      date: parsedDate,
      sold_qty: Math.max(0, Number(row.sold_qty) || 0),
      partner_id: row.partner_id,
    };

    const existing = map.get(row.sku);

    // Parse multi-currency fields from row — only when data is present
    const rawSellingHuf = row.selling_price_huf != null ? parseFloat(String(row.selling_price_huf)) : NaN;
    const sellingPriceHuf = (!isNaN(rawSellingHuf) && rawSellingHuf > 0) ? rawSellingHuf : undefined;
    const rawPurchaseCurrency = row.purchase_currency ? String(row.purchase_currency).toUpperCase().trim() : '';
    const purchaseCurrency: 'USD' | 'EUR' = rawPurchaseCurrency === 'USD' ? 'USD' : 'EUR';

    // Parse price breaks — skip entirely when first price break is absent
    const purchasePrices: Array<{ qty: number; price: number }> = [];
    const rowRecord = row as unknown as Record<string, string | number | undefined>;
    if (rowRecord['purchase_price_1'] != null) for (let i = 1; i <= 8; i++) {
      const p = parseFloat(String(rowRecord[`purchase_price_${i}`] ?? ''));
      const q = parseFloat(String(rowRecord[`purchase_qty_${i}`] ?? ''));
      if (!isNaN(p) && p > 0) {
        purchasePrices.push({ qty: (!isNaN(q) && q > 0) ? q : (i === 1 ? 1 : 0), price: p });
      }
    }

    if (existing) {
      const parsedStock = Number(row.stock_qty);
      existing.stock_qty = (isFinite(parsedStock) && parsedStock >= 0) ? parsedStock : existing.stock_qty;
      existing.lead_time_days = leadTime;
      existing.leadTimeClamped = leadTimeClamped || !!existing.leadTimeClamped;
      const parsedOrdered = Number(row.ordered_qty);
      existing.ordered_qty = (isFinite(parsedOrdered) && parsedOrdered >= 0) ? parsedOrdered : existing.ordered_qty;
      existing.expected_delivery_date = row.expected_delivery_date
        ? (parseFlexibleDate(row.expected_delivery_date) ?? row.expected_delivery_date)
        : existing.expected_delivery_date;
      existing.unit_price = unitPrice || existing.unit_price;
      // Update multi-currency fields (latest row wins)
      if (sellingPriceHuf !== undefined) existing.selling_price_huf = sellingPriceHuf;
      existing.purchase_currency = purchaseCurrency;
      if (purchasePrices.length > 0) existing.purchase_prices = purchasePrices;
      existing.sales.push(sale);
    } else {
      map.set(row.sku, {
        sku: row.sku,
        sku_name: row.sku_name?.trim() || row.sku,
        supplier: row.supplier?.trim() || 'Unknown',
        category: row.category?.trim() || 'Uncategorized',
        unit_price: unitPrice,
        stock_qty: Math.max(0, isFinite(Number(row.stock_qty)) ? Number(row.stock_qty) : 0),
        lead_time_days: leadTime,
        leadTimeClamped: leadTimeClamped,
        ordered_qty: Math.max(0, isFinite(Number(row.ordered_qty)) ? Number(row.ordered_qty) : 0),
        expected_delivery_date: row.expected_delivery_date
          ? (parseFlexibleDate(row.expected_delivery_date) ?? row.expected_delivery_date)
          : '',
        sales: [sale],
        supplierOptions: [],
        selling_price_huf: sellingPriceHuf ?? null,
        purchase_currency: purchaseCurrency,
        purchase_prices: purchasePrices.length > 0 ? purchasePrices : undefined,
      });
    }
  }

  return map;
}

/** Compute EWMA from daily sales sorted ascending by date */
export function ewmaDemand(dailySales: { date: string; qty: number }[], alpha: number): number {
  if (dailySales.length === 0) return 0;
  const safeAlpha = Math.min(1, Math.max(0.01, alpha || 0.3));
  const sorted = [...dailySales].sort((a, b) => a.date.localeCompare(b.date));
  let s = sorted[0].qty;
  for (let i = 1; i < sorted.length; i++) {
    s = safeAlpha * sorted[i].qty + (1 - safeAlpha) * s;
  }
  return Math.max(0, s);
}

export function analyzeSkus(
  skuMap: Map<string, SkuData>,
  startDate: Date,
  endDate: Date,
  demandDays: number,
  serviceFactor: number = 1.65,
  thresholds: ClassificationThresholds = DEFAULT_THRESHOLDS,
  costSettings: CostSettings = DEFAULT_COST_SETTINGS,
  fxRates: FxRateConfig = FALLBACK_RATES,
): SkuAnalysis[] {
  const analyses: SkuAnalysis[] = [];
  const abcACutoff = thresholds.abcA / 100;
  const abcBCutoff = thresholds.abcB / 100;
  const globalServiceLevel = Object.entries(SERVICE_LEVELS).find(([, v]) => Math.abs(v - serviceFactor) < 0.01)?.[0] || '95%';
  const xyzXThreshold = Number.isFinite(thresholds.xyzX) && thresholds.xyzX >= 0 ? thresholds.xyzX : DEFAULT_THRESHOLDS.xyzX;
  const xyzYThreshold = Number.isFinite(thresholds.xyzY) && thresholds.xyzY >= 0 ? thresholds.xyzY : DEFAULT_THRESHOLDS.xyzY;

  const today = new Date();
  today.setHours(23, 59, 59, 999);

  // Pre-build a date string → timestamp cache across all SKUs to avoid
  // repeated Date allocations in the filter and trend loops
  const startTs = startDate.getTime();
  const endTs = endDate.getTime();
  const dateCache = new Map<string, number>();
  for (const [, sku] of skuMap) {
    for (const s of sku.sales) {
      if (!dateCache.has(s.date)) dateCache.set(s.date, new Date(s.date).getTime());
    }
  }

  for (const [, sku] of skuMap) {
    const filteredSales = sku.sales.filter(s => {
      const ts = dateCache.get(s.date) ?? new Date(s.date).getTime();
      return ts >= startTs && ts <= endTs;
    });

    // ─── Capability detection ───
    const hasDemandHistory = filteredSales.some(s => s.sold_qty > 0);
    const hasStockData = sku.stock_qty !== undefined && !isNaN(sku.stock_qty);
    const hasLeadTime = sku.lead_time_days > 0;
    const hasPrice = sku.unit_price > 0;
    const hasOrderData = sku.ordered_qty !== undefined && !isNaN(sku.ordered_qty);

    const tier: SkuCapability['tier'] =
      hasDemandHistory && hasStockData && hasLeadTime && hasPrice ? 'full' :
      hasDemandHistory && hasStockData && hasLeadTime ? 'partial' :
      hasStockData && !hasDemandHistory ? 'stock-only' :
      hasDemandHistory && !hasStockData ? 'sales-only' : 'minimal';

    const capability: SkuCapability = { hasDemandHistory, hasStockData, hasLeadTime, hasPrice, hasOrderData, tier };

    // 1g) No stock data detection
    const noStockData = !hasStockData || (sku.stock_qty === 0 && !hasDemandHistory);

    // 2a) Insufficient data: count actual unique sales days
    const uniqueSalesDays = new Set(filteredSales.map(s => s.date)).size;
    const safeDemandDays = Math.max(1, demandDays);
    const insufficientData = uniqueSalesDays < safeDemandDays * INSUFFICIENT_DATA_THRESHOLD;
    // Use actual coverage for avg calculation if insufficient
    const effectiveDemandDays = insufficientData && uniqueSalesDays > 0 ? Math.max(uniqueSalesDays, 1) : safeDemandDays;

    const totalSold = filteredSales.reduce((sum, s) => sum + s.sold_qty, 0);
    const avg_daily_demand = hasDemandHistory ? totalSold / effectiveDemandDays : 0;

    const dailyMap = new Map<string, number>();
    filteredSales.forEach(s => {
      dailyMap.set(s.date, (dailyMap.get(s.date) || 0) + s.sold_qty);
    });
    const dailyValues = Array.from(dailyMap.values());
    // Pad with zeros to fill the demand window
    while (dailyValues.length < demandDays) dailyValues.push(0);

    const mean = dailyValues.length > 0 ? dailyValues.reduce((s, v) => s + v, 0) / dailyValues.length : 0;
    const variance = dailyValues.length > 0 ? dailyValues.reduce((s, v) => s + (v - mean) ** 2, 0) / dailyValues.length : 0;
    let std_dev = Math.sqrt(variance);

    // 2b) Single record: conservative estimate
    const singleRecordEstimate = filteredSales.length === 1;
    if (singleRecordEstimate && avg_daily_demand > 0) {
      std_dev = avg_daily_demand * SINGLE_RECORD_STD_DEV_FACTOR;
    }

    // 2d) EWMA with < 3 data points falls back to simple
    const dailySalesForEwma = Array.from(dailyMap.entries()).map(([date, qty]) => ({ date, qty }));
    const ewmaFallback = costSettings.ewmaEnabled && dailySalesForEwma.length < 3;
    const avg_daily_demand_ewma = ewmaFallback ? avg_daily_demand : ewmaDemand(dailySalesForEwma, costSettings.ewmaAlpha);
    const demandMethod: 'simple' | 'ewma' = (costSettings.ewmaEnabled && !ewmaFallback) ? 'ewma' : 'simple';
    const effectiveDemand = demandMethod === 'ewma' ? avg_daily_demand_ewma : avg_daily_demand;

    // 2c) Dead stock: zero demand but has stock
    const dead_stock = avg_daily_demand === 0 && sku.stock_qty > 0;

    // 2e) Past due orders: exclude from effective_stock
    let pastDueOrders = false;
    let effectiveOrdered = sku.ordered_qty;
    if (sku.expected_delivery_date) {
      const deliveryDate = new Date(sku.expected_delivery_date);
      if (deliveryDate.getTime() < today.getTime()) {
        pastDueOrders = true;
        effectiveOrdered = 0; // order likely already arrived
      }
    }

    // 1h) Overdue delivery flag
    const overdueDelivery = pastDueOrders;

    // Lead time clamping flags
    const leadTimeClamped = sku.leadTimeClamped ?? false;

    // ─── Conditional calculations based on capability ───

    // Safety stock: only if hasLeadTime && hasDemandHistory
    const supplierStats = costSettings.supplierLeadTimeStats[sku.supplier];
    let safety_stock: number | null = null;
    let safetyStockFormula: 'simple' | 'full' = 'simple';
    let safetyStockCapped = false;

    if (hasLeadTime && hasDemandHistory) {
      if (supplierStats && supplierStats.stdDevLeadTime > 0) {
        const lt = supplierStats.avgLeadTimeActual || sku.lead_time_days;
        const sigmaD = std_dev;
        const sigmaLT = supplierStats.stdDevLeadTime;
        safety_stock = serviceFactor * Math.sqrt(lt * sigmaD ** 2 + effectiveDemand ** 2 * sigmaLT ** 2);
        safetyStockFormula = 'full';
      } else {
        safety_stock = serviceFactor * std_dev * Math.sqrt(sku.lead_time_days);
      }

      // 2f) Safety stock cap
      const ssMax = effectiveDemand * sku.lead_time_days;
      if (ssMax > 0 && safety_stock! > ssMax) {
        safety_stock = ssMax;
        safetyStockCapped = true;
      }
    }

    // Reorder point: only if hasLeadTime && hasDemandHistory
    let reorder_point: number | null = null;
    if (hasLeadTime && hasDemandHistory && safety_stock !== null) {
      const effectiveLeadTime = Math.max(0, supplierStats?.avgLeadTimeActual || sku.lead_time_days);
      reorder_point = effectiveDemand * effectiveLeadTime + safety_stock;
    }

    const effective_stock = (hasStockData ? sku.stock_qty : 0) + effectiveOrdered;

    // Days of stock: only if hasStockData && hasDemandHistory && avg > 0
    let days_of_stock: number | null = null;
    if (hasStockData && hasDemandHistory && effectiveDemand > 0) {
      days_of_stock = effective_stock / effectiveDemand;
    } else if (hasStockData && effective_stock > 0) {
      days_of_stock = Infinity;
    }

    const total_revenue = totalSold * sku.unit_price;
    const cv = mean > 0 ? std_dev / mean : 0;

    // XYZ class: only if hasDemandHistory with >= 3 records
    const xyz_class: XyzClass = (hasDemandHistory && filteredSales.length >= 3)
      ? (cv < xyzXThreshold ? 'X' : cv <= xyzYThreshold ? 'Y' : 'Z')
      : 'N/A';

    // ─── Trend & Seasonality ─────────────────────────────────────
    const now = endDate.getTime();
    const ms30 = 30 * 86_400_000;

    let soldLast30 = 0;
    let soldPrior30 = 0;

    for (const s of filteredSales) {
      const t = dateCache.get(s.date) ?? new Date(s.date).getTime();
      if (t >= now - ms30) {
        soldLast30 += s.sold_qty;
      } else if (t >= now - 2 * ms30) {
        soldPrior30 += s.sold_qty;
      }
    }
    const daysLast30 = 30;
    const daysPrior30 = 30;

    const avgLast30 = soldLast30 / daysLast30;
    const avgPrior30 = soldPrior30 / daysPrior30;

    let trendPct = 0;
    if (avgPrior30 > 0) {
      trendPct = ((avgLast30 - avgPrior30) / avgPrior30) * 100;
    } else if (avgLast30 > 0) {
      trendPct = 100;
    }

    const trend: TrendDirection = trendPct > TREND_THRESHOLD_PCT ? 'rising' : trendPct < -TREND_THRESHOLD_PCT ? 'falling' : 'stable';

    const seasonalityPct = avg_daily_demand > 0
      ? ((avgLast30 / avg_daily_demand) - 1) * 100
      : 0;
    const seasonalityFlag = avg_daily_demand > 0 && avgLast30 > avg_daily_demand * 1.5;

    // ─── Shelf life vs lead time (2i) ────────────────────────────
    const shelfLifeDays = costSettings.shelfLifeEnabled
      ? (costSettings.categoryShelfLifeDays[sku.category] ?? costSettings.categoryShelfLifeDays['Default'] ?? 9999)
      : 9999;
    const shelfLifeLtWarning = costSettings.shelfLifeEnabled && shelfLifeDays < sku.lead_time_days;

    // ─── Cost calculations ─────────────────────────────────────
    let holdingCost = 0;
    let storageCost = 0;
    let stockoutRisk = 0;
    let obsolescenceCost = 0;

    if (costSettings.holdingCostEnabled) {
      holdingCost = sku.stock_qty * sku.unit_price * (costSettings.annualInterestRate / 100);
    }

    if (costSettings.storageCostEnabled && costSettings.unitsPerPallet > 0) {
      const pallets = sku.stock_qty / costSettings.unitsPerPallet;
      storageCost = pallets * costSettings.storageCostPerPalletPerMonth;
    }

    if (costSettings.stockoutCostEnabled && days_of_stock !== null && days_of_stock !== Infinity && days_of_stock < sku.lead_time_days) {
      const shortfallDays = Math.max(0, sku.lead_time_days - days_of_stock);
      const lostSales = shortfallDays * avg_daily_demand * sku.unit_price;
      stockoutRisk = lostSales * (costSettings.defaultMarginPct / 100);
    }

    if (costSettings.obsolescenceCostEnabled) {
      const rate = costSettings.categoryObsolescenceRates[sku.category] ?? 0;
      obsolescenceCost = sku.stock_qty * sku.unit_price * (rate / 100);
    }

    const totalCarryingCost = holdingCost + (storageCost * 12) + obsolescenceCost;
    const annualOrderingCost = avg_daily_demand > 0
      ? ((avg_daily_demand * 365) / Math.max(1, effective_stock)) *
        (costSettings.orderingCostEnabled
          ? (costSettings.supplierOrderingCosts[sku.supplier] ?? costSettings.defaultOrderingCost)
          : 50)
      : 0;
    const tco = totalCarryingCost + annualOrderingCost;

    // Price break detection — 2h) Cap at 3× calculated reorder qty
    let priceBreakQty = 0;
    let priceBreakSaving = 0;
    if (costSettings.priceBreaksEnabled && reorder_point !== null) {
      const breaks = costSettings.priceBreaks[sku.sku];
      if (breaks && breaks.length > 0) {
        const baseQty = reorder_point * 2 - effective_stock;
        const maxBreakQty = baseQty * 3; // 2h) never suggest more than 3×
        const sortedBreaks = [...breaks].sort((a, b) => a.minQty - b.minQty);
        for (const brk of sortedBreaks) {
          if (baseQty > 0 && baseQty < brk.minQty && brk.minQty <= maxBreakQty) {
            const currentCost = baseQty * sku.unit_price;
            const breakCost = brk.minQty * brk.unitPrice;
            if (breakCost < currentCost) {
              priceBreakQty = brk.minQty;
              priceBreakSaving = currentCost - breakCost;
            }
          }
        }
      }
    }

    // Shelf life risk
    let shelfLifeRisk: 'none' | 'warning' | 'critical' = 'none';
    if (costSettings.shelfLifeEnabled && days_of_stock !== null && days_of_stock !== Infinity) {
      if (days_of_stock > shelfLifeDays) shelfLifeRisk = 'critical';
      else if (days_of_stock > shelfLifeDays * 0.75) shelfLifeRisk = 'warning';
    }

    // ─── Build price data from raw fields ─────────────────────────
    // Construct a row-like object for buildPriceData
    const latestRawForPrice: Record<string, unknown> = {
      unit_price: sku.unit_price,
      selling_price_huf: sku.selling_price_huf,
      purchase_currency: sku.purchase_currency,
    };
    // Copy price break fields from purchase_prices array
    if (sku.purchase_prices) {
      for (let i = 0; i < sku.purchase_prices.length && i < 8; i++) {
        latestRawForPrice[`purchase_price_${i + 1}`] = sku.purchase_prices[i].price;
        latestRawForPrice[`purchase_qty_${i + 1}`] = sku.purchase_prices[i].qty;
      }
    }

    const suggestedQty = (reorder_point !== null)
      ? getSuggestedOrderQty(reorder_point, effective_stock)
      : 0;
    const priceData = buildPriceData(latestRawForPrice, suggestedQty, fxRates);

    analyses.push({
      ...sku,
      avg_daily_demand,
      avg_daily_demand_ewma,
      demandMethod,
      std_dev,
      safety_stock,
      safetyStockFormula,
      effectiveServiceLevel: globalServiceLevel,
      reorder_point,
      effective_stock,
      days_of_stock,
      abc_class: 'C', // set below
      xyz_class,
      total_revenue,
      cv,
      trend,
      trendPct,
      seasonalityFlag,
      seasonalityPct,
      holdingCost,
      storageCost,
      stockoutRisk,
      obsolescenceCost,
      totalCarryingCost,
      tco,
      priceBreakQty,
      priceBreakSaving,
      shelfLifeDays,
      shelfLifeRisk,
      reserved_qty: 0,
      available_qty: sku.stock_qty,
      capability,
      priceData,
      // Edge case flags
      insufficientData,
      singleRecordEstimate,
      dead_stock,
      ewmaFallback,
      pastDueOrders,
      safetyStockCapped,
      noStockData: sku.stock_qty === 0,
      leadTimeClamped,
      shelfLifeLtWarning,
      overdueDelivery,
    });
  }

  // ─── ABC classification ────────────────────────────────────────
  // Only classify SKUs that have price AND demand history
  const classifiable = analyses.filter(a => a.capability.hasPrice && a.capability.hasDemandHistory);
  const nonClassifiable = analyses.filter(a => !a.capability.hasPrice || !a.capability.hasDemandHistory);
  for (const item of nonClassifiable) {
    item.abc_class = 'N/A';
    item.abcInfo = !item.capability.hasPrice ? 'Price data required for ABC' : 'Demand data required for ABC';
  }

  const sortedByRevenue = [...classifiable].sort((a, b) => b.total_revenue - a.total_revenue);
  const totalRevenue = sortedByRevenue.reduce((s, a) => s + a.total_revenue, 0);

  // 3c) All classifiable SKUs zero revenue
  if (totalRevenue === 0) {
    for (const item of classifiable) {
      item.abc_class = 'C';
      item.abcInfo = 'ABC classification requires unit_price data';
    }
  }
  // 3a) Single SKU → always A
  else if (classifiable.length === 1) {
    classifiable[0].abc_class = 'A';
  }
  // 3b) All SKUs equal revenue → distribute by count
  else if (sortedByRevenue.length > 1 && sortedByRevenue[0].total_revenue === sortedByRevenue[sortedByRevenue.length - 1].total_revenue) {
    const count = sortedByRevenue.length;
    const aCount = Math.max(1, Math.round(count * (thresholds.abcA / 100)));
    const bCount = Math.max(1, Math.round(count * ((thresholds.abcB - thresholds.abcA) / 100)));
    const eqMap = new Map<string, SkuAnalysis>(analyses.map(a => [a.sku, a]));
    for (let i = 0; i < sortedByRevenue.length; i++) {
      let abc: AbcClass = 'C';
      if (i < aCount) abc = 'A';
      else if (i < aCount + bCount) abc = 'B';
      const target = eqMap.get(sortedByRevenue[i].sku);
      if (target) {
        target.abc_class = abc;
        target.abcInfo = 'Equal revenue distribution detected — ABC by item count';
      }
    }
  } else {
    const revMap = new Map<string, SkuAnalysis>(analyses.map(a => [a.sku, a]));
    let cumulative = 0;
    for (const item of sortedByRevenue) {
      const pctBefore = totalRevenue > 0 ? cumulative / totalRevenue : 0;
      cumulative += item.total_revenue;
      let abc: AbcClass = 'C';
      if (pctBefore < abcACutoff) abc = 'A';
      else if (pctBefore < abcBCutoff) abc = 'B';
      const target = revMap.get(item.sku);
      if (target) target.abc_class = abc;
    }
  }

  // 3d) All SKUs same CV → add info
  const cvSet = new Set(analyses.map(a => a.xyz_class));
  if (cvSet.size === 1 && analyses.length > 1) {
    for (const item of analyses) {
      item.xyzInfo = 'Uniform demand variability';
    }
  }

  // ─── Pass 2: Per-ABC service level recalculation ────────────────
  if (costSettings.serviceLevelSettings.usePerClassServiceLevel) {
    const slMap: Record<string, string> = {
      A: costSettings.serviceLevelSettings.classA,
      B: costSettings.serviceLevelSettings.classB,
      C: costSettings.serviceLevelSettings.classC,
    };

    for (const item of analyses) {
      // Skip items that can't calculate safety stock
      if (!item.capability.hasLeadTime || !item.capability.hasDemandHistory) continue;
      if (item.abc_class === 'N/A') continue;

      const slKey = slMap[item.abc_class] || '95%';
      const z = SERVICE_LEVELS[slKey] ?? 1.65;
      item.effectiveServiceLevel = slKey;

      const effDemand = costSettings.ewmaEnabled ? item.avg_daily_demand_ewma : item.avg_daily_demand;
      const suppStats = costSettings.supplierLeadTimeStats[item.supplier];

      if (suppStats && suppStats.stdDevLeadTime > 0) {
        const lt = suppStats.avgLeadTimeActual || item.lead_time_days;
        item.safety_stock = z * Math.sqrt(lt * item.std_dev ** 2 + effDemand ** 2 * suppStats.stdDevLeadTime ** 2);
        item.safetyStockFormula = 'full';
      } else {
        item.safety_stock = z * item.std_dev * Math.sqrt(item.lead_time_days);
        item.safetyStockFormula = 'simple';
      }

      // Re-apply safety stock cap
      const ssMax2 = effDemand * item.lead_time_days;
      if (ssMax2 > 0 && item.safety_stock! > ssMax2) {
        item.safety_stock = ssMax2;
        item.safetyStockCapped = true;
      }

      const effLT = suppStats?.avgLeadTimeActual || item.lead_time_days;
      item.reorder_point = effDemand * effLT + item.safety_stock!;
    }
  }

  return analyses;
}

export function getSuggestedOrderQty(reorder_point: number, effective_stock: number, moq: number = 1): number {
  const raw = reorder_point * 2 - effective_stock;
  if (raw <= 0) return 0;
  const effectiveMoq = Math.max(1, moq);
  return Math.max(effectiveMoq, Math.ceil(raw / effectiveMoq) * effectiveMoq);
}

export function getUrgency(days_of_stock: number | null, lead_time_days: number): string {
  if (days_of_stock === null || !Number.isFinite(days_of_stock)) return 'Watch';
  if (days_of_stock < 7) return 'Critical';
  if (days_of_stock < lead_time_days) return 'Warning';
  return 'Watch';
}
