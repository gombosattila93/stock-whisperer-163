import { RawRow, SkuData, SkuAnalysis, SaleRecord, AbcClass, XyzClass, TrendDirection } from './types';
import { ClassificationThresholds, DEFAULT_THRESHOLDS } from './classificationTypes';
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
      });
    }
  }

  return map;
}

export function analyzeSkus(
  skuMap: Map<string, SkuData>,
  startDate: Date,
  endDate: Date,
  demandDays: number,
  serviceFactor: number = 1.65,
  thresholds: ClassificationThresholds = DEFAULT_THRESHOLDS
): SkuAnalysis[] {
  const analyses: SkuAnalysis[] = [];
  const abcACutoff = thresholds.abcA / 100;
  const abcBCutoff = thresholds.abcB / 100;

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

    const safety_stock = serviceFactor * std_dev * Math.sqrt(sku.lead_time_days);
    const reorder_point = avg_daily_demand * sku.lead_time_days + safety_stock;
    const effective_stock = sku.stock_qty + sku.ordered_qty;
    const days_of_stock = avg_daily_demand > 0 ? effective_stock / avg_daily_demand : Infinity;
    const total_revenue = totalSold * sku.unit_price;
    const cv = mean > 0 ? std_dev / mean : 0;

    const xyz_class: XyzClass = cv < thresholds.xyzX ? 'X' : cv <= thresholds.xyzY ? 'Y' : 'Z';

    analyses.push({
      ...sku,
      avg_daily_demand,
      std_dev,
      safety_stock,
      reorder_point,
      effective_stock,
      days_of_stock,
      abc_class: 'C', // set below
      xyz_class,
      total_revenue,
      cv,
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
