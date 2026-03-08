import { describe, it, expect } from "vitest";
import { ropStrategy, eoqStrategy, minMaxStrategy, periodicStrategy, computeReorder, DEFAULT_EOQ_SETTINGS } from "./reorderStrategies";
import { SkuAnalysis } from "./types";

const makeSku = (overrides: Partial<SkuAnalysis> = {}): SkuAnalysis => ({
  sku: "SKU-001",
  sku_name: "Test",
  supplier: "TestCo",
  category: "Parts",
  unit_price: 10,
  stock_qty: 100,
  lead_time_days: 14,
  ordered_qty: 0,
  expected_delivery_date: "",
  sales: [],
  supplierOptions: [],
  avg_daily_demand: 5,
  avg_daily_demand_ewma: 5,
  demandMethod: "simple",
  std_dev: 2,
  safety_stock: 20,
  safetyStockFormula: "simple",
  effectiveServiceLevel: "95%",
  reorder_point: 90,
  effective_stock: 50,
  days_of_stock: 10,
  abc_class: "A",
  xyz_class: "Z",
  total_revenue: 1000,
  cv: 0.4,
  trend: "stable",
  trendPct: 0,
  seasonalityFlag: false,
  seasonalityPct: 0,
  holdingCost: 0,
  storageCost: 0,
  stockoutRisk: 0,
  obsolescenceCost: 0,
  totalCarryingCost: 0,
  tco: 0,
  priceBreakQty: 0,
  priceBreakSaving: 0,
  shelfLifeDays: 9999,
  shelfLifeRisk: "none",
  reserved_qty: 0,
  available_qty: 50,
  capability: { hasDemandHistory: true, hasStockData: true, hasLeadTime: true, hasPrice: true, hasOrderData: true, tier: "full" },
  insufficientData: false,
  singleRecordEstimate: false,
  dead_stock: false,
  ewmaFallback: false,
  pastDueOrders: false,
  safetyStockCapped: false,
  noStockData: false,
  leadTimeClamped: false,
  shelfLifeLtWarning: false,
  overdueDelivery: false,
  priceData: {
    sellingPriceHuf: null, sellingPriceEur: null, sellingPriceEstimated: false,
    purchaseCurrency: 'EUR', priceBreaks: [],
    basePurchasePriceEur: null, bestPurchasePriceEur: null, effectivePurchasePriceEur: null,
    marginEur: null, marginPct: null, marginAtBestBreakEur: null, marginAtBestBreakPct: null,
    hasPurchasePrice: false, hasSellingPrice: false, hasMarginData: false,
    nextPriceBreakQty: null, nextPriceBreakSaving: null,
  },
  ...overrides,
});

describe("eoqStrategy", () => {
  it("returns 0 for zero demand", () => {
    const sku = makeSku({ avg_daily_demand: 0 });
    const result = eoqStrategy(sku);
    expect(result.suggested_order_qty).toBe(0);
  });

  it("returns 0 for zero unit_price (holding cost = 0)", () => {
    const sku = makeSku({ unit_price: 0 });
    const result = eoqStrategy(sku);
    expect(result.suggested_order_qty).toBe(0);
  });

  it("calculates correct EOQ for normal case", () => {
    const sku = makeSku({ avg_daily_demand: 10, unit_price: 5 });
    const result = eoqStrategy(sku, { orderingCost: 50, holdingPct: 0.2 });
    // annual = 3650, holding = 1, eoq = sqrt(2*3650*50/1) = sqrt(365000) ≈ 604.15
    // ceil(604.15/10)*10 = 610
    expect(result.suggested_order_qty).toBe(610);
    expect(result.strategy).toBe("eoq");
  });
});

describe("minMaxStrategy", () => {
  it("returns qty to fill to max when stock below min", () => {
    const sku = makeSku({ reorder_point: 100, effective_stock: 30 });
    // max = 200, qty = ceil((200-30)/10)*10 = 170
    const result = minMaxStrategy(sku);
    expect(result.suggested_order_qty).toBe(170);
  });

  it("returns 0 when stock above max", () => {
    const sku = makeSku({ reorder_point: 100, effective_stock: 250 });
    const result = minMaxStrategy(sku);
    expect(result.suggested_order_qty).toBe(0);
  });

  it("returns qty when stock exactly at min", () => {
    const sku = makeSku({ reorder_point: 100, effective_stock: 100 });
    // max = 200, qty = ceil((200-100)/10)*10 = 100
    const result = minMaxStrategy(sku);
    expect(result.suggested_order_qty).toBe(100);
  });
});

describe("periodicStrategy", () => {
  it("calculates target for 14-day review period", () => {
    const sku = makeSku({ avg_daily_demand: 10, lead_time_days: 7, safety_stock: 20, effective_stock: 50 });
    // target = 10*(14+7)+20 = 230, qty = ceil((230-50)/10)*10 = 180
    const result = periodicStrategy(sku, 14);
    expect(result.suggested_order_qty).toBe(180);
  });

  it("calculates target for 7-day review period", () => {
    const sku = makeSku({ avg_daily_demand: 10, lead_time_days: 7, safety_stock: 20, effective_stock: 50 });
    // target = 10*(7+7)+20 = 160, qty = ceil((160-50)/10)*10 = 110
    const result = periodicStrategy(sku, 7);
    expect(result.suggested_order_qty).toBe(110);
  });

  it("returns 0 when stock exceeds target", () => {
    const sku = makeSku({ avg_daily_demand: 1, lead_time_days: 7, safety_stock: 5, effective_stock: 500 });
    const result = periodicStrategy(sku, 14);
    expect(result.suggested_order_qty).toBe(0);
  });
});

describe("computeReorder dispatches correctly", () => {
  it("dispatches to rop", () => {
    const result = computeReorder(makeSku(), "rop");
    expect(result.strategy).toBe("rop");
  });

  it("dispatches to eoq", () => {
    const result = computeReorder(makeSku(), "eoq");
    expect(result.strategy).toBe("eoq");
  });

  it("dispatches to minmax", () => {
    const result = computeReorder(makeSku(), "minmax");
    expect(result.strategy).toBe("minmax");
  });

  it("dispatches to periodic", () => {
    const result = computeReorder(makeSku(), "periodic");
    expect(result.strategy).toBe("periodic");
  });
});
