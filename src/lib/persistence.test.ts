import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock IndexedDB as unavailable for basic error-path tests
describe('persistence — IndexedDB unavailable', () => {
  beforeEach(() => {
    // Simulate environment without IndexedDB
    vi.stubGlobal('indexedDB', undefined);
  });

  it('saveRows resolves without throwing when IndexedDB is unavailable', async () => {
    // Re-import after stubbing
    const { saveRows } = await import('./persistence');
    await expect(saveRows([])).resolves.toBeUndefined();
  });

  it('loadRows returns null when IndexedDB is unavailable', async () => {
    const { loadRows } = await import('./persistence');
    const result = await loadRows();
    expect(result).toBeNull();
  });

  it('loadStockOverrides returns empty object when IndexedDB is unavailable', async () => {
    const { loadStockOverrides } = await import('./persistence');
    const result = await loadStockOverrides();
    expect(result).toEqual({});
  });

  it('loadReservations returns empty array when IndexedDB is unavailable', async () => {
    const { loadReservations } = await import('./persistence');
    const result = await loadReservations();
    expect(result).toEqual([]);
  });
});

describe('checkStorageQuota', () => {
  it('returns null when navigator.storage is unavailable', async () => {
    vi.stubGlobal('navigator', {});
    const { checkStorageQuota } = await import('./persistence');
    const result = await checkStorageQuota();
    expect(result).toBeNull();
  });

  it('returns quota info when navigator.storage.estimate is available', async () => {
    vi.stubGlobal('navigator', {
      storage: {
        estimate: vi.fn().mockResolvedValue({ usage: 10 * 1024 * 1024, quota: 100 * 1024 * 1024 }),
      },
    });
    const { checkStorageQuota } = await import('./persistence');
    const result = await checkStorageQuota();
    expect(result).not.toBeNull();
    expect(result!.pct).toBeCloseTo(10, 0);
    expect(result!.usageMb).toBeCloseTo(10, 0);
    expect(result!.quotaMb).toBeCloseTo(100, 0);
  });
});
