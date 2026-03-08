import { describe, it, expect } from 'vitest';
import { parseFlexibleDate, detectDateFormat, getDateFormatLabel } from './dateUtils';

describe('parseFlexibleDate', () => {
  it('parses ISO format (yyyy-MM-dd)', () => {
    expect(parseFlexibleDate('2025-03-08')).toBe('2025-03-08');
    expect(parseFlexibleDate('2025-01-15T10:30:00')).toBe('2025-01-15');
  });

  it('parses Hungarian/European dot YMD (yyyy.MM.dd)', () => {
    expect(parseFlexibleDate('2025.03.08')).toBe('2025-03-08');
    expect(parseFlexibleDate('2024.12.01')).toBe('2024-12-01');
  });

  it('parses European dot DMY (dd.MM.yyyy)', () => {
    expect(parseFlexibleDate('08.03.2025')).toBe('2025-03-08');
    expect(parseFlexibleDate('31.12.2024')).toBe('2024-12-31');
  });

  it('parses European slash DMY (dd/MM/yyyy)', () => {
    expect(parseFlexibleDate('08/03/2025')).toBe('2025-03-08');
    expect(parseFlexibleDate('25/12/2024')).toBe('2024-12-25');
  });

  it('returns null for empty/invalid input', () => {
    expect(parseFlexibleDate('')).toBeNull();
    expect(parseFlexibleDate('  ')).toBeNull();
    expect(parseFlexibleDate('not-a-date')).toBeNull();
  });

  it('trims whitespace', () => {
    expect(parseFlexibleDate('  2025-03-08  ')).toBe('2025-03-08');
    expect(parseFlexibleDate(' 08.03.2025 ')).toBe('2025-03-08');
  });

  it('handles fallback via Date.parse', () => {
    expect(parseFlexibleDate('March 8, 2025')).toBe('2025-03-08');
  });
});

describe('detectDateFormat', () => {
  it('detects ISO format', () => {
    expect(detectDateFormat(['2025-03-08', '2025-03-09', '2025-03-10'])).toBe('ISO');
  });

  it('detects European dot YMD', () => {
    expect(detectDateFormat(['2025.03.08', '2025.03.09', '2025.03.10'])).toBe('EU-dot-YMD');
  });

  it('detects European dot DMY', () => {
    expect(detectDateFormat(['08.03.2025', '09.03.2025', '10.03.2025'])).toBe('EU-dot-DMY');
  });

  it('detects European slash DMY', () => {
    expect(detectDateFormat(['08/03/2025', '09/03/2025', '10/03/2025'])).toBe('EU-slash-DMY');
  });

  it('returns unknown for empty input', () => {
    expect(detectDateFormat([])).toBe('unknown');
  });
});

describe('getDateFormatLabel', () => {
  it('returns human-readable labels', () => {
    expect(getDateFormatLabel('ISO')).toBe('ISO (yyyy-MM-dd)');
    expect(getDateFormatLabel('EU-dot-DMY')).toBe('European dot (dd.MM.yyyy)');
  });
});
