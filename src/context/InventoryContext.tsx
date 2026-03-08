import React, { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';
import { RawRow, SkuAnalysis, XyzClass } from '@/lib/types';
import { parseRows, analyzeSkus, SERVICE_LEVELS } from '@/lib/calculations';
import { parseCsvFile, parseCsvString, parseCsvFileRaw, detectDateFormat, getDateFormatLabel } from '@/lib/csvUtils';
import { validateCsvRows, CsvValidationError } from '@/lib/csvValidation';
import { sampleCsv } from '@/lib/sampleData';
import { saveRows, loadRows, clearRows } from '@/lib/persistence';
import { ClassificationThresholds, DEFAULT_THRESHOLDS } from '@/components/ClassificationSettings';
import { ColumnMapping } from '@/components/ColumnMapper';
import { toast } from 'sonner';

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
  // For column mapping flow
  pendingFile: File | null;
  pendingHeaders: string[];
  pendingRawData: Record<string, string>[];
  setPendingFile: (f: File | null) => void;
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

export function InventoryProvider({ children }: { children: React.ReactNode }) {
  const [rawRows, setRawRows] = useState<RawRow[]>([]);
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

  const setDemandDays = useCallback((v: number) => {
    setDemandDaysRaw(clampDemandDays(v));
  }, []);

  useEffect(() => {
    loadRows().then(rows => {
      if (rows && rows.length > 0) {
        setRawRows(rows);
        toast.success(`Restored ${rows.length} rows from previous session`);
      }
      setPersistenceLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (persistenceLoaded && rawRows.length > 0) {
      saveRows(rawRows);
    }
  }, [rawRows, persistenceLoaded]);

  const serviceFactor = SERVICE_LEVELS[serviceLevel] ?? 1.65;

  const processData = useCallback((rows: RawRow[], days: number, factor: number, t: ClassificationThresholds) => {
    const skuMap = parseRows(rows);
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    return analyzeSkus(skuMap, startDate, endDate, days, factor, t);
  }, []);

  const analysis = useMemo(() => {
    if (rawRows.length === 0) return [];
    return processData(rawRows, demandDays, serviceFactor, thresholds);
  }, [rawRows, demandDays, serviceFactor, thresholds, processData]);

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
      // First check if headers match; if not, open column mapper
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
        // Open column mapper with raw data for date preview
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
      // Apply mapping: remap columns
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

  const appendFile = useCallback(async (file: File) => {
    try {
      const parsed = await parseCsvFile(file);
      const validated = processAndValidate(parsed);
      if (validated.length > 0) {
        setRawRows(prev => [...prev, ...validated]);
        toast.success(`Appended ${validated.length} rows from ${file.name}`);
      }
    } catch (err) {
      toast.error('Failed to parse CSV file', {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }, [processAndValidate]);

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
    setRawRows([]);
    setValidationErrors([]);
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
      pendingFile,
      pendingHeaders,
      pendingRawData,
      setPendingFile,
    }}>
      {children}
    </InventoryContext.Provider>
  );
}
