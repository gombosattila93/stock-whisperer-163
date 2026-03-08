import { RawRow } from './types';
import type { SupplierOption, ProjectReservation } from './types';
import { SkuStrategyOverrides } from './skuStrategyOverrides';
import { EoqSettings, DEFAULT_EOQ_SETTINGS } from './reorderStrategies';
import { CostSettings, DEFAULT_COST_SETTINGS } from './costSettings';

const DB_NAME = 'inventory-dashboard';
const DB_VERSION = 7;
const FX_RATES_KEY = 'fxRates';
const DATA_STORE = 'data';
const SETTINGS_STORE = 'settings';
const STOCK_OVERRIDES_STORE = 'stock-overrides';
const COST_SETTINGS_STORE = 'cost-settings';
const SKU_SUPPLIER_OPTIONS_STORE = 'sku-supplier-options';
const RESERVATIONS_STORE = 'project-reservations';
const DATA_KEY = 'rawRows';
const OVERRIDES_KEY = 'strategyOverrides';
const EOQ_SETTINGS_KEY = 'eoqSettings';

export interface StockOverride {
  stock_qty?: number;
  ordered_qty?: number;
  lead_time_days?: number;
}

export type StockOverrides = Record<string, StockOverride>;

// 4f) Track IndexedDB availability
let _indexedDBAvailable: boolean | null = null;
let _indexedDBWarningShown = false;

export function isIndexedDBAvailable(): boolean {
  return _indexedDBAvailable !== false;
}

export function wasIndexedDBWarningShown(): boolean {
  return _indexedDBWarningShown;
}

export function markIndexedDBWarningShown() {
  _indexedDBWarningShown = true;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      _indexedDBAvailable = false;
      reject(new Error('IndexedDB open timed out'));
    }, 10000);

    try {
      if (typeof indexedDB === 'undefined') {
        clearTimeout(timeoutId);
        _indexedDBAvailable = false;
        reject(new Error('IndexedDB not available'));
        return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(DATA_STORE)) db.createObjectStore(DATA_STORE);
        if (!db.objectStoreNames.contains(SETTINGS_STORE)) db.createObjectStore(SETTINGS_STORE);
        if (!db.objectStoreNames.contains(STOCK_OVERRIDES_STORE)) db.createObjectStore(STOCK_OVERRIDES_STORE);
        if (!db.objectStoreNames.contains(COST_SETTINGS_STORE)) db.createObjectStore(COST_SETTINGS_STORE);
        if (!db.objectStoreNames.contains(SKU_SUPPLIER_OPTIONS_STORE)) db.createObjectStore(SKU_SUPPLIER_OPTIONS_STORE);
        if (!db.objectStoreNames.contains(RESERVATIONS_STORE)) db.createObjectStore(RESERVATIONS_STORE);
      };
      request.onsuccess = () => {
        clearTimeout(timeoutId);
        _indexedDBAvailable = true;
        resolve(request.result);
      };
      request.onerror = () => {
        clearTimeout(timeoutId);
        _indexedDBAvailable = false;
        reject(request.error);
      };
    } catch (err) {
      clearTimeout(timeoutId);
      _indexedDBAvailable = false;
      reject(err);
    }
  });
}

export async function saveRows(rows: RawRow[]): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DATA_STORE, 'readwrite');
      const store = tx.objectStore(DATA_STORE);
      store.put(rows, DATA_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    console.warn('Failed to save data to IndexedDB');
  }
}

export async function loadRows(): Promise<RawRow[] | null> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DATA_STORE, 'readonly');
      const store = tx.objectStore(DATA_STORE);
      const request = store.get(DATA_KEY);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return null;
  }
}

export async function clearRows(): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DATA_STORE, 'readwrite');
      const store = tx.objectStore(DATA_STORE);
      store.delete(DATA_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Silently fail
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SKU Strategy Overrides
// ─────────────────────────────────────────────────────────────────────────────

export async function saveSkuOverrides(overrides: SkuStrategyOverrides): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(SETTINGS_STORE, 'readwrite');
      const store = tx.objectStore(SETTINGS_STORE);
      store.put(overrides, OVERRIDES_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    console.warn('Failed to save strategy overrides to IndexedDB');
  }
}

export async function loadSkuOverrides(): Promise<SkuStrategyOverrides> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(SETTINGS_STORE, 'readonly');
      const store = tx.objectStore(SETTINGS_STORE);
      const request = store.get(OVERRIDES_KEY);
      request.onsuccess = () => resolve(request.result || {});
      request.onerror = () => reject(request.error);
    });
  } catch {
    return {};
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// EOQ Settings
// ─────────────────────────────────────────────────────────────────────────────

export async function saveEoqSettings(settings: EoqSettings): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(SETTINGS_STORE, 'readwrite');
      const store = tx.objectStore(SETTINGS_STORE);
      store.put(settings, EOQ_SETTINGS_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    console.warn('Failed to save EOQ settings to IndexedDB');
  }
}

