import { z } from 'zod';
import { RawRow } from './types';

export const csvRowSchema = z.object({
  sku: z.string().min(1, 'SKU is required'),
  sku_name: z.string().optional().default(''),
  supplier: z.string().optional().default('Unknown'),
  category: z.string().optional().default('Uncategorized'),
  date: z.string().min(1, 'Date is required'),
  partner_id: z.string().optional().default(''),
  sold_qty: z.union([z.string(), z.number()]).transform(v => String(v)),
  unit_price: z.union([z.string(), z.number()]).transform(v => String(v)),
  stock_qty: z.union([z.string(), z.number()]).transform(v => String(v)),
  lead_time_days: z.union([z.string(), z.number()]).transform(v => String(v)),
  ordered_qty: z.union([z.string(), z.number()]).transform(v => String(v)),
  expected_delivery_date: z.string().optional().default(''),
  // Multi-currency optional columns
  selling_price_huf: z.union([z.string(), z.number()]).transform(v => String(v)).optional().default(''),
  purchase_currency: z.string().optional().default(''),
  purchase_price_1: z.union([z.string(), z.number()]).transform(v => String(v)).optional().default(''),
  purchase_qty_1: z.union([z.string(), z.number()]).transform(v => String(v)).optional().default(''),
  purchase_price_2: z.union([z.string(), z.number()]).transform(v => String(v)).optional().default(''),
  purchase_qty_2: z.union([z.string(), z.number()]).transform(v => String(v)).optional().default(''),
  purchase_price_3: z.union([z.string(), z.number()]).transform(v => String(v)).optional().default(''),
  purchase_qty_3: z.union([z.string(), z.number()]).transform(v => String(v)).optional().default(''),
  purchase_price_4: z.union([z.string(), z.number()]).transform(v => String(v)).optional().default(''),
  purchase_qty_4: z.union([z.string(), z.number()]).transform(v => String(v)).optional().default(''),
  purchase_price_5: z.union([z.string(), z.number()]).transform(v => String(v)).optional().default(''),
  purchase_qty_5: z.union([z.string(), z.number()]).transform(v => String(v)).optional().default(''),
  purchase_price_6: z.union([z.string(), z.number()]).transform(v => String(v)).optional().default(''),
  purchase_qty_6: z.union([z.string(), z.number()]).transform(v => String(v)).optional().default(''),
  purchase_price_7: z.union([z.string(), z.number()]).transform(v => String(v)).optional().default(''),
  purchase_qty_7: z.union([z.string(), z.number()]).transform(v => String(v)).optional().default(''),
  purchase_price_8: z.union([z.string(), z.number()]).transform(v => String(v)).optional().default(''),
  purchase_qty_8: z.union([z.string(), z.number()]).transform(v => String(v)).optional().default(''),
});

export type CsvValidationResult = {
  valid: boolean;
  rows: RawRow[];
  errors: CsvValidationError[];
  warnings: string[];
};

export type CsvValidationError = {
  row: number;
  field: string;
  message: string;
};

const REQUIRED_COLUMNS = ['sku', 'date'] as const;
const ALL_COLUMNS = [
  'sku', 'sku_name', 'supplier', 'category', 'date', 'partner_id',
  'sold_qty', 'unit_price', 'stock_qty', 'lead_time_days',
  'ordered_qty', 'expected_delivery_date',
  // Multi-currency columns
  'selling_price_huf', 'purchase_currency',
  'purchase_price_1', 'purchase_qty_1', 'purchase_price_2', 'purchase_qty_2',
  'purchase_price_3', 'purchase_qty_3', 'purchase_price_4', 'purchase_qty_4',
  'purchase_price_5', 'purchase_qty_5', 'purchase_price_6', 'purchase_qty_6',
  'purchase_price_7', 'purchase_qty_7', 'purchase_price_8', 'purchase_qty_8',
] as const;

export function validateCsvHeaders(headers: string[]): { valid: boolean; missing: string[]; extra: string[] } {
  const normalized = headers.map(h => h.replace(/^\uFEFF/, '').trim().toLowerCase());
  const missing = REQUIRED_COLUMNS.filter(col => !normalized.includes(col));
  const extra = normalized.filter(h => !(ALL_COLUMNS as readonly string[]).includes(h));
  return {
    valid: missing.length === 0,
    missing,
    extra,
  };
}

export function validateCsvRows(rawData: Record<string, unknown>[]): CsvValidationResult {
  const validRows: RawRow[] = [];
  const errors: CsvValidationError[] = [];
  const warnings: string[] = [];

  if (rawData.length === 0) {
    errors.push({ row: 0, field: '', message: 'CSV file contains no data rows' });
    return { valid: false, rows: [], errors, warnings };
  }

  // Check headers from first row
  const headers = Object.keys(rawData[0]);
  const headerCheck = validateCsvHeaders(headers);
  if (!headerCheck.valid) {
    errors.push({
      row: 0,
      field: '',
      message: `Missing required columns: ${headerCheck.missing.join(', ')}`,
    });
    return { valid: false, rows: [], errors, warnings };
  }
  if (headerCheck.extra.length > 0) {
    warnings.push(`Ignoring unknown columns: ${headerCheck.extra.join(', ')}`);
  }

  let negativeSoldQtyCount = 0;

  for (let i = 0; i < rawData.length; i++) {
    const result = csvRowSchema.safeParse(rawData[i]);
    if (result.success) {
      // Track negative sold_qty
      const soldVal = Number(result.data.sold_qty);
      if (!isNaN(soldVal) && soldVal < 0) {
        negativeSoldQtyCount++;
      }
      validRows.push(result.data as unknown as RawRow);
    } else {
      for (const issue of result.error.issues) {
        errors.push({
          row: i + 2, // +2 for 1-based + header row
          field: issue.path.join('.'),
          message: issue.message,
        });
      }
    }
  }

  if (negativeSoldQtyCount > 0) {
    warnings.push(
      `${negativeSoldQtyCount} rows with negative sold_qty were treated as 0 (returns). Net them before import for accurate demand.`
    );
  }

  if (errors.length > 0 && validRows.length > 0) {
    warnings.push(`${errors.length} rows had validation errors and were skipped. ${validRows.length} valid rows imported.`);
  }

  return {
    valid: validRows.length > 0,
    rows: validRows,
    errors: errors.length > 0 && validRows.length === 0 ? errors : [],
    warnings,
  };
}
