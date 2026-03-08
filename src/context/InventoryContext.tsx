import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { RawRow, SkuAnalysis } from '@/lib/types';
import { parseRows, analyzeSkus } from '@/lib/calculations';
import { parseCsvFile, parseCsvString } from '@/lib/csvUtils';
import { sampleCsv } from '@/lib/sampleData';

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
  hasData: boolean;
  loadFile: (file: File) => Promise<void>;
  loadSample: () => Promise<void>;
  filtered: SkuAnalysis[];
}

const InventoryContext = createContext<InventoryContextType | null>(null);

export function useInventory() {
  const ctx = useContext(InventoryContext);
  if (!ctx) throw new Error('useInventory must be used within InventoryProvider');
  return ctx;
}

export function InventoryProvider({ children }: { children: React.ReactNode }) {
  const [rawRows, setRawRows] = useState<RawRow[]>([]);
  const [filterSupplier, setFilterSupplier] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [demandDays, setDemandDays] = useState(90);

  const processData = useCallback((rows: RawRow[], days: number) => {
    const skuMap = parseRows(rows);
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    return analyzeSkus(skuMap, startDate, endDate, days);
  }, []);

  const analysis = useMemo(() => {
    if (rawRows.length === 0) return [];
    return processData(rawRows, demandDays);
  }, [rawRows, demandDays, processData]);

  const suppliers = useMemo(() => [...new Set(analysis.map(a => a.supplier))].sort(), [analysis]);
  const categories = useMemo(() => [...new Set(analysis.map(a => a.category))].sort(), [analysis]);

  const filtered = useMemo(() => {
    return analysis.filter(a => {
      if (filterSupplier && a.supplier !== filterSupplier) return false;
      if (filterCategory && a.category !== filterCategory) return false;
      return true;
    });
  }, [analysis, filterSupplier, filterCategory]);

  const loadFile = useCallback(async (file: File) => {
    const rows = await parseCsvFile(file);
    setRawRows(rows);
  }, []);

  const loadSample = useCallback(async () => {
    const rows = await parseCsvString(sampleCsv);
    setRawRows(rows);
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
      hasData: rawRows.length > 0,
      loadFile,
      loadSample,
      filtered,
    }}>
      {children}
    </InventoryContext.Provider>
  );
}
