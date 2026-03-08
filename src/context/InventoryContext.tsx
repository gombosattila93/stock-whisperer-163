import React, { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';
import { RawRow, SkuAnalysis } from '@/lib/types';
import { parseRows, analyzeSkus, SERVICE_LEVELS } from '@/lib/calculations';
import { parseCsvFile, parseCsvString } from '@/lib/csvUtils';
import { validateCsvRows, CsvValidationError } from '@/lib/csvValidation';
import { sampleCsv } from '@/lib/sampleData';
import { saveRows, loadRows, clearRows } from '@/lib/persistence';
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
  appendFile: (file: File) => Promise<void>;
  loadSample: () => Promise<void>;
  clearData: () => void;
  filtered: SkuAnalysis[];
  validationErrors: CsvValidationError[];
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

  // Clamp demand days on set
  const setDemandDays = useCallback((v: number) => {
    setDemandDaysRaw(clampDemandDays(v));
  }, []);

  // Restore persisted data on mount
  useEffect(() => {
    loadRows().then(rows => {
      if (rows && rows.length > 0) {
        setRawRows(rows);
        toast.success(`Restored ${rows.length} rows from previous session`);
      }
      setPersistenceLoaded(true);
    });
  }, []);

  // Persist data when it changes
  useEffect(() => {
    if (persistenceLoaded && rawRows.length > 0) {
      saveRows(rawRows);
    }
  }, [rawRows, persistenceLoaded]);

  const serviceFactor = SERVICE_LEVELS[serviceLevel] ?? 1.65;

  const processData = useCallback((rows: RawRow[], days: number, factor: number) => {
    const skuMap = parseRows(rows);
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    return analyzeSkus(skuMap, startDate, endDate, days, factor);
  }, []);

  const analysis = useMemo(() => {
    if (rawRows.length === 0) return [];
    return processData(rawRows, demandDays, serviceFactor);
  }, [rawRows, demandDays, serviceFactor, processData]);

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
      const parsed = await parseCsvFile(file);
      const validated = processAndValidate(parsed);
      if (validated.length > 0) {
        setRawRows(validated);
        toast.success(`Loaded ${validated.length} rows from ${file.name}`);
      }
    } catch (err) {
      toast.error('Failed to parse CSV file', {
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
    toast.success('Sample data loaded');
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
      appendFile,
      loadSample,
      clearData,
      filtered,
      validationErrors,
    }}>
      {children}
    </InventoryContext.Provider>
  );
}
