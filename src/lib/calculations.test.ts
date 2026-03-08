import { describe, it, expect } from "vitest";
import { parseRows, analyzeSkus } from "./calculations";
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
