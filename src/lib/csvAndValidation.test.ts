import { describe, it, expect, vi } from "vitest";
import { parseFlexibleDate, detectDateFormat } from "./dateUtils";
import { validateCsvHeaders, validateCsvRows } from "./csvValidation";
import { fingerprint, partialFingerprint, analyzeDuplicates } from "./duplicateDetection";
import { RawRow } from "./types";

// ─── parseFlexibleDate ─────────────────────────────────────────

describe("parseFlexibleDate", () => {
  it("parses ISO format: 2025-03-08", () => {
    expect(parseFlexibleDate("2025-03-08")).toBe("2025-03-08");
  });

  it("parses ISO with time: 2025-03-08T14:30:00", () => {
    expect(parseFlexibleDate("2025-03-08T14:30:00")).toBe("2025-03-08");
  });

  it("parses Hungarian/European dot YMD: 2025.03.08", () => {
    expect(parseFlexibleDate("2025.03.08")).toBe("2025-03-08");
  });

  it("parses European dot DMY: 08.03.2025", () => {
    expect(parseFlexibleDate("08.03.2025")).toBe("2025-03-08");
  });

  it("parses European slash DMY: 08/03/2025", () => {
    expect(parseFlexibleDate("08/03/2025")).toBe("2025-03-08");
  });

  it("returns null for empty string", () => {
    expect(parseFlexibleDate("")).toBeNull();
  });

  it("returns null for whitespace only", () => {
    expect(parseFlexibleDate("   ")).toBeNull();
  });

  it("returns null for garbage input", () => {
    expect(parseFlexibleDate("not-a-date")).toBeNull();
  });

  it("trims whitespace before parsing", () => {
    expect(parseFlexibleDate("  2025-03-08  ")).toBe("2025-03-08");
  });
});

describe("detectDateFormat", () => {
  it("detects ISO format", () => {
    expect(detectDateFormat(["2025-01-01", "2025-02-15", "2025-03-08"])).toBe("ISO");
  });

  it("detects European dot DMY", () => {
    expect(detectDateFormat(["08.03.2025", "15.02.2025", "01.01.2025"])).toBe("EU-dot-DMY");
  });

  it("detects European dot YMD", () => {
    expect(detectDateFormat(["2025.03.08", "2025.02.15"])).toBe("EU-dot-YMD");
  });

  it("returns unknown for empty array", () => {
    expect(detectDateFormat([])).toBe("unknown");
  });
});

// ─── validateCsvHeaders ────────────────────────────────────────

describe("validateCsvHeaders", () => {
  it("passes with all required columns", () => {
    const result = validateCsvHeaders(["sku", "date", "sold_qty", "stock_qty"]);
    expect(result.valid).toBe(true);
    expect(result.missing).toHaveLength(0);
  });

  it("fails when required column missing", () => {
    const result = validateCsvHeaders(["sold_qty", "stock_qty"]);
    expect(result.valid).toBe(false);
    expect(result.missing).toContain("sku");
    expect(result.missing).toContain("date");
  });

  it("reports extra unknown columns", () => {
    const result = validateCsvHeaders(["sku", "date", "mystery_col"]);
    expect(result.valid).toBe(true);
    expect(result.extra).toContain("mystery_col");
  });

  it("normalizes header case", () => {
    const result = validateCsvHeaders(["SKU", "Date"]);
    expect(result.valid).toBe(true);
  });
});

// ─── validateCsvRows ───────────────────────────────────────────

describe("validateCsvRows", () => {
  it("returns error for zero rows", () => {
    const result = validateCsvRows([]);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("validates rows with required fields", () => {
    const result = validateCsvRows([
      { sku: "A", date: "2025-01-01", sold_qty: "10", unit_price: "1", stock_qty: "100", lead_time_days: "7", ordered_qty: "0" },
    ]);
    expect(result.valid).toBe(true);
    expect(result.rows).toHaveLength(1);
  });

  it("warns on negative sold_qty", () => {
    const result = validateCsvRows([
      { sku: "A", date: "2025-01-01", sold_qty: "-5", unit_price: "1", stock_qty: "100", lead_time_days: "7", ordered_qty: "0" },
    ]);
    expect(result.valid).toBe(true);
    expect(result.warnings.some(w => w.includes("negative sold_qty"))).toBe(true);
  });

  it("reports missing required fields as errors", () => {
    const result = validateCsvRows([
      { sold_qty: "10", stock_qty: "100" }, // missing sku, date
    ]);
    // Should fail because sku is required
    expect(result.valid).toBe(false);
  });
});

// ─── Duplicate detection ───────────────────────────────────────

describe("duplicate detection", () => {
  const row1: RawRow = {
    sku: "A", sku_name: "A", supplier: "S", category: "C",
    date: "2025-01-01", partner_id: "P1", sold_qty: 10,
    unit_price: 1, stock_qty: 100, lead_time_days: 7,
    ordered_qty: 0, expected_delivery_date: "",
  };

  it("detects exact duplicates", () => {
    const result = analyzeDuplicates([row1], [{ ...row1 }]);
    expect(result.exactDuplicates).toHaveLength(1);
    expect(result.genuineNew).toHaveLength(0);
    expect(result.conflicts).toHaveLength(0);
  });

  it("detects conflicts (same key, different sold_qty)", () => {
    const conflict = { ...row1, sold_qty: 20 };
    const result = analyzeDuplicates([row1], [conflict]);
    expect(result.conflicts).toHaveLength(1);
    expect(result.genuineNew).toHaveLength(0);
  });

  it("identifies genuine new rows", () => {
    const newRow = { ...row1, date: "2025-02-01" };
    const result = analyzeDuplicates([row1], [newRow]);
    expect(result.genuineNew).toHaveLength(1);
    expect(result.exactDuplicates).toHaveLength(0);
  });

  it("fingerprint includes sku, date, partner_id, sold_qty", () => {
    const fp = fingerprint(row1);
    expect(fp).toBe("A|2025-01-01|P1|10");
  });

  it("partialFingerprint excludes sold_qty", () => {
    const pfp = partialFingerprint(row1);
    expect(pfp).toBe("A|2025-01-01|P1");
  });
});
