import { RawRow, SkuData, SkuAnalysis, SaleRecord, AbcClass, XyzClass, TrendDirection } from './types';
import { ClassificationThresholds, DEFAULT_THRESHOLDS } from './classificationTypes';
import { CostSettings, DEFAULT_COST_SETTINGS } from './costSettings';
import { parseFlexibleDate } from './dateUtils';

export const SERVICE_LEVELS: Record<string, number> = {
  '90%': 1.28,
  '95%': 1.65,
  '99%': 2.33,
};

export function parseRows(rows: RawRow[]): Map<string, SkuData> {
  const map = new Map<string, SkuData>();
  const sorted = [...rows].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  for (const row of sorted) {
    const existing = map.get(row.sku);
    const sale: SaleRecord = {
      sku: row.sku,
      date: parseFlexibleDate(row.date) ?? row.date,
      sold_qty: Math.max(0, Number(row.sold_qty) || 0),
      partner_id: row.partner_id,
    };

    if (existing) {
      const parsedStock = Number(row.stock_qty);
      existing.stock_qty = !isNaN(parsedStock) ? parsedStock : existing.stock_qty;
      const parsedLead = Number(row.lead_time_days);
      existing.lead_time_days = !isNaN(parsedLead) ? parsedLead : existing.lead_time_days;
      const parsedOrdered = Number(row.ordered_qty);
      existing.ordered_qty = !isNaN(parsedOrdered) ? parsedOrdered : existing.ordered_qty;
      existing.expected_delivery_date = row.expected_delivery_date
        ? (parseFlexibleDate(row.expected_delivery_date) ?? row.expected_delivery_date)
        : existing.expected_delivery_date;
      existing.unit_price = Number(row.unit_price) || existing.unit_price;
      existing.sales.push(sale);
    } else {
      map.set(row.sku, {
        sku: row.sku,
        sku_name: row.sku_name?.trim() || row.sku,
        supplier: row.supplier?.trim() || 'Unknown',
        category: row.category?.trim() || 'Uncategorized',
        unit_price: Number(row.unit_price) || 0,
        stock_qty: Number(row.stock_qty) || 0,
        lead_time_days: Number(row.lead_time_days) || 0,
        ordered_qty: Number(row.ordered_qty) || 0,
        expected_delivery_date: row.expected_delivery_date
          ? (parseFlexibleDate(row.expected_delivery_date) ?? row.expected_delivery_date)
          : '',
        sales: [sale],
        supplierOptions: [],
      });
    }
  }

  return map;
}

/** Compute EWMA from daily sales sorted ascending by date */
export function ewmaDemand(dailySales: { date: string; qty: number }[], alpha: number): number {
  if (dailySales.length === 0) return 0;
  const sorted = [...dailySales].sort((a, b) => a.date.localeCompare(b.date));
  let s = sorted[0].qty;
  for (let i = 1; i < sorted.length; i++) {
    s = alpha * sorted[i].qty + (1 - alpha) * s;
  }
  return s;
}

