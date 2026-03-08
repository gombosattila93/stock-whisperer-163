import { ReorderStrategy } from './reorderStrategies';

const STORAGE_KEY = 'inventoryPro_skuStrategyOverrides';

export type SkuStrategyOverrides = Record<string, ReorderStrategy>;

export function loadSkuOverrides(): SkuStrategyOverrides {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveSkuOverrides(overrides: SkuStrategyOverrides): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
}
