import { RawRow } from './types';
import { SkuStrategyOverrides } from './skuStrategyOverrides';
import { EoqSettings, DEFAULT_EOQ_SETTINGS } from './reorderStrategies';

const DB_NAME = 'inventory-dashboard';
const DB_VERSION = 2; // Bumped version for new stores
const DATA_STORE = 'data';
const SETTINGS_STORE = 'settings';
const DATA_KEY = 'rawRows';
const OVERRIDES_KEY = 'strategyOverrides';
const EOQ_SETTINGS_KEY = 'eoqSettings';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DATA_STORE)) {
        db.createObjectStore(DATA_STORE);
      }
      if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
        db.createObjectStore(SETTINGS_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
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
