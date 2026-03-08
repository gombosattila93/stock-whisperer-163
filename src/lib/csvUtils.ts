import Papa from 'papaparse';
import { RawRow } from './types';

export function parseCsvString(csvString: string): Promise<RawRow[]> {
  return new Promise((resolve, reject) => {
    Papa.parse<RawRow>(csvString, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
      complete: (results) => resolve(results.data),
      error: (err: Error) => reject(err),
    });
  });
}

export function parseCsvFile(file: File): Promise<RawRow[]> {
  return new Promise((resolve, reject) => {
    Papa.parse<RawRow>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
      complete: (results) => resolve(results.data),
      error: (err: Error) => reject(err),
    });
  });
}

/** Parse CSV without type coercion — returns raw string records for column mapping */
export function parseCsvFileRaw(file: File): Promise<Record<string, string>[]> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
      complete: (results) => resolve(results.data),
      error: (err: Error) => reject(err),
    });
  });
}

export function exportToCsv(data: Record<string, unknown>[], filename: string) {
  const csv = Papa.unparse(data);
  // Add UTF-8 BOM for Excel compatibility
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  // Delay revokeObjectURL to ensure download starts
  setTimeout(() => URL.revokeObjectURL(link.href), 100);
}
