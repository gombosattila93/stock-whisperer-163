import { describe, it, expect } from "vitest";
import { parseRows, analyzeSkus, getSuggestedOrderQty, getUrgency } from "./calculations";
import { RawRow, SkuData } from "./types";

const makeRow = (overrides: Partial<RawRow> = {}): RawRow => ({
  sku: "SKU-001",
  sku_name: "Test SKU",
  supplier: "TestCo",
  category: "Parts",
  date: "2026-01-01",
  partner_id: "P001",
  sold_qty: 10,
  unit_price: 1.0,
  stock_qty: 100,
  lead_time_days: 7,
  ordered_qty: 50,
  expected_delivery_date: "2026-02-01",
  ...overrides,
});

describe("parseRows", () => {
  it("preserves zero stock_qty", () => {
    const rows = [makeRow({ stock_qty: 0 })];
    const map = parseRows(rows);
    expect(map.get("SKU-001")!.stock_qty).toBe(0);
  });

  it("preserves zero lead_time_days", () => {
    const rows = [makeRow({ lead_time_days: 0 })];
    const map = parseRows(rows);
    expect(map.get("SKU-001")!.lead_time_days).toBe(0);
  });

  it("preserves zero ordered_qty", () => {
    const rows = [makeRow({ ordered_qty: 0 })];
    const map = parseRows(rows);
    expect(map.get("SKU-001")!.ordered_qty).toBe(0);
  });

  it("updates to zero on subsequent row", () => {
    const rows = [
      makeRow({ date: "2026-01-01", stock_qty: 100, ordered_qty: 50, lead_time_days: 7 }),
      makeRow({ date: "2026-01-02", stock_qty: 0, ordered_qty: 0, lead_time_days: 0 }),
    ];
    const map = parseRows(rows);
    const sku = map.get("SKU-001")!;
    expect(sku.stock_qty).toBe(0);
    expect(sku.ordered_qty).toBe(0);
    expect(sku.lead_time_days).toBe(0);
  });

  it("keeps previous value when field is NaN", () => {
    const rows = [
      makeRow({ date: "2026-01-01", stock_qty: 100 }),
      makeRow({ date: "2026-01-02", stock_qty: NaN }),
    ];
    const map = parseRows(rows);
    expect(map.get("SKU-001")!.stock_qty).toBe(100);
  });
});

describe("parseRows — negative sold_qty clamping", () => {
  it("clamps negative sold_qty to 0", () => {
    const rows = [makeRow({ sold_qty: -5 })];
    const map = parseRows(rows);
    const sale = map.get("SKU-001")!.sales[0];
    expect(sale.sold_qty).toBe(0);
  });

  it("preserves positive sold_qty unchanged", () => {
    const rows = [makeRow({ sold_qty: 10 })];
    const map = parseRows(rows);
    expect(map.get("SKU-001")!.sales[0].sold_qty).toBe(10);
  });

  it("preserves zero sold_qty", () => {
    const rows = [makeRow({ sold_qty: 0 })];
    const map = parseRows(rows);
    expect(map.get("SKU-001")!.sales[0].sold_qty).toBe(0);
  });

  it("clamps multiple negative rows across same SKU", () => {
    const rows = [
      makeRow({ date: "2026-01-01", sold_qty: -10 }),
      makeRow({ date: "2026-01-02", sold_qty: -3 }),
      makeRow({ date: "2026-01-03", sold_qty: 5 }),
    ];
    const map = parseRows(rows);
    const sales = map.get("SKU-001")!.sales;
    expect(sales[0].sold_qty).toBe(0);
    expect(sales[1].sold_qty).toBe(0);
    expect(sales[2].sold_qty).toBe(5);
  });

  it("treats NaN sold_qty as 0", () => {
    const rows = [makeRow({ sold_qty: NaN })];
    const map = parseRows(rows);
    expect(map.get("SKU-001")!.sales[0].sold_qty).toBe(0);
  });
});

