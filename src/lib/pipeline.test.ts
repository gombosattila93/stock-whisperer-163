import { describe, it, expect } from "vitest";
import { parseCsvString } from "./csvUtils";
import { parseRows, analyzeSkus } from "./calculations";

describe("Full pipeline: CSV → parseRows → analyzeSkus", () => {
  const csv = `sku,sku_name,supplier,category,date,partner_id,sold_qty,unit_price,stock_qty,lead_time_days,ordered_qty,expected_delivery_date
HIGH-A,High Revenue Widget,SupA,Cat1,2026-01-05,P1,100,50.00,200,10,0,
HIGH-A,High Revenue Widget,SupA,Cat1,2026-01-15,P1,120,50.00,200,10,0,
HIGH-A,High Revenue Widget,SupA,Cat1,2026-02-01,P1,110,50.00,200,10,0,
HIGH-A,High Revenue Widget,SupA,Cat1,2026-02-15,P1,130,50.00,200,10,0,
MED-B,Medium Part,SupB,Cat2,2026-01-10,P2,30,10.00,500,14,100,2026-04-01
MED-B,Medium Part,SupB,Cat2,2026-01-25,P2,25,10.00,500,14,100,2026-04-01
MED-B,Medium Part,SupB,Cat2,2026-02-10,P2,35,10.00,500,14,100,2026-04-01
MED-B,Medium Part,SupB,Cat2,2026-02-25,P2,28,10.00,500,14,100,2026-04-01
LOW-C,Low Value Item,SupA,Cat1,2026-01-08,P1,5,0.50,10000,7,0,
LOW-C,Low Value Item,SupA,Cat1,2026-02-08,P1,3,0.50,10000,7,0,
LOW-C,Low Value Item,SupA,Cat1,2026-03-01,P1,4,0.50,10000,7,0,
DEAD-D,Dead Stock Part,SupC,Cat3,2026-01-01,P1,0,2.00,800,5,0,
NO-LT,No Lead Time SKU,SupB,Cat2,2026-01-20,P2,20,5.00,100,,0,
NO-LT,No Lead Time SKU,SupB,Cat2,2026-02-15,P2,15,5.00,100,,0,
NO-LT,No Lead Time SKU,SupB,Cat2,2026-03-01,P2,25,5.00,100,,0,`;

  it("processes 5 SKUs through the full pipeline", async () => {
    const rawRows = await parseCsvString(csv);
    expect(rawRows.length).toBe(15);

    const skuMap = parseRows(rawRows);
    expect(skuMap.size).toBe(5);

    const results = analyzeSkus(
      skuMap,
      new Date("2026-01-01"),
      new Date("2026-03-08"),
      90,
      1.65,
    );
    expect(results).toHaveLength(5);

    // ─── ABC classification ───
    const highA = results.find(r => r.sku === "HIGH-A")!;
    const medB = results.find(r => r.sku === "MED-B")!;
    const lowC = results.find(r => r.sku === "LOW-C")!;
    const deadD = results.find(r => r.sku === "DEAD-D")!;
    const noLt = results.find(r => r.sku === "NO-LT")!;

    // HIGH-A has most revenue (460 * 50 = 23000), should be A
    expect(highA.abc_class).toBe("A");
    expect(highA.total_revenue).toBe(23000);

    // MED-B revenue = 118 * 10 = 1180
    expect(medB.total_revenue).toBe(1180);

    // LOW-C revenue = 12 * 0.50 = 6
    expect(lowC.total_revenue).toBe(6);

    // ─── Dead stock ───
    expect(deadD.dead_stock).toBe(true);
    expect(deadD.avg_daily_demand).toBe(0);
    expect(deadD.stock_qty).toBe(800);

    // ─── Capability tiers ───
    expect(highA.capability.tier).toBe("full");
    // NO-LT: lead_time_days is empty string from CSV → Number("") || 0 = 0 → hasLeadTime false
    // But stock_qty=100 from CSV → Number("100") || 0 = 100 → hasStockData true
    // Has demand (sold_qty > 0) and has price → hasDemandHistory=true, hasPrice=true
    // So: hasDemandHistory && hasStockData && !hasLeadTime → falls through to partial? No.
    // tier logic: full needs all 4, partial needs demand+stock+leadTime, stock-only needs stock+!demand
    // NO-LT: hasDemandHistory=true, hasStockData=true, hasLeadTime=false → not full, not partial
    // → hasDemandHistory && !hasStockData? no. → minimal? Actually it falls to minimal.
    // But wait: the CSV has lead_time_days as empty, Number("") = NaN, NaN || 0 = 0, so lead_time=0
    // hasLeadTime = lead_time_days > 0 = false
    // Not full (needs hasLeadTime), not partial (needs hasLeadTime), 
    // not stock-only (hasDemandHistory is true), not sales-only (hasStockData is true) → minimal
    expect(noLt.capability.hasLeadTime).toBe(false);
    expect(noLt.capability.tier).toBe("minimal");
    expect(noLt.reorder_point).toBeNull();
    expect(noLt.safety_stock).toBeNull();

    // ─── Reorder point ───
    // HIGH-A: has lead time, demand, stock → should have reorder_point
    expect(highA.reorder_point).not.toBeNull();
    expect(highA.reorder_point).toBeGreaterThan(0);

    // MED-B: effective_stock = 500 + 100 = 600
    expect(medB.effective_stock).toBe(600);
    expect(medB.reorder_point).not.toBeNull();

    // LOW-C: high stock, low demand → large days_of_stock
    expect(lowC.days_of_stock).toBeGreaterThan(180);

    // ─── XYZ classification ───
    // HIGH-A has 4 records → calculable
    expect(highA.xyz_class).not.toBe("N/A");
    // DEAD-D has 1 record with qty=0 → N/A
    expect(deadD.xyz_class).toBe("N/A");
  });
});