export async function loadEoqSettings(): Promise<EoqSettings> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(SETTINGS_STORE, 'readonly');
      const store = tx.objectStore(SETTINGS_STORE);
      const request = store.get(EOQ_SETTINGS_KEY);
      request.onsuccess = () => resolve(request.result || DEFAULT_EOQ_SETTINGS);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return DEFAULT_EOQ_SETTINGS;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Stock Overrides (manual edits to stock_qty, ordered_qty, lead_time_days)
// ─────────────────────────────────────────────────────────────────────────────

const STOCK_OVERRIDES_KEY = 'all';

export async function saveStockOverrides(overrides: StockOverrides): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STOCK_OVERRIDES_STORE, 'readwrite');
      const store = tx.objectStore(STOCK_OVERRIDES_STORE);
      store.put(overrides, STOCK_OVERRIDES_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    console.warn('Failed to save stock overrides to IndexedDB');
  }
}

export async function loadStockOverrides(): Promise<StockOverrides> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STOCK_OVERRIDES_STORE, 'readonly');
      const store = tx.objectStore(STOCK_OVERRIDES_STORE);
      const request = store.get(STOCK_OVERRIDES_KEY);
      request.onsuccess = () => resolve(request.result || {});
      request.onerror = () => reject(request.error);
    });
  } catch {
    return {};
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Cost Settings
// ─────────────────────────────────────────────────────────────────────────────

const COST_SETTINGS_KEY = 'settings';

export async function saveCostSettings(settings: CostSettings): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(COST_SETTINGS_STORE, 'readwrite');
      const store = tx.objectStore(COST_SETTINGS_STORE);
      store.put(settings, COST_SETTINGS_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    console.warn('Failed to save cost settings to IndexedDB');
  }
}

export async function loadCostSettings(): Promise<CostSettings> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(COST_SETTINGS_STORE, 'readonly');
      const store = tx.objectStore(COST_SETTINGS_STORE);
      const request = store.get(COST_SETTINGS_KEY);
      request.onsuccess = () => resolve(request.result || DEFAULT_COST_SETTINGS);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return DEFAULT_COST_SETTINGS;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SKU Supplier Options
// ─────────────────────────────────────────────────────────────────────────────

export type SkuSupplierOptionsMap = Record<string, SupplierOption[]>;

const SKU_SUPPLIER_KEY = 'all';

export async function saveSkuSupplierOptions(options: SkuSupplierOptionsMap): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(SKU_SUPPLIER_OPTIONS_STORE, 'readwrite');
      const store = tx.objectStore(SKU_SUPPLIER_OPTIONS_STORE);
      store.put(options, SKU_SUPPLIER_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    console.warn('Failed to save SKU supplier options to IndexedDB');
  }
}

export async function loadSkuSupplierOptions(): Promise<SkuSupplierOptionsMap> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(SKU_SUPPLIER_OPTIONS_STORE, 'readonly');
      const store = tx.objectStore(SKU_SUPPLIER_OPTIONS_STORE);
      const request = store.get(SKU_SUPPLIER_KEY);
      request.onsuccess = () => resolve(request.result || {});
      request.onerror = () => reject(request.error);
    });
  } catch {
    return {};
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Project Reservations
// ─────────────────────────────────────────────────────────────────────────────

const RESERVATIONS_KEY = 'all';

export async function saveReservations(reservations: ProjectReservation[]): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(RESERVATIONS_STORE, 'readwrite');
      const store = tx.objectStore(RESERVATIONS_STORE);
      store.put(reservations, RESERVATIONS_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    console.warn('Failed to save reservations to IndexedDB');
  }
}

export async function loadReservations(): Promise<ProjectReservation[]> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(RESERVATIONS_STORE, 'readonly');
      const store = tx.objectStore(RESERVATIONS_STORE);
      const request = store.get(RESERVATIONS_KEY);
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return [];
  }
}

// ─── FX Rates Persistence ──────────────────────────────────────────────────

export async function saveFxRates(rates: unknown): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(SETTINGS_STORE, 'readwrite');
      const store = tx.objectStore(SETTINGS_STORE);
      store.put(rates, FX_RATES_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    console.warn('Failed to save FX rates to IndexedDB');
  }
}

export async function loadFxRates(): Promise<unknown | null> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(SETTINGS_STORE, 'readonly');
      const store = tx.objectStore(SETTINGS_STORE);
      const request = store.get(FX_RATES_KEY);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return null;
  }
}