// Helper: build a SkuData entry with a single sale
function makeSku(sku: string, unitPrice: number, soldQty: number): SkuData {
  return {
    sku,
    sku_name: sku,
    supplier: "TestCo",
    category: "Parts",
    unit_price: unitPrice,
    stock_qty: 100,
    lead_time_days: 7,
    ordered_qty: 0,
    expected_delivery_date: "2026-02-01",
    sales: [{ sku, date: "2026-01-15", sold_qty: soldQty, partner_id: "P001" }],
    supplierOptions: [],
  };
}

function runAbc(skus: SkuData[]) {
  const map = new Map(skus.map((s) => [s.sku, s]));
  return analyzeSkus(map, new Date("2026-01-01"), new Date("2026-01-31"), 31);
}

describe("ABC classification", () => {
  it("classifies single SKU as A", () => {
    const result = runAbc([makeSku("S1", 10, 100)]);
    expect(result[0].abc_class).toBe("A");
  });

  it("assigns A to top 80% revenue, B to next 15%, C to rest", () => {
    // Revenue: S1=800, S2=100, S3=50, S4=30, S5=20 → total=1000
    // Cumulative: S1 0%→80% (A), S2 80%→90% (B), S3 90%→95% (B), S4 95%→98% (C), S5 98%→100% (C)
    const skus = [
      makeSku("S1", 8, 100),   // 800
      makeSku("S2", 1, 100),   // 100
      makeSku("S3", 0.5, 100), // 50
      makeSku("S4", 0.3, 100), // 30
      makeSku("S5", 0.2, 100), // 20
    ];
    const result = runAbc(skus);
    const bySku = Object.fromEntries(result.map((r) => [r.sku, r.abc_class]));
    expect(bySku["S1"]).toBe("A");
    expect(bySku["S2"]).toBe("B");
    expect(bySku["S3"]).toBe("B");
    expect(bySku["S4"]).toBe("C");
    expect(bySku["S5"]).toBe("C");
  });

  it("item crossing 80% boundary is still A", () => {
    // Revenue: S1=79, S2=21 → total=100
    // S1: pctBefore=0% < 80% → A; S2: pctBefore=79% < 80% → A
    const skus = [
      makeSku("S1", 79, 1),
      makeSku("S2", 21, 1),
    ];
    const result = runAbc(skus);
    const bySku = Object.fromEntries(result.map((r) => [r.sku, r.abc_class]));
    expect(bySku["S1"]).toBe("A");
    expect(bySku["S2"]).toBe("A");
  });

  it("item at exactly 80% cumulative before is B", () => {
    // Revenue: S1=80, S2=15, S3=5 → total=100
    // S1: pctBefore=0% → A; S2: pctBefore=80% → B; S3: pctBefore=95% → C
    const skus = [
      makeSku("S1", 80, 1),
      makeSku("S2", 15, 1),
      makeSku("S3", 5, 1),
    ];
    const result = runAbc(skus);
    const bySku = Object.fromEntries(result.map((r) => [r.sku, r.abc_class]));
    expect(bySku["S1"]).toBe("A");
    expect(bySku["S2"]).toBe("B");
    expect(bySku["S3"]).toBe("C");
  });

  it("all SKUs with zero revenue default to A (pctBefore is 0)", () => {
    const skus = [makeSku("S1", 0, 0), makeSku("S2", 0, 0)];
    const result = runAbc(skus);
    result.forEach((r) => expect(r.abc_class).toBe("A"));
  });
});

