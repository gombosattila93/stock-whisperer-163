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

/** Minimal translate function signature accepted by strategy helpers. */
export type TranslateFn = (key: string) => string;

/** Identity fallback when no i18n context is available. */
const identity: TranslateFn = (k) => k;

export interface ReorderResult {
  strategy: ReorderStrategy;
  strategyLabel: string;
  suggested_order_qty: number;
  reorder_trigger: string;
}

/**
 * Standard Reorder Point (ROP) — current default.
 */
export function ropStrategy(sku: SkuAnalysis, t: TranslateFn = identity): ReorderResult {
  const rp = sku.reorder_point ?? 0;
  const raw = rp * 2 - sku.effective_stock;
  return {
    strategy: 'rop',
    strategyLabel: t('strategy.rop.strategyLabel'),
    suggested_order_qty: raw > 0 ? Math.ceil(raw / 10) * 10 : 0,
    reorder_trigger: `${t('strategy.stockBelow')} ${Math.round(rp)} ${t('common.units')}`,
  };
}

/**
 * Economic Order Quantity (EOQ) — Wilson formula.
 */
export function eoqStrategy(sku: SkuAnalysis, settings: EoqSettings = DEFAULT_EOQ_SETTINGS, t: TranslateFn = identity): ReorderResult {
  const rp = sku.reorder_point ?? 0;
  const trigger = `${t('strategy.stockBelow')} ${Math.round(rp)} ${t('strategy.unitsOrderEoq')}`;

  if (sku.effective_stock > rp && rp > 0) {
    return {
      strategy: 'eoq',
      strategyLabel: t('strategy.eoq.strategyLabel'),
      suggested_order_qty: 0,
      reorder_trigger: trigger,
    };
  }

  const annualDemand = sku.avg_daily_demand * 365;
  const holdingCost = sku.unit_price * settings.holdingPct;

  let eoq = 0;
  if (annualDemand > 0 && holdingCost > 0) {
    eoq = Math.sqrt((2 * annualDemand * settings.orderingCost) / holdingCost);
  }
  const qty = Math.max(0, Math.ceil(eoq / 10) * 10);

  return {
    strategy: 'eoq',
    strategyLabel: t('strategy.eoq.strategyLabel'),
    suggested_order_qty: qty,
    reorder_trigger: trigger,
  };
}

/**
 * Min/Max — maintain stock between min and max levels.
 */
export function minMaxStrategy(sku: SkuAnalysis, t: TranslateFn = identity): ReorderResult {
  const min = sku.reorder_point ?? 0;
  const max = min * 2;
  const qty = Math.max(0, Math.ceil((max - sku.effective_stock) / 10) * 10);

  return {
    strategy: 'minmax',
    strategyLabel: t('strategy.minmax.strategyLabel'),
    suggested_order_qty: qty,
    reorder_trigger: `${t('strategy.stockBelow')} ${Math.round(min)}, ${t('strategy.fillTo')} ${Math.round(max)}`,
  };
}

/**
 * Periodic Review — order up to target every review cycle.
 */
export function periodicStrategy(sku: SkuAnalysis, reviewPeriodDays: number = 14, t: TranslateFn = identity): ReorderResult {
  const ss = sku.safety_stock ?? 0;
  const target = sku.avg_daily_demand * (reviewPeriodDays + sku.lead_time_days) + ss;
  const qty = Math.max(0, Math.ceil((target - sku.effective_stock) / 10) * 10);

  return {
    strategy: 'periodic',
    strategyLabel: `${t('strategy.periodic.strategyLabel')} (${reviewPeriodDays}${t('common.dayAbbr')})`,
    suggested_order_qty: qty,
    reorder_trigger: `${t('strategy.every')} ${reviewPeriodDays} ${t('strategy.daysFillTo')} ${Math.round(target)}`,
  };
}

export interface StrategyOption {
  value: ReorderStrategy;
  label: string;
  description: string;
}

/** Returns translated strategy options for UI selects. */
export function getStrategyOptions(t: TranslateFn): StrategyOption[] {
  return [
    { value: 'rop', label: t('strategy.rop.label'), description: t('strategy.rop.description') },
    { value: 'eoq', label: t('strategy.eoq.label'), description: t('strategy.eoq.description') },
    { value: 'minmax', label: t('strategy.minmax.label'), description: t('strategy.minmax.description') },
    { value: 'periodic', label: t('strategy.periodic.label'), description: t('strategy.periodic.description') },
  ];
}

/** @deprecated Use getStrategyOptions(t) for i18n support. */
export const STRATEGY_OPTIONS: StrategyOption[] = [
  { value: 'rop', label: 'Reorder Point (ROP)', description: 'Order when stock hits reorder point — simple, widely used' },
  { value: 'eoq', label: 'EOQ', description: 'Economic Order Quantity — minimizes total ordering + holding cost' },
  { value: 'minmax', label: 'Min/Max', description: 'Maintain stock between min and max levels — good for stable demand' },
  { value: 'periodic', label: 'Periodic Review', description: 'Order up to target every N days — simpler to schedule' },
];

export function computeReorder(
  sku: SkuAnalysis,
  strategy: ReorderStrategy,
  eoqSettings: EoqSettings = DEFAULT_EOQ_SETTINGS,
  t: TranslateFn = identity
): ReorderResult {
  switch (strategy) {
    case 'eoq': return eoqStrategy(sku, eoqSettings, t);
    case 'minmax': return minMaxStrategy(sku, t);
    case 'periodic': return periodicStrategy(sku, 14, t);
    default: return ropStrategy(sku, t);
  }
}
