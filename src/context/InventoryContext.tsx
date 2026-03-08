import React, { createContext, useContext, useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { RawRow, SkuAnalysis, XyzClass, SupplierOption, ProjectReservation, ImportSummary } from '@/lib/types';
import { SERVICE_LEVELS } from '@/lib/calculations';
import { parseCsvFile, parseCsvString, parseCsvFileRaw, parseCsvFileWithEncoding, detectDateFormat, getDateFormatLabel } from '@/lib/csvUtils';
import { validateCsvRows, CsvValidationError } from '@/lib/csvValidation';
import { sampleCsv } from '@/lib/sampleData';
import {
  saveRows, loadRows, clearRows,
  StockOverrides, saveStockOverrides, loadStockOverrides,
  saveCostSettings, loadCostSettings,
  SkuSupplierOptionsMap, saveSkuSupplierOptions, loadSkuSupplierOptions,
  saveReservations, loadReservations,
  isIndexedDBAvailable, wasIndexedDBWarningShown, markIndexedDBWarningShown,
} from '@/lib/persistence';
import { ClassificationThresholds, DEFAULT_THRESHOLDS } from '@/lib/classificationTypes';
import { CostSettings, DEFAULT_COST_SETTINGS } from '@/lib/costSettings';
import { ColumnMapping } from '@/components/ColumnMapper';
import { analyzeDuplicates, DuplicateAnalysis, partialFingerprint } from '@/lib/duplicateDetection';
import type { ConflictResolution } from '@/components/DuplicateDetectionModal';
import { toast } from 'sonner';
import type { WorkerRequest, WorkerResponse } from '@/workers/inventoryWorker';
import { parseFlexibleDate } from '@/lib/dateUtils';

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
  stockOverrides: StockOverrides;
  setStockOverride: (sku: string, field: string, value: number) => void;
  clearStockOverrides: () => void;
  stockOverrideCount: number;
  pendingFile: File | null;
  pendingHeaders: string[];
  pendingRawData: Record<string, string>[];
  setPendingFile: (f: File | null) => void;
  pendingAppend: { analysis: DuplicateAnalysis; fileName: string } | null;
  confirmAppend: (resolutions: Map<string, ConflictResolution>) => void;
  cancelAppend: () => void;
  costSettings: CostSettings;
  setCostSettings: (s: CostSettings) => void;
  skuSupplierOptions: SkuSupplierOptionsMap;
  setSkuSupplierOptions: (sku: string, options: SupplierOption[]) => void;
  reservations: ProjectReservation[];
  addReservation: (r: ProjectReservation) => void;
  updateReservation: (id: string, status: 'fulfilled' | 'cancelled') => void;
  reservedQtyMap: Record<string, number>;
  // Import summary modal
  pendingImportSummary: ImportSummary | null;
  pendingImportRows: RawRow[] | null;
  confirmImport: () => void;
  cancelImport: () => void;
  // Extreme values
  pendingExtremeValues: { skus: string[]; rows: RawRow[] } | null;
  confirmExtremeInclude: () => void;
  confirmExtremeExclude: () => void;
  // IndexedDB availability
  indexedDBAvailable: boolean;
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

/** Build import summary from validated rows */
function buildImportSummary(
  totalRows: number,
  validated: RawRow[],
  skippedReasons: { reason: string; count: number }[],
  detectedDateFormat: string,
  detectedEncoding: string,
): ImportSummary {
  const skus = new Set(validated.map(r => r.sku));
  const dates = validated
    .map(r => parseFlexibleDate(String(r.date)) ?? String(r.date))
    .filter(Boolean)
    .sort();

  const warnings: string[] = [];
  const daySpan = dates.length > 1
    ? Math.round((new Date(dates[dates.length - 1]).getTime() - new Date(dates[0]).getTime()) / 86400000)
    : 0;
  if (daySpan < 90 && daySpan > 0) {
    warnings.push(`Only ${daySpan} days of data — recommend 90+ for reliable analysis`);
  }

  // Check for SKUs with no stock data
  const skuStockMap = new Map<string, boolean>();
  for (const r of validated) {
    const val = Number(r.stock_qty);
    if (!isNaN(val) && val > 0) skuStockMap.set(r.sku, true);
    else if (!skuStockMap.has(r.sku)) skuStockMap.set(r.sku, false);
  }
  const noStockSkus = [...skuStockMap.entries()].filter(([, v]) => !v).length;
  if (noStockSkus > 0) {
    warnings.push(`${noStockSkus} SKUs have no stock_qty data — defaulted to 0`);
  }

  // Check for missing lead_time
  const noLeadTime = validated.filter(r => !Number(r.lead_time_days)).length;
  const uniqueNoLead = new Set(validated.filter(r => !Number(r.lead_time_days)).map(r => r.sku)).size;
  if (uniqueNoLead > 0) {
    warnings.push(`lead_time_days missing for ${uniqueNoLead} SKUs — defaulted to 1 day`);
  }

  // Negative prices
  const negPrices = validated.filter(r => Number(r.unit_price) < 0).length;
  if (negPrices > 0) {
    warnings.push(`${negPrices} rows with negative unit_price — treated as 0`);
  }

  return {
    totalRows,
    validRows: validated.length,
    skippedRows: totalRows - validated.length,
    skippedReasons: skippedReasons.filter(r => r.count > 0),
    detectedDateFormat,
    detectedEncoding,
    uniqueSkus: skus.size,
    dateRange: {
      from: dates[0] || 'N/A',
      to: dates[dates.length - 1] || 'N/A',
    },
    dataWarnings: warnings,
  };
}

/** Detect extreme values: sold_qty > mean + 4×stddev */
function detectExtremeValues(rows: RawRow[]): { extremeSkus: string[]; extremeCount: number } {
  const quantities = rows.map(r => Number(r.sold_qty) || 0).filter(q => q > 0);
  if (quantities.length < 10) return { extremeSkus: [], extremeCount: 0 };

  const mean = quantities.reduce((s, v) => s + v, 0) / quantities.length;
  const variance = quantities.reduce((s, v) => s + (v - mean) ** 2, 0) / quantities.length;
  const stddev = Math.sqrt(variance);
  const threshold = mean + 4 * stddev;

  if (threshold <= 0) return { extremeSkus: [], extremeCount: 0 };

  const extremeRows = rows.filter(r => (Number(r.sold_qty) || 0) > threshold);
  const extremeSkus = [...new Set(extremeRows.map(r => r.sku))];
  return { extremeSkus, extremeCount: extremeRows.length };
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
  const [skuSupplierOptions, setSkuSupplierOptionsRaw] = useState<SkuSupplierOptionsMap>({});
  const [reservations, setReservations] = useState<ProjectReservation[]>([]);
  const [indexedDBAvailable, setIndexedDBAvailable] = useState(true);

  // Import summary modal state
  const [pendingImportSummary, setPendingImportSummary] = useState<ImportSummary | null>(null);
  const [pendingImportRows, setPendingImportRows] = useState<RawRow[] | null>(null);

  // Extreme value state
  const [pendingExtremeValues, setPendingExtremeValues] = useState<{ skus: string[]; rows: RawRow[] } | null>(null);
  const [extremeRowsToConfirm, setExtremeRowsToConfirm] = useState<RawRow[] | null>(null);

  const workerRef = useRef<Worker | null>(null);
  const isProcessingRef = useRef(false);

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

  const setSkuSupplierOption = useCallback((sku: string, options: SupplierOption[]) => {
    setSkuSupplierOptionsRaw(prev => {
      const next = { ...prev, [sku]: options };
      if (options.length === 0) delete next[sku];
      saveSkuSupplierOptions(next);
      return next;
    });
  }, []);

  // Reservations
  const addReservation = useCallback((r: ProjectReservation) => {
    setReservations(prev => {
      const next = [...prev, r];
      saveReservations(next);
      return next;
    });
  }, []);

  const updateReservation = useCallback((id: string, status: 'fulfilled' | 'cancelled') => {
    setReservations(prev => {
      const next = prev.map(r => r.id === id ? { ...r, status } : r);
      saveReservations(next);
      return next;
    });
  }, []);

  const reservedQtyMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of reservations) {
      if (r.status !== 'active') continue;
      for (const item of r.items) {
        map[item.sku] = (map[item.sku] || 0) + item.reservedQty;
      }
    }
    return map;
  }, [reservations]);

  // 4g) beforeunload warning during CSV processing
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isProcessingRef.current) {
        e.preventDefault();
        e.returnValue = 'Data is being processed — leaving may cause data loss';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  // Cleanup worker on unmount
  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
    };
  }, []);

  useEffect(() => {
    Promise.all([loadRows(), loadStockOverrides(), loadCostSettings(), loadSkuSupplierOptions(), loadReservations()]).then(([rows, overrides, costs, supplierOpts, resv]) => {
      if (rows && rows.length > 0) {
        setRawRows(rows);
        toast.success(`Restored ${rows.length} rows from previous session`);
      }
      if (overrides && Object.keys(overrides).length > 0) {
        setStockOverrides(overrides);
      }
      setCostSettingsRaw(costs);
      if (supplierOpts && Object.keys(supplierOpts).length > 0) {
        setSkuSupplierOptionsRaw(supplierOpts);
      }
      if (resv && resv.length > 0) {
        setReservations(resv);
      }
      setPersistenceLoaded(true);

      // 4f) Check IndexedDB availability
      if (!isIndexedDBAvailable() && !wasIndexedDBWarningShown()) {
        setIndexedDBAvailable(false);
        markIndexedDBWarningShown();
      }
    }).catch(() => {
      // IndexedDB completely unavailable
      setIndexedDBAvailable(false);
      setPersistenceLoaded(true);
      if (!wasIndexedDBWarningShown()) {
        markIndexedDBWarningShown();
      }
    });
  }, []);

  useEffect(() => {
    if (persistenceLoaded && rawRows.length > 0) {
      saveRows(rawRows);
    }
  }, [rawRows, persistenceLoaded]);

  const serviceFactor = SERVICE_LEVELS[serviceLevel] ?? 1.65;

  // Run analysis via Web Worker
  useEffect(() => {
    if (rawRows.length === 0) {
      setAnalysis([]);
      return;
    }

    workerRef.current?.terminate();

    const worker = createWorker();
    workerRef.current = worker;

    setIsCalculating(true);
    setCalculationProgress(0);

    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      if (e.data.type === 'PROGRESS') {
        setCalculationProgress(e.data.payload.pct);
      } else if (e.data.type === 'RESULT') {
        const results = e.data.payload.map(item => {
          const reserved = reservedQtyMap[item.sku] || 0;
          const available = item.stock_qty - reserved;
          const newEffective = available + item.ordered_qty;
          const effectiveDemand = item.demandMethod === 'ewma' ? item.avg_daily_demand_ewma : item.avg_daily_demand;
          const newDaysOfStock = effectiveDemand > 0 ? newEffective / effectiveDemand : (newEffective > 0 ? Infinity : 0);
          return {
            ...item,
            reserved_qty: reserved,
            available_qty: available,
            effective_stock: reserved > 0 ? newEffective : item.effective_stock,
            days_of_stock: reserved > 0 ? newDaysOfStock : item.days_of_stock,
          };
        });
        setAnalysis(results);
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
  }, [rawRows, demandDays, serviceFactor, thresholds, stockOverrides, costSettings, reservedQtyMap]);

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

  // Import summary confirmation flow
  const confirmImport = useCallback(() => {
    if (pendingImportRows) {
      isProcessingRef.current = true;
      setRawRows(pendingImportRows);
      isProcessingRef.current = false;
    }
    setPendingImportSummary(null);
    setPendingImportRows(null);
  }, [pendingImportRows]);

  const cancelImport = useCallback(() => {
    setPendingImportSummary(null);
    setPendingImportRows(null);
  }, []);

  // Extreme value confirmation
  const confirmExtremeInclude = useCallback(() => {
    if (extremeRowsToConfirm) {
      showImportSummaryForRows(extremeRowsToConfirm, lastEncoding.current, lastTotalRows.current);
    }
    setPendingExtremeValues(null);
    setExtremeRowsToConfirm(null);
  }, [extremeRowsToConfirm]);

  const confirmExtremeExclude = useCallback(() => {
    if (extremeRowsToConfirm && pendingExtremeValues) {
      const extremeSkuSet = new Set(pendingExtremeValues.skus);
      const filtered = extremeRowsToConfirm.filter(r => {
        const qty = Number(r.sold_qty) || 0;
        // Only exclude the extreme qty rows, not whole SKUs
        const quantities = extremeRowsToConfirm.map(row => Number(row.sold_qty) || 0).filter(q => q > 0);
        const mean = quantities.reduce((s, v) => s + v, 0) / quantities.length;
        const variance = quantities.reduce((s, v) => s + (v - mean) ** 2, 0) / quantities.length;
        const stddev = Math.sqrt(variance);
        return qty <= mean + 4 * stddev;
      });
      showImportSummaryForRows(filtered, lastEncoding.current, lastTotalRows.current);
    }
    setPendingExtremeValues(null);
    setExtremeRowsToConfirm(null);
  }, [extremeRowsToConfirm, pendingExtremeValues]);

  const lastEncoding = useRef('UTF-8');
  const lastTotalRows = useRef(0);

  const showImportSummaryForRows = useCallback((validated: RawRow[], encoding: string, totalRows: number) => {
    // Count future date rows that were filtered
    const futureDateCount = totalRows - validated.length; // approximate
    const dateSamples = validated.map(r => String(r.date)).filter(Boolean);
    const fmt = detectDateFormat(dateSamples);

    const skippedReasons: { reason: string; count: number }[] = [];
    if (futureDateCount > 0) {
      skippedReasons.push({ reason: 'Future dates', count: futureDateCount });
    }

    const summary = buildImportSummary(totalRows, validated, skippedReasons, getDateFormatLabel(fmt), encoding);
    setPendingImportSummary(summary);
    setPendingImportRows(validated);
  }, []);

  const loadFile = useCallback(async (file: File) => {
    try {
      isProcessingRef.current = true;

      // 1a) Encoding detection
      const { rows: rawParsed, encoding } = await parseCsvFileWithEncoding(file);
      lastEncoding.current = encoding;

      if (encoding !== 'UTF-8') {
        toast.info(`Detected ${encoding} encoding, converted to UTF-8`);
      }

      if (rawParsed.length === 0) {
        toast.error('CSV file contains no data');
        isProcessingRef.current = false;
        return;
      }

      lastTotalRows.current = rawParsed.length;
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
        isProcessingRef.current = false;
        return;
      }

      const parsed = await parseCsvFile(file);
      const validated = processAndValidate(parsed);
      if (validated.length > 0) {
        // 1c) Extreme value detection
        const { extremeSkus, extremeCount } = detectExtremeValues(validated);
        if (extremeCount > 0) {
          setPendingExtremeValues({ skus: extremeSkus, rows: validated });
          setExtremeRowsToConfirm(validated);
          toast.warning(`${extremeCount} rows with unusually high quantities detected — SKUs: ${extremeSkus.slice(0, 5).join(', ')}`, {
            duration: 8000,
          });
          isProcessingRef.current = false;
          return;
        }

        showImportSummaryForRows(validated, encoding, rawParsed.length);
      }
      isProcessingRef.current = false;
    } catch (err) {
      isProcessingRef.current = false;
      toast.error('Failed to parse CSV file', {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }, [processAndValidate, showImportSummaryForRows]);

  const loadFileWithMapping = useCallback(async (file: File, mapping: ColumnMapping) => {
    try {
      isProcessingRef.current = true;
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
        showImportSummaryForRows(validated, lastEncoding.current, rawParsed.length);
      }
      setPendingFile(null);
      setPendingHeaders([]);
      setPendingRawData([]);
      isProcessingRef.current = false;
    } catch (err) {
      isProcessingRef.current = false;
      toast.error('Failed to process mapped CSV', {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }, [processAndValidate, showImportSummaryForRows]);

  // Pending append state for duplicate detection
  const [pendingAppend, setPendingAppend] = useState<{
    analysis: DuplicateAnalysis;
    fileName: string;
    validated: RawRow[];
  } | null>(null);

  const appendFile = useCallback(async (file: File) => {
    try {
      isProcessingRef.current = true;
      const parsed = await parseCsvFile(file);
      const validated = processAndValidate(parsed);
      if (validated.length === 0) {
        isProcessingRef.current = false;
        return;
      }

      if (rawRows.length === 0) {
        setRawRows(validated);
        toast.success(`Appended ${validated.length} rows from ${file.name}`);
        isProcessingRef.current = false;
        return;
      }

      const dupAnalysis = analyzeDuplicates(rawRows, validated);

      if (dupAnalysis.exactDuplicates.length === 0 && dupAnalysis.conflicts.length === 0) {
        setRawRows(prev => [...prev, ...dupAnalysis.genuineNew]);
        toast.success(`Appended ${dupAnalysis.genuineNew.length} rows from ${file.name}`);
        isProcessingRef.current = false;
        return;
      }

      setPendingAppend({ analysis: dupAnalysis, fileName: file.name, validated });
      isProcessingRef.current = false;
    } catch (err) {
      isProcessingRef.current = false;
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
      skuSupplierOptions,
      setSkuSupplierOptions: setSkuSupplierOption,
      reservations,
      addReservation,
      updateReservation,
      reservedQtyMap,
      pendingImportSummary,
      pendingImportRows,
      confirmImport,
      cancelImport,
      pendingExtremeValues,
      confirmExtremeInclude,
      confirmExtremeExclude,
      indexedDBAvailable,
    }}>
      {children}
    </InventoryContext.Provider>
  );
}
