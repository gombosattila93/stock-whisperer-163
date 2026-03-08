import React, { createContext, useContext, useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { RawRow, SkuAnalysis, XyzClass, SupplierOption } from '@/lib/types';
import { SERVICE_LEVELS } from '@/lib/calculations';
import { parseCsvFile, parseCsvString, parseCsvFileRaw, detectDateFormat, getDateFormatLabel } from '@/lib/csvUtils';
import { validateCsvRows, CsvValidationError } from '@/lib/csvValidation';
import { sampleCsv } from '@/lib/sampleData';
import {
  saveRows, loadRows, clearRows,
  StockOverrides, saveStockOverrides, loadStockOverrides,
  saveCostSettings, loadCostSettings,
  SkuSupplierOptionsMap, saveSkuSupplierOptions, loadSkuSupplierOptions,
} from '@/lib/persistence';
import { ClassificationThresholds, DEFAULT_THRESHOLDS } from '@/lib/classificationTypes';
import { CostSettings, DEFAULT_COST_SETTINGS } from '@/lib/costSettings';
import { ColumnMapping } from '@/components/ColumnMapper';
import { analyzeDuplicates, DuplicateAnalysis, partialFingerprint } from '@/lib/duplicateDetection';
import type { ConflictResolution } from '@/components/DuplicateDetectionModal';
import { toast } from 'sonner';
import type { WorkerRequest, WorkerResponse } from '@/workers/inventoryWorker';

interface InventoryContextType {
  analysis: SkuAnalysis[];
  suppliers: string[];
  categories: string[];
  filterSupplier: string;
  setFilterSupplier: (v: string) => void;
  filterCategory: string;
  setFilterCategory: (v: string) => void;
  demandDays: number;
  setDemandDays: (v: number) => void;
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  serviceLevel: string;
  setServiceLevel: (v: string) => void;
  hasData: boolean;
  loadFile: (file: File) => Promise<void>;
  loadFileWithMapping: (file: File, mapping: ColumnMapping) => Promise<void>;
  appendFile: (file: File) => Promise<void>;
  loadSample: () => Promise<void>;
  clearData: () => void;
  filtered: SkuAnalysis[];
  validationErrors: CsvValidationError[];
  thresholds: ClassificationThresholds;
  setThresholds: (t: ClassificationThresholds) => void;
  isCalculating: boolean;
  calculationProgress: number;
  // Stock overrides
  stockOverrides: StockOverrides;
  setStockOverride: (sku: string, field: string, value: number) => void;
  clearStockOverrides: () => void;
  stockOverrideCount: number;
  // For column mapping flow
  pendingFile: File | null;
  pendingHeaders: string[];
  pendingRawData: Record<string, string>[];
  setPendingFile: (f: File | null) => void;
  // For duplicate detection on append
  pendingAppend: { analysis: DuplicateAnalysis; fileName: string } | null;
  confirmAppend: (resolutions: Map<string, ConflictResolution>) => void;
  cancelAppend: () => void;
  // Cost settings
  costSettings: CostSettings;
  setCostSettings: (s: CostSettings) => void;
  // Supplier options
  skuSupplierOptions: SkuSupplierOptionsMap;
  setSkuSupplierOptions: (sku: string, options: SupplierOption[]) => void;
}

const InventoryContext = createContext<InventoryContextType | null>(null);

export function useInventory() {
  const ctx = useContext(InventoryContext);
  if (!ctx) throw new Error('useInventory must be used within InventoryProvider');
  return ctx;
}

function clampDemandDays(v: number): number {
  if (!Number.isFinite(v) || v < 7) return 7;
  if (v > 365) return 365;
  return Math.round(v);
}

function createWorker() {
  return new Worker(new URL('../workers/inventoryWorker.ts', import.meta.url), { type: 'module' });
}

/** Apply stock overrides to raw rows before sending to the worker */
function applyStockOverrides(rows: RawRow[], overrides: StockOverrides): RawRow[] {
  if (Object.keys(overrides).length === 0) return rows;
  return rows.map(row => {
    const ov = overrides[row.sku];
    if (!ov) return row;
    return {
      ...row,
      stock_qty: ov.stock_qty ?? row.stock_qty,
      ordered_qty: ov.ordered_qty ?? row.ordered_qty,
      lead_time_days: ov.lead_time_days ?? row.lead_time_days,
    };
  });
}

export function InventoryProvider({ children }: { children: React.ReactNode }) {
  const [rawRows, setRawRows] = useState<RawRow[]>([]);
  const [analysis, setAnalysis] = useState<SkuAnalysis[]>([]);
  const [isCalculating, setIsCalculating] = useState(false);
  const [calculationProgress, setCalculationProgress] = useState(0);
  const [filterSupplier, setFilterSupplier] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [demandDays, setDemandDaysRaw] = useState(90);
  const [searchQuery, setSearchQuery] = useState('');
  const [serviceLevel, setServiceLevel] = useState('95%');
  const [validationErrors, setValidationErrors] = useState<CsvValidationError[]>([]);
  const [persistenceLoaded, setPersistenceLoaded] = useState(false);
  const [thresholds, setThresholds] = useState<ClassificationThresholds>(DEFAULT_THRESHOLDS);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingHeaders, setPendingHeaders] = useState<string[]>([]);
  const [pendingRawData, setPendingRawData] = useState<Record<string, string>[]>([]);
  const [stockOverrides, setStockOverrides] = useState<StockOverrides>({});
  const [costSettings, setCostSettingsRaw] = useState<CostSettings>(DEFAULT_COST_SETTINGS);

  const workerRef = useRef<Worker | null>(null);

  const setDemandDays = useCallback((v: number) => {
    setDemandDaysRaw(clampDemandDays(v));
  }, []);

  const setStockOverride = useCallback((sku: string, field: string, value: number) => {
    setStockOverrides(prev => {
      const next = { ...prev, [sku]: { ...prev[sku], [field]: value } };
      saveStockOverrides(next);
      return next;
    });
  }, []);

  const clearStockOverrides = useCallback(() => {
    setStockOverrides({});
    saveStockOverrides({});
    toast.info('All stock overrides cleared');
  }, []);

  const stockOverrideCount = useMemo(() => Object.keys(stockOverrides).length, [stockOverrides]);

  const setCostSettings = useCallback((s: CostSettings) => {
    setCostSettingsRaw(s);
    saveCostSettings(s);
  }, []);

  // Cleanup worker on unmount
  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
    };
  }, []);

  useEffect(() => {
    Promise.all([loadRows(), loadStockOverrides(), loadCostSettings()]).then(([rows, overrides, costs]) => {
      if (rows && rows.length > 0) {
        setRawRows(rows);
        toast.success(`Restored ${rows.length} rows from previous session`);
      }
      if (overrides && Object.keys(overrides).length > 0) {
        setStockOverrides(overrides);
      }
      setCostSettingsRaw(costs);
      setPersistenceLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (persistenceLoaded && rawRows.length > 0) {
      saveRows(rawRows);
    }
  }, [rawRows, persistenceLoaded]);

  const serviceFactor = SERVICE_LEVELS[serviceLevel] ?? 1.65;

  // Run analysis via Web Worker whenever inputs change (including stockOverrides)
  useEffect(() => {
    if (rawRows.length === 0) {
      setAnalysis([]);
      return;
    }

    // Terminate any in-flight worker
    workerRef.current?.terminate();

    const worker = createWorker();
    workerRef.current = worker;

    setIsCalculating(true);
    setCalculationProgress(0);

    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      if (e.data.type === 'PROGRESS') {
        setCalculationProgress(e.data.payload.pct);
      } else if (e.data.type === 'RESULT') {
        setAnalysis(e.data.payload);
        setIsCalculating(false);
        setCalculationProgress(100);
        worker.terminate();
        if (workerRef.current === worker) {
          workerRef.current = null;
        }
      }
    };

    worker.onerror = (err) => {
      console.error('Worker error:', err);
      setIsCalculating(false);
      toast.error('Calculation failed');
      worker.terminate();
      if (workerRef.current === worker) {
        workerRef.current = null;
      }
    };

    const rowsWithOverrides = applyStockOverrides(rawRows, stockOverrides);
    const message: WorkerRequest = {
      type: 'ANALYZE',
      payload: { rows: rowsWithOverrides, demandDays, serviceFactor, thresholds, costSettings },
    };
    worker.postMessage(message);
  }, [rawRows, demandDays, serviceFactor, thresholds, stockOverrides, costSettings]);

  const suppliers = useMemo(() => [...new Set(analysis.map(a => a.supplier))].sort(), [analysis]);
  const categories = useMemo(() => [...new Set(analysis.map(a => a.category))].sort(), [analysis]);

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return analysis.filter(a => {
      if (filterSupplier && a.supplier !== filterSupplier) return false;
      if (filterCategory && a.category !== filterCategory) return false;
      if (q) {
        const match = a.sku.toLowerCase().includes(q) ||
          a.sku_name.toLowerCase().includes(q) ||
          a.supplier.toLowerCase().includes(q) ||
          a.category.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [analysis, filterSupplier, filterCategory, searchQuery]);

  const processAndValidate = useCallback((parsedRows: RawRow[]): RawRow[] => {
    const result = validateCsvRows(parsedRows as unknown as Record<string, unknown>[]);
    setValidationErrors(result.errors);

    if (result.warnings.length > 0) {
      result.warnings.forEach(w => toast.warning(w));
    }
    if (!result.valid) {
      const errorMsg = result.errors.length > 0
        ? result.errors.slice(0, 3).map(e => `Row ${e.row}: ${e.field} — ${e.message}`).join('\n')
        : 'No valid rows found in CSV';
      toast.error('CSV validation failed', { description: errorMsg });
      return [];
    }

    return result.rows;
  }, []);

  const loadFile = useCallback(async (file: File) => {
    try {
      const rawParsed = await parseCsvFileRaw(file);
      if (rawParsed.length === 0) {
        toast.error('CSV file contains no data');
        return;
      }
      const headers = Object.keys(rawParsed[0]);
      const requiredHeaders = ['sku', 'date'];
      const normalizedHeaders = headers.map(h => h.toLowerCase().replace(/[\s_-]+/g, ''));
      const missingRequired = requiredHeaders.filter(r =>
        !normalizedHeaders.some(h => h === r.replace(/_/g, ''))
      );

      if (missingRequired.length > 0) {
        setPendingFile(file);
        setPendingHeaders(headers);
        setPendingRawData(rawParsed);
        toast.info('Column names don\'t match — please map your columns');
        return;
      }

      const parsed = await parseCsvFile(file);
      const validated = processAndValidate(parsed);
      if (validated.length > 0) {
        setRawRows(validated);
        const dateSamples = rawParsed.map(r => r['date'] || '').filter(Boolean);
        const fmt = detectDateFormat(dateSamples);
        const samplePreview = dateSamples.slice(0, 3).join(', ');
        toast.success(`Loaded ${validated.length} rows from ${file.name}`, {
          description: `Date format: ${getDateFormatLabel(fmt)} — samples: ${samplePreview}`,
        });
      }
    } catch (err) {
      toast.error('Failed to parse CSV file', {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }, [processAndValidate]);

  const loadFileWithMapping = useCallback(async (file: File, mapping: ColumnMapping) => {
    try {
      const rawParsed = await parseCsvFileRaw(file);
      const remapped: Record<string, unknown>[] = rawParsed.map(row => {
        const newRow: Record<string, unknown> = {};
        for (const [targetField, sourceCol] of Object.entries(mapping)) {
          if (sourceCol && row[sourceCol] !== undefined) {
            newRow[targetField] = row[sourceCol];
          }
        }
        return newRow;
      });

      const validated = processAndValidate(remapped as unknown as RawRow[]);
      if (validated.length > 0) {
        setRawRows(validated);
        const dateSamples = rawParsed.map(r => {
          const dateCol = mapping['date'];
          return dateCol ? r[dateCol] || '' : '';
        }).filter(Boolean);
        const fmt = detectDateFormat(dateSamples);
        toast.success(`Loaded ${validated.length} rows with custom mapping`, {
          description: `Date format detected: ${getDateFormatLabel(fmt)}`,
        });
      }
      setPendingFile(null);
      setPendingHeaders([]);
      setPendingRawData([]);
    } catch (err) {
      toast.error('Failed to process mapped CSV', {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }, [processAndValidate]);

  // Pending append state for duplicate detection
  const [pendingAppend, setPendingAppend] = useState<{
    analysis: DuplicateAnalysis;
    fileName: string;
    validated: RawRow[];
  } | null>(null);

  const appendFile = useCallback(async (file: File) => {
    try {
      const parsed = await parseCsvFile(file);
      const validated = processAndValidate(parsed);
      if (validated.length === 0) return;

      if (rawRows.length === 0) {
        // No existing data — skip duplicate detection
        setRawRows(validated);
        toast.success(`Appended ${validated.length} rows from ${file.name}`);
        return;
      }

      const dupAnalysis = analyzeDuplicates(rawRows, validated);

      // Fast path: no duplicates or conflicts at all
      if (dupAnalysis.exactDuplicates.length === 0 && dupAnalysis.conflicts.length === 0) {
        setRawRows(prev => [...prev, ...dupAnalysis.genuineNew]);
        toast.success(`Appended ${dupAnalysis.genuineNew.length} rows from ${file.name}`);
        return;
      }

      // Show confirmation modal
      setPendingAppend({ analysis: dupAnalysis, fileName: file.name, validated });
    } catch (err) {
      toast.error('Failed to parse CSV file', {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }, [processAndValidate, rawRows]);

  const confirmAppend = useCallback((resolutions: Map<string, ConflictResolution>) => {
    if (!pendingAppend) return;
    const { analysis: dupAnalysis, fileName } = pendingAppend;

    const replaceMap = new Map<string, RawRow>();
    const extraRows: RawRow[] = [...dupAnalysis.genuineNew];

    for (const conflict of dupAnalysis.conflicts) {
      const resolution = resolutions.get(conflict.partialKey) || 'use_new';
      if (resolution === 'use_new') {
        replaceMap.set(conflict.partialKey, conflict.incoming);
      } else if (resolution === 'keep_both') {
        extraRows.push(conflict.incoming);
      }
      // 'keep_old' → do nothing
    }

    setRawRows(prev => {
      let updated = prev;
      if (replaceMap.size > 0) {
        updated = updated.map(r => {
          const pk = partialFingerprint(r);
          return replaceMap.get(pk) ?? r;
        });
      }
      return [...updated, ...extraRows];
    });

    const added = extraRows.length + replaceMap.size;
    toast.success(`Merged ${added} rows from ${fileName}`, {
      description: `${dupAnalysis.exactDuplicates.length} duplicates skipped${dupAnalysis.conflicts.length > 0 ? `, ${dupAnalysis.conflicts.length} conflicts resolved` : ''}`,
    });
    setPendingAppend(null);
  }, [pendingAppend]);

  const cancelAppend = useCallback(() => {
    setPendingAppend(null);
  }, []);

  const loadSample = useCallback(async () => {
    const rows = await parseCsvString(sampleCsv);
    setRawRows(rows);
    setValidationErrors([]);
    const dateSamples = rows.map(r => r['date'] || '').filter(Boolean);
    const fmt = detectDateFormat(dateSamples);
    const samplePreview = dateSamples.slice(0, 3).join(', ');
    toast.success('Sample data loaded', {
      description: samplePreview ? `Date format: ${getDateFormatLabel(fmt)} — samples: ${samplePreview}` : undefined,
    });
  }, []);

  const clearData = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
    setRawRows([]);
    setAnalysis([]);
    setValidationErrors([]);
    setIsCalculating(false);
    setCalculationProgress(0);
    clearRows();
    toast.info('Data cleared');
  }, []);

  return (
    <InventoryContext.Provider value={{
      analysis,
      suppliers,
      categories,
      filterSupplier,
      setFilterSupplier,
      filterCategory,
      setFilterCategory,
      demandDays,
      setDemandDays,
      searchQuery,
      setSearchQuery,
      serviceLevel,
      setServiceLevel,
      hasData: rawRows.length > 0,
      loadFile,
      loadFileWithMapping,
      appendFile,
      loadSample,
      clearData,
      filtered,
      validationErrors,
      thresholds,
      setThresholds,
      isCalculating,
      calculationProgress,
      stockOverrides,
      setStockOverride,
      clearStockOverrides,
      stockOverrideCount,
      pendingFile,
      pendingHeaders,
      pendingRawData,
      setPendingFile,
      pendingAppend: pendingAppend ? { analysis: pendingAppend.analysis, fileName: pendingAppend.fileName } : null,
      confirmAppend,
      cancelAppend,
      costSettings,
      setCostSettings,
    }}>
      {children}
    </InventoryContext.Provider>
  );
}
