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

export interface SupplierOption {
  supplier: string;
  unit_price: number;
  lead_time_days: number;
  moq: number; // minimum order quantity
  price_breaks: { minQty: number; unitPrice: number }[];
  is_primary: boolean;
  reliability_score?: number; // 0-1
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
  supplierOptions: SupplierOption[];
}

export type AbcClass = 'A' | 'B' | 'C' | 'N/A';
export type XyzClass = 'X' | 'Y' | 'Z' | 'N/A';

export interface SkuCapability {
  hasDemandHistory: boolean;
  hasStockData: boolean;
  hasLeadTime: boolean;
  hasPrice: boolean;
  hasOrderData: boolean;
  tier: 'full' | 'partial' | 'stock-only' | 'sales-only' | 'minimal';
}
export type Urgency = 'Critical' | 'Warning' | 'Watch';

export type TrendDirection = 'rising' | 'falling' | 'stable';

export interface SkuAnalysis extends SkuData {
  avg_daily_demand: number;
  avg_daily_demand_ewma: number;
  demandMethod: 'simple' | 'ewma';
  std_dev: number;
  safety_stock: number;
  safetyStockFormula: 'simple' | 'full';
  effectiveServiceLevel: string; // '90%' | '95%' | '99%'
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
  // Cost fields (populated when cost settings are enabled)
  holdingCost: number;       // annual holding cost €
  storageCost: number;       // monthly storage cost €
  stockoutRisk: number;      // estimated stockout cost €
  obsolescenceCost: number;  // annual obsolescence cost €
  totalCarryingCost: number; // sum of all carrying costs €/year
  tco: number;               // total cost of ownership €/year
  priceBreakQty: number;     // 0 if no break, else the break threshold qty
  priceBreakSaving: number;  // €  saved by rounding up to price break
  // Shelf life
  shelfLifeDays: number;
  shelfLifeRisk: 'none' | 'warning' | 'critical';
  // Reservations
  reserved_qty: number;
  available_qty: number;
  // ─── Edge case flags ───
  insufficientData: boolean;      // actual sales days < demandDays × 0.3
  singleRecordEstimate: boolean;  // only 1 sale record → std_dev estimated
  dead_stock: boolean;            // avg_daily_demand === 0 AND stock_qty > 0
  ewmaFallback: boolean;          // EWMA requested but < 3 data points
  pastDueOrders: boolean;         // ordered_qty has past expected_delivery_date
  safetyStockCapped: boolean;     // safety stock was capped
  noStockData: boolean;           // stock_qty was missing for all rows
  leadTimeClamped: boolean;       // lead_time_days was clamped (0→1 or >365→365)
  shelfLifeLtWarning: boolean;    // shelf life < lead time
  overdueDelivery: boolean;       // expected_delivery_date is in the past
  // ABC/XYZ info flags
  abcInfo?: string;               // special classification info
  xyzInfo?: string;               // special classification info
}

export interface ProjectReservation {
  id: string;
  projectName: string;
  projectId: string;
  customer: string;
  dueDate: string;
  status: 'active' | 'fulfilled' | 'cancelled';
  items: { sku: string; reservedQty: number }[];
  createdAt: string;
}

export interface ImportSummary {
  totalRows: number;
  validRows: number;
  skippedRows: number;
  skippedReasons: { reason: string; count: number }[];
  detectedDateFormat: string;
  detectedEncoding: string;
  uniqueSkus: number;
  dateRange: { from: string; to: string };
  dataWarnings: string[];
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
