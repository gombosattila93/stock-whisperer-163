import Papa from 'papaparse';
import { RawRow } from './types';

// Re-export date utilities for backward compatibility
export { parseFlexibleDate, detectDateFormat, getDateFormatLabel } from './dateUtils';
export type { DateFormatHint } from './dateUtils';

/**
 * Detect if file content is Windows-1250 encoded.
 * If UTF-8 decoding produces replacement characters (�), re-decode as windows-1250.
 */
export async function readFileWithEncodingDetection(file: File): Promise<{ text: string; encoding: string }> {
  const buffer = await file.arrayBuffer();

  // Try UTF-8 first
  const utf8 = new TextDecoder('utf-8').decode(buffer);
  if (!utf8.includes('\uFFFD')) {
    return { text: utf8, encoding: 'UTF-8' };
  }

  // Fallback to Windows-1250
  try {
    const win1250 = new TextDecoder('windows-1250').decode(buffer);
    return { text: win1250, encoding: 'Windows-1250' };
  } catch {
    // If windows-1250 decoder not available, use UTF-8 anyway
    return { text: utf8, encoding: 'UTF-8 (with errors)' };
  }
}

export function parseCsvString(csvString: string): Promise<RawRow[]> {
  return new Promise((resolve, reject) => {
    Papa.parse<RawRow>(csvString, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.replace(/^\uFEFF/, '').trim(),
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
      transformHeader: (h) => h.replace(/^\uFEFF/, '').trim(),
      complete: (results) => resolve(results.data),
      error: (err: Error) => reject(err),
    });
  });
}

/** Parse CSV with encoding detection — returns raw string records */
export async function parseCsvFileWithEncoding(file: File): Promise<{ rows: Record<string, string>[]; encoding: string }> {
  const { text, encoding } = await readFileWithEncodingDetection(file);
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.replace(/^\uFEFF/, '').trim(),
      complete: (results) => resolve({ rows: results.data, encoding }),
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