export function analyzeSkus(
  skuMap: Map<string, SkuData>,
  startDate: Date,
  endDate: Date,
  demandDays: number,
  serviceFactor: number = 1.65,
  thresholds: ClassificationThresholds = DEFAULT_THRESHOLDS,
  costSettings: CostSettings = DEFAULT_COST_SETTINGS,
): SkuAnalysis[] {
  const analyses: SkuAnalysis[] = [];
  const abcACutoff = thresholds.abcA / 100;
  const abcBCutoff = thresholds.abcB / 100;
  // Determine global service level string from factor
  const globalServiceLevel = Object.entries(SERVICE_LEVELS).find(([, v]) => Math.abs(v - serviceFactor) < 0.01)?.[0] || '95%';

  for (const [, sku] of skuMap) {
    const filteredSales = sku.sales.filter(s => {
      const d = new Date(s.date);
      return d >= startDate && d <= endDate;
    });

    const totalSold = filteredSales.reduce((sum, s) => sum + s.sold_qty, 0);
    const avg_daily_demand = totalSold / demandDays;

    const dailyMap = new Map<string, number>();
    filteredSales.forEach(s => {
      dailyMap.set(s.date, (dailyMap.get(s.date) || 0) + s.sold_qty);
    });
    const dailyValues = Array.from(dailyMap.values());
    while (dailyValues.length < demandDays) dailyValues.push(0);

    const mean = dailyValues.reduce((s, v) => s + v, 0) / dailyValues.length;
    const variance = dailyValues.reduce((s, v) => s + (v - mean) ** 2, 0) / dailyValues.length;
    const std_dev = Math.sqrt(variance);

    // EWMA demand
    const dailySalesForEwma = Array.from(dailyMap.entries()).map(([date, qty]) => ({ date, qty }));
    const avg_daily_demand_ewma = ewmaDemand(dailySalesForEwma, costSettings.ewmaAlpha);
    const demandMethod: 'simple' | 'ewma' = costSettings.ewmaEnabled ? 'ewma' : 'simple';
    const effectiveDemand = costSettings.ewmaEnabled ? avg_daily_demand_ewma : avg_daily_demand;

    // Safety stock with optional lead time variability
    const supplierStats = costSettings.supplierLeadTimeStats[sku.supplier];
    let safety_stock: number;
    let safetyStockFormula: 'simple' | 'full' = 'simple';

    if (supplierStats && supplierStats.stdDevLeadTime > 0) {
      // Full formula: Z × √(LT × σ_d² + d² × σ_LT²)
      const lt = supplierStats.avgLeadTimeActual || sku.lead_time_days;
      const sigmaD = std_dev;
      const sigmaLT = supplierStats.stdDevLeadTime;
      safety_stock = serviceFactor * Math.sqrt(lt * sigmaD ** 2 + effectiveDemand ** 2 * sigmaLT ** 2);
      safetyStockFormula = 'full';
    } else {
      safety_stock = serviceFactor * std_dev * Math.sqrt(sku.lead_time_days);
    }

    const effectiveLeadTime = supplierStats?.avgLeadTimeActual || sku.lead_time_days;
    const reorder_point = effectiveDemand * effectiveLeadTime + safety_stock;
    const effective_stock = sku.stock_qty + sku.ordered_qty;
    const days_of_stock = avg_daily_demand > 0 ? effective_stock / avg_daily_demand : Infinity;
    const total_revenue = totalSold * sku.unit_price;
    const cv = mean > 0 ? std_dev / mean : 0;

    const xyz_class: XyzClass = cv < thresholds.xyzX ? 'X' : cv <= thresholds.xyzY ? 'Y' : 'Z';

    // ─── Trend & Seasonality ─────────────────────────────────────
    const now = endDate.getTime();
    const ms30 = 30 * 86_400_000;

    // Sum sold_qty in last 30 days and prior 30 days
    let soldLast30 = 0;
    let soldPrior30 = 0;
    let daysLast30 = 0;
    let daysPrior30 = 0;

    for (const s of filteredSales) {
      const t = new Date(s.date).getTime();
      if (t >= now - ms30) {
        soldLast30 += s.sold_qty;
      } else if (t >= now - 2 * ms30) {
        soldPrior30 += s.sold_qty;
      }
    }
    // Count unique dates in each window for better daily averages
    const last30Dates = new Set<string>();
    const prior30Dates = new Set<string>();
    for (const s of filteredSales) {
      const t = new Date(s.date).getTime();
      if (t >= now - ms30) last30Dates.add(s.date);
      else if (t >= now - 2 * ms30) prior30Dates.add(s.date);
    }
    daysLast30 = 30; // normalise to 30 days
    daysPrior30 = 30;

    const avgLast30 = soldLast30 / daysLast30;
    const avgPrior30 = soldPrior30 / daysPrior30;

    let trendPct = 0;
    if (avgPrior30 > 0) {
      trendPct = ((avgLast30 - avgPrior30) / avgPrior30) * 100;
    } else if (avgLast30 > 0) {
      trendPct = 100; // went from 0 to something
    }

    const trend: TrendDirection = trendPct > 15 ? 'rising' : trendPct < -15 ? 'falling' : 'stable';

    const seasonalityPct = avg_daily_demand > 0
      ? ((avgLast30 / avg_daily_demand) - 1) * 100
      : 0;
    const seasonalityFlag = avg_daily_demand > 0 && avgLast30 > avg_daily_demand * 1.5;

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

    if (costSettings.stockoutCostEnabled && days_of_stock < sku.lead_time_days) {
      // Estimated lost sales during stockout period × margin
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

    // Price break detection
    let priceBreakQty = 0;
    let priceBreakSaving = 0;
    if (costSettings.priceBreaksEnabled) {
      const breaks = costSettings.priceBreaks[sku.sku];
      if (breaks && breaks.length > 0) {
        const baseQty = reorder_point * 2 - effective_stock;
        const sortedBreaks = [...breaks].sort((a, b) => a.minQty - b.minQty);
        for (const brk of sortedBreaks) {
          if (baseQty > 0 && baseQty < brk.minQty && brk.minQty <= baseQty * 1.15) {
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
    });
  }

  // ABC classification with configurable thresholds
  const sortedByRevenue = [...analyses].sort((a, b) => b.total_revenue - a.total_revenue);
  const totalRevenue = sortedByRevenue.reduce((s, a) => s + a.total_revenue, 0);
  let cumulative = 0;

  for (const item of sortedByRevenue) {
    const pctBefore = totalRevenue > 0 ? cumulative / totalRevenue : 0;
    cumulative += item.total_revenue;
    let abc: AbcClass = 'C';
    if (pctBefore < abcACutoff) abc = 'A';
    else if (pctBefore < abcBCutoff) abc = 'B';
    const target = analyses.find(a => a.sku === item.sku);
    if (target) target.abc_class = abc;
  }

  // ─── Pass 2: Per-ABC service level recalculation ────────────────
  if (costSettings.serviceLevelSettings.usePerClassServiceLevel) {
    const slMap: Record<string, string> = {
      A: costSettings.serviceLevelSettings.classA,
      B: costSettings.serviceLevelSettings.classB,
      C: costSettings.serviceLevelSettings.classC,
    };

    for (const item of analyses) {
      const slKey = slMap[item.abc_class] || '95%';
      const z = SERVICE_LEVELS[slKey] ?? 1.65;
      item.effectiveServiceLevel = slKey;

      const effectiveDemand = costSettings.ewmaEnabled ? item.avg_daily_demand_ewma : item.avg_daily_demand;
      const supplierStats = costSettings.supplierLeadTimeStats[item.supplier];

      if (supplierStats && supplierStats.stdDevLeadTime > 0) {
        const lt = supplierStats.avgLeadTimeActual || item.lead_time_days;
        item.safety_stock = z * Math.sqrt(lt * item.std_dev ** 2 + effectiveDemand ** 2 * supplierStats.stdDevLeadTime ** 2);
        item.safetyStockFormula = 'full';
      } else {
        item.safety_stock = z * item.std_dev * Math.sqrt(item.lead_time_days);
        item.safetyStockFormula = 'simple';
      }

      const effectiveLeadTime = supplierStats?.avgLeadTimeActual || item.lead_time_days;
      item.reorder_point = effectiveDemand * effectiveLeadTime + item.safety_stock;
    }
  }

  return analyses;
}

export function getSuggestedOrderQty(reorder_point: number, effective_stock: number): number {
  const raw = reorder_point * 2 - effective_stock;
  return raw > 0 ? Math.ceil(raw / 10) * 10 : 0;
}

export function getUrgency(days_of_stock: number, lead_time_days: number): string {
  if (days_of_stock < 7) return 'Critical';
  if (days_of_stock < lead_time_days) return 'Warning';
  return 'Watch';
}