// Helper: build SkuData with multiple daily sales for XYZ/safety stock testing
function makeSkuWithSales(
  sku: string,
  dailySales: number[],
  opts: { leadTime?: number; stockQty?: number; orderedQty?: number } = {}
): SkuData {
  const { leadTime = 7, stockQty = 100, orderedQty = 0 } = opts;
  return {
    sku,
    sku_name: sku,
    supplier: "TestCo",
    category: "Parts",
    unit_price: 1,
    stock_qty: stockQty,
    lead_time_days: leadTime,
    ordered_qty: orderedQty,
    expected_delivery_date: "2026-02-01",
    sales: dailySales.map((qty, i) => ({
      sku,
      date: `2026-01-${String(i + 1).padStart(2, "0")}`,
      sold_qty: qty,
      partner_id: "P001",
    })),
    supplierOptions: [],
  };
}

function runAnalysis(skus: SkuData[], demandDays?: number) {
  const days = demandDays ?? 31;
  const map = new Map(skus.map((s) => [s.sku, s]));
  return analyzeSkus(map, new Date("2026-01-01"), new Date("2026-01-31"), days);
}

describe("XYZ classification", () => {
  it("classifies steady demand as X (cv < 0.5)", () => {
    // All days sell 10 → std_dev ≈ 0, cv ≈ 0
    const sales = Array(31).fill(10);
    const result = runAnalysis([makeSkuWithSales("S1", sales)]);
    expect(result[0].xyz_class).toBe("X");
    expect(result[0].cv).toBeCloseTo(0, 5);
  });

  it("classifies moderate variability as Y (0.5 ≤ cv ≤ 1.0)", () => {
    // Alternate 0 and 20 over 31 days → mean ≈ 10, std ≈ 10 → cv ≈ 1.0
    // Use values that give cv between 0.5 and 1.0
    // e.g. alternate 5 and 15: mean=10, std=5, cv=0.5
    const sales = Array.from({ length: 31 }, (_, i) => (i % 2 === 0 ? 5 : 15));
    const result = runAnalysis([makeSkuWithSales("S1", sales)]);
    expect(result[0].xyz_class).toBe("Y");
    expect(result[0].cv).toBeGreaterThanOrEqual(0.5);
    expect(result[0].cv).toBeLessThanOrEqual(1.0);
  });

  it("classifies highly variable demand as Z (cv > 1.0)", () => {
    // Most days 0, one big spike → high cv
    const sales = Array(31).fill(0);
    sales[0] = 100;
    const result = runAnalysis([makeSkuWithSales("S1", sales)]);
    expect(result[0].xyz_class).toBe("Z");
    expect(result[0].cv).toBeGreaterThan(1.0);
  });

  it("classifies zero demand as X (cv = 0)", () => {
    const sales = Array(31).fill(0);
    const result = runAnalysis([makeSkuWithSales("S1", sales)]);
    expect(result[0].xyz_class).toBe("X");
    expect(result[0].cv).toBe(0);
  });
});

