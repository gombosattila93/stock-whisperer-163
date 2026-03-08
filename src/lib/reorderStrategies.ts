import { SkuAnalysis } from './types';

export type ReorderStrategy = 'rop' | 'eoq' | 'minmax' | 'periodic';

export interface EoqSettings {
  orderingCost: number;
  holdingPct: number;
}

export const DEFAULT_EOQ_SETTINGS: EoqSettings = {
  orderingCost: 50,
  holdingPct: 0.20,
};

export interface ReorderResult {
  strategy: ReorderStrategy;
  strategyLabel: string;
  suggested_order_qty: number;
  reorder_trigger: string;
}

/**
 * Standard Reorder Point (ROP) — current default.
 * Order when effective_stock ≤ reorder_point.
 * Order qty = 2 × ROP − effective_stock, rounded up to nearest 10.
 */
export function ropStrategy(sku: SkuAnalysis): ReorderResult {
  const rp = sku.reorder_point ?? 0;
  const raw = rp * 2 - sku.effective_stock;
  return {
    strategy: 'rop',
    strategyLabel: 'Reorder Point',
    suggested_order_qty: raw > 0 ? Math.ceil(raw / 10) * 10 : 0,
    reorder_trigger: `Stock ≤ ${Math.round(rp)} units`,
  };
}

/**
 * Economic Order Quantity (EOQ) — Wilson formula.
 * Uses configurable ordering cost and holding cost percentage.
 */
export function eoqStrategy(sku: SkuAnalysis, settings: EoqSettings = DEFAULT_EOQ_SETTINGS): ReorderResult {
  const rp = sku.reorder_point ?? 0;
  const annualDemand = sku.avg_daily_demand * 365;
  const holdingCost = sku.unit_price * settings.holdingPct;

  let eoq = 0;
  if (annualDemand > 0 && holdingCost > 0) {
    eoq = Math.sqrt((2 * annualDemand * settings.orderingCost) / holdingCost);
  }
  const qty = Math.max(0, Math.ceil(eoq / 10) * 10);

  return {
    strategy: 'eoq',
    strategyLabel: 'EOQ (Economic Order Qty)',
    suggested_order_qty: qty,
    reorder_trigger: `Stock ≤ ${Math.round(rp)} units, order EOQ batch`,
  };
}

/**
 * Min/Max — maintain stock between min (reorder point) and max (2× reorder point).
 * Order qty = max - effective_stock.
 */
export function minMaxStrategy(sku: SkuAnalysis): ReorderResult {
  const min = sku.reorder_point ?? 0;
  const max = min * 2;
  const qty = Math.max(0, Math.ceil((max - sku.effective_stock) / 10) * 10);

  return {
    strategy: 'minmax',
    strategyLabel: 'Min/Max',
    suggested_order_qty: qty,
    reorder_trigger: `Stock ≤ ${Math.round(min)}, fill to ${Math.round(max)}`,
  };
}

/**
 * Periodic Review — order up to target every review cycle.
 * Target = avg demand × (review period + lead time) + safety stock.
 */
export function periodicStrategy(sku: SkuAnalysis, reviewPeriodDays: number = 14): ReorderResult {
  const ss = sku.safety_stock ?? 0;
  const target = sku.avg_daily_demand * (reviewPeriodDays + sku.lead_time_days) + ss;
  const qty = Math.max(0, Math.ceil((target - sku.effective_stock) / 10) * 10);

  return {
    strategy: 'periodic',
    strategyLabel: `Periodic Review (${reviewPeriodDays}d)`,
    suggested_order_qty: qty,
    reorder_trigger: `Every ${reviewPeriodDays} days, fill to ${Math.round(target)}`,
  };
}

export const STRATEGY_OPTIONS: { value: ReorderStrategy; label: string; description: string }[] = [
  { value: 'rop', label: 'Reorder Point (ROP)', description: 'Order when stock hits reorder point — simple, widely used' },
  { value: 'eoq', label: 'EOQ', description: 'Economic Order Quantity — minimizes total ordering + holding cost' },
  { value: 'minmax', label: 'Min/Max', description: 'Maintain stock between min and max levels — good for stable demand' },
  { value: 'periodic', label: 'Periodic Review', description: 'Order up to target every N days — simpler to schedule' },
];

export function computeReorder(
  sku: SkuAnalysis,
  strategy: ReorderStrategy,
  eoqSettings: EoqSettings = DEFAULT_EOQ_SETTINGS
): ReorderResult {
  switch (strategy) {
    case 'eoq': return eoqStrategy(sku, eoqSettings);
    case 'minmax': return minMaxStrategy(sku);
    case 'periodic': return periodicStrategy(sku);
    default: return ropStrategy(sku);
  }
}
