/**
 * Deterministic B2B electronics distributor test dataset.
 * All dates are relative to a fixed reference date so tests are reproducible.
 */
import { RawRow } from './types';

/** Fixed reference date: 2026-03-01 — all data generated relative to this */
export const TEST_REFERENCE_DATE = new Date('2026-03-01T00:00:00Z');

export function dateString(daysBeforeRef: number): string {
  const d = new Date(TEST_REFERENCE_DATE);
  d.setDate(d.getDate() - daysBeforeRef);
  return d.toISOString().slice(0, 10);
}

/** Seeded PRNG (Mulberry32) for reproducible "random" data */
function seededRandom(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateDailyRows(
  sku: string, name: string, supplier: string, category: string,
  days: number, qtyPerDay: number, price: number,
  stock: number, lead: number, ordered: number,
): RawRow[] {
  const rows: RawRow[] = [];
  for (let i = days; i >= 1; i--) {
    rows.push({
      sku, sku_name: name, supplier, category,
      date: dateString(i),
      partner_id: `P${(i % 5) + 1}`,
      sold_qty: qtyPerDay,
      unit_price: price,
      stock_qty: stock,
      lead_time_days: lead,
      ordered_qty: ordered,
      expected_delivery_date: '',
    });
  }
  return rows;
}

export function generateLumpyRows(
  sku: string, name: string, supplier: string, category: string,
  days: number, pattern: number[], price: number,
  stock: number, lead: number, ordered: number,
): RawRow[] {
  const rows: RawRow[] = [];
  for (let i = days; i >= 1; i--) {
    const idx = (days - i) % pattern.length;
    rows.push({
      sku, sku_name: name, supplier, category,
      date: dateString(i),
      partner_id: `P${(i % 3) + 1}`,
      sold_qty: pattern[idx],
      unit_price: price,
      stock_qty: stock,
      lead_time_days: lead,
      ordered_qty: ordered,
      expected_delivery_date: '',
    });
  }
  return rows;
}

export function generateSeasonalRows(
  sku: string, name: string, supplier: string, category: string,
  days: number, baseQty: number, spikeQty: number,
  price: number, lead: number, ordered: number,
): RawRow[] {
  const rows: RawRow[] = [];
  for (let i = days; i >= 1; i--) {
    const qty = i <= 30 ? spikeQty : baseQty;
    rows.push({
      sku, sku_name: name, supplier, category,
      date: dateString(i),
      partner_id: `P${(i % 4) + 1}`,
      sold_qty: qty,
      unit_price: price,
      stock_qty: 10,
      lead_time_days: lead,
      ordered_qty: ordered,
      expected_delivery_date: '',
    });
  }
  return rows;
}

export function generateRandomRows(
  sku: string, name: string, supplier: string, category: string,
  days: number, min: number, max: number,
  stock: number, lead: number, ordered: number,
  seed: number,
): RawRow[] {
  const rng = seededRandom(seed);
  const rows: RawRow[] = [];
  for (let i = days; i >= 1; i--) {
    const qty = Math.round(min + rng() * (max - min));
    rows.push({
      sku, sku_name: name, supplier, category,
      date: dateString(i),
      partner_id: `P${(i % 3) + 1}`,
      sold_qty: qty,
      unit_price: 0.45,
      stock_qty: stock,
      lead_time_days: lead,
      ordered_qty: ordered,
      expected_delivery_date: '',
    });
  }
  return rows;
}

export function generateStaticRow(
  sku: string, name: string, supplier: string, category: string,
  price: number, stock: number, lead: number, ordered: number,
): RawRow[] {
  // Single row with zero sales — dead stock / stock-only
  return [{
    sku, sku_name: name, supplier, category,
    date: dateString(60),
    partner_id: 'P001',
    sold_qty: 0,
    unit_price: price,
    stock_qty: stock,
    lead_time_days: lead,
    ordered_qty: ordered,
    expected_delivery_date: '',
  }];
}

/**
 * Full realistic test dataset — 10 SKUs covering all classification combos,
 * edge cases, and data quality scenarios.
 */
export const REALISTIC_TEST_DATA: RawRow[] = [
  // 1. AX — High value, perfectly stable demand (PSU)
  ...generateDailyRows('PSU-TDKL-001', 'TDK-Lambda 24V 10A', 'TDK-Lambda',
    'PSU', 90, 3, 45, 25, 14, 0),

  // 2. AZ — High value, lumpy demand (UPS)
  ...generateLumpyRows('UPS-RIEL-001', 'Riello 3kVA UPS', 'Riello',
    'UPS', 90, [0, 0, 0, 0, 0, 0, 12], 380, 8, 21, 0),

  // 3. BX — Mid value, stable (FIAMM battery)
  ...generateDailyRows('BAT-FIAM-001', 'FIAMM 12V 80Ah', 'FIAMM',
    'Battery', 90, 1, 89, 45, 7, 10),

  // 4. BY — Mid value, seasonal spike (solar inverter)
  ...generateSeasonalRows('INV-SOLIS-001', 'Solis 5kW Inverter', 'Solis',
    'Solar', 90, 1.5, 4, 85, 30, 0),

  // 5. CZ — Low value, erratic (connector)
  ...generateRandomRows('CON-MISC-001', 'M12 Connector', 'Generic',
    'Connectors', 90, 0, 5, 200, 5, 0, 42),

  // 6. Dead stock — no sales in 90 days
  ...generateStaticRow('BAT-EAST-001', 'Eastron SDM630', 'Eastron',
    'Metering', 120, 50, 21, 0),

  // 7. Insufficient data — only 2 sale records
  {
    sku: 'UPS-DELTA-001', sku_name: 'Delta 1kVA UPS', supplier: 'Delta',
    category: 'UPS', date: '2026-01-15', partner_id: 'P001',
    sold_qty: 5, unit_price: 290, stock_qty: 3, lead_time_days: 28,
    ordered_qty: 10, expected_delivery_date: '2026-03-20',
  },
  {
    sku: 'UPS-DELTA-001', sku_name: 'Delta 1kVA UPS', supplier: 'Delta',
    category: 'UPS', date: '2026-02-20', partner_id: 'P002',
    sold_qty: 3, unit_price: 290, stock_qty: 3, lead_time_days: 28,
    ordered_qty: 10, expected_delivery_date: '2026-03-20',
  },

  // 8. Stock-only — no sales history, only stock
  ...generateStaticRow('VIC-MPPT-001', 'Victron MPPT 100/50', 'Victron',
    'Solar', 185, 12, 21, 0),

  // 9. Overdue delivery — expected_delivery_date in the past
  {
    sku: 'PSU-MEAN-001', sku_name: 'Mean Well 48V 20A', supplier: 'Mean Well',
    category: 'PSU', date: '2026-01-10', partner_id: 'P001',
    sold_qty: 2, unit_price: 95, stock_qty: 1, lead_time_days: 10,
    ordered_qty: 20, expected_delivery_date: '2026-01-25',
  },

  // 10. MOQ test — low daily demand, used for MOQ rounding tests
  ...generateDailyRows('BAT-PYTES-001', 'Pytes 48V 100Ah LiFePO4', 'Pytes',
    'Battery', 90, 0.5, 650, 3, 14, 0),
];
