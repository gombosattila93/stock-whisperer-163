export interface RawRow {
  sku: string;
  sku_name: string;
  supplier: string;
  category: string;
  date: string;
  partner_id: string;
  sold_qty: number;
  unit_price: number;
  stock_qty: number;
  lead_time_days: number;
  ordered_qty: number;
  expected_delivery_date: string;
}

export interface SaleRecord {
  sku: string;
  date: string;
  sold_qty: number;
  partner_id: string;
}

export interface SkuData {
  sku: string;
  sku_name: string;
  supplier: string;
  category: string;
  unit_price: number;
  stock_qty: number;
  lead_time_days: number;
  ordered_qty: number;
  expected_delivery_date: string;
  sales: SaleRecord[];
}

export type AbcClass = 'A' | 'B' | 'C';
export type XyzClass = 'X' | 'Y' | 'Z';
export type Urgency = 'Critical' | 'Warning' | 'Watch';

export type TrendDirection = 'rising' | 'falling' | 'stable';

export interface SkuAnalysis extends SkuData {
  avg_daily_demand: number;
  std_dev: number;
  safety_stock: number;
  reorder_point: number;
  effective_stock: number;
  days_of_stock: number;
  abc_class: AbcClass;
  xyz_class: XyzClass;
  total_revenue: number;
  cv: number;
  trend: TrendDirection;
  trendPct: number;
  seasonalityFlag: boolean;
  seasonalityPct: number;
}

export interface InventoryState {
  rawData: RawRow[];
  skuMap: Map<string, SkuData>;
  analysis: SkuAnalysis[];
  suppliers: string[];
  categories: string[];
  filterSupplier: string;
  filterCategory: string;
  dateRangeStart: Date;
  dateRangeEnd: Date;
  demandDays: number;
}
