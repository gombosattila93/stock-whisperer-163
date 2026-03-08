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

export type AbcClass = 'A' | 'B' | 'C';
export type XyzClass = 'X' | 'Y' | 'Z';
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