describe("safety stock and reorder point", () => {
  it("calculates safety stock as 1.65 × std_dev × sqrt(lead_time)", () => {
    // Constant demand of 10/day → std_dev = 0 → safety_stock = 0
    const sales = Array(31).fill(10);
    const result = runAnalysis([makeSkuWithSales("S1", sales, { leadTime: 9 })]);
    expect(result[0].safety_stock).toBeCloseTo(0, 5);
  });

  it("calculates non-zero safety stock with variable demand", () => {
    // Alternate 0 and 20: mean=~10, non-zero std_dev
    const sales = Array.from({ length: 31 }, (_, i) => (i % 2 === 0 ? 0 : 20));
    const leadTime = 4;
    const result = runAnalysis([makeSkuWithSales("S1", sales, { leadTime })]);

    // Manually compute expected values
    const mean = sales.reduce((a, b) => a + b, 0) / 31;
    const variance = sales.reduce((s, v) => s + (v - mean) ** 2, 0) / 31;
    const std_dev = Math.sqrt(variance);
    const expectedSafety = 1.65 * std_dev * Math.sqrt(leadTime);

    expect(result[0].safety_stock).toBeCloseTo(expectedSafety, 2);
  });

  it("calculates reorder_point = avg_daily_demand × lead_time + safety_stock", () => {
    const sales = Array(31).fill(10);
    const leadTime = 5;
    const result = runAnalysis([makeSkuWithSales("S1", sales, { leadTime })]);
    const avgDemand = (10 * 31) / 31; // = 10
    // std_dev ≈ 0, safety_stock ≈ 0
    expect(result[0].reorder_point).toBeCloseTo(avgDemand * leadTime, 2);
  });

  it("calculates effective_stock as stock_qty + ordered_qty", () => {
    const sales = Array(31).fill(5);
    const result = runAnalysis([
      makeSkuWithSales("S1", sales, { stockQty: 50, orderedQty: 30 }),
    ]);
    expect(result[0].effective_stock).toBe(80);
  });

  it("days_of_stock is Infinity when avg_daily_demand is 0", () => {
    const sales = Array(31).fill(0);
    const result = runAnalysis([makeSkuWithSales("S1", sales, { stockQty: 100 })]);
    expect(result[0].days_of_stock).toBe(Infinity);
  });

  it("days_of_stock = effective_stock / avg_daily_demand", () => {
    const sales = Array(31).fill(10);
    const result = runAnalysis([
      makeSkuWithSales("S1", sales, { stockQty: 50, orderedQty: 50 }),
    ]);
    // effective = 100, avg_daily = 10 → days = 10
    expect(result[0].days_of_stock).toBeCloseTo(10, 2);
  });
});

describe("getSuggestedOrderQty", () => {
  it("returns rounded-up order qty when stock is below reorder point", () => {
    // Formula: (reorder_point * 2 - effective_stock), rounded up to nearest 10
    // (100 * 2 - 50) = 150 → 150
    expect(getSuggestedOrderQty(100, 50)).toBe(150);
  });

  it("rounds up to nearest 10", () => {
    // (50 * 2 - 75) = 25 → ceil(25/10)*10 = 30
    expect(getSuggestedOrderQty(50, 75)).toBe(30);
  });

  it("returns 0 when effective_stock exceeds 2× reorder_point", () => {
    // (30 * 2 - 100) = -40 → 0
    expect(getSuggestedOrderQty(30, 100)).toBe(0);
  });

  it("returns 0 when effective_stock equals 2× reorder_point", () => {
    // (50 * 2 - 100) = 0 → 0
    expect(getSuggestedOrderQty(50, 100)).toBe(0);
  });

  it("handles zero reorder_point", () => {
    // (0 * 2 - 50) = -50 → 0
    expect(getSuggestedOrderQty(0, 50)).toBe(0);
  });

  it("handles zero effective_stock", () => {
    // (100 * 2 - 0) = 200 → 200
    expect(getSuggestedOrderQty(100, 0)).toBe(200);
  });
});

describe("getUrgency", () => {
  it("returns 'Critical' when days_of_stock < 7", () => {
    expect(getUrgency(0, 10)).toBe("Critical");
    expect(getUrgency(3, 10)).toBe("Critical");
    expect(getUrgency(6.9, 10)).toBe("Critical");
  });

  it("returns 'Warning' when days_of_stock >= 7 but < lead_time", () => {
    expect(getUrgency(7, 14)).toBe("Warning");
    expect(getUrgency(10, 14)).toBe("Warning");
    expect(getUrgency(13.9, 14)).toBe("Warning");
  });

  it("returns 'Watch' when days_of_stock >= lead_time", () => {
    expect(getUrgency(14, 14)).toBe("Watch");
    expect(getUrgency(30, 14)).toBe("Watch");
  });

  it("returns 'Critical' when days_of_stock < 7 even if lead_time is small", () => {
    expect(getUrgency(5, 3)).toBe("Critical");
  });

  it("returns 'Watch' for Infinity days_of_stock", () => {
    expect(getUrgency(Infinity, 14)).toBe("Watch");
  });
});
