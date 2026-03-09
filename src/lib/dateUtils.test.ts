import { describe, it, expect } from 'vitest';
import { parseFlexibleDate, detectDateFormat, getDateFormatLabel, getSlashHintFromFormat } from './dateUtils';

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

  it('parses slash dates as DMY by default (dd/MM/yyyy)', () => {
    expect(parseFlexibleDate('08/03/2025')).toBe('2025-03-08');
    expect(parseFlexibleDate('25/12/2024')).toBe('2024-12-25');
  });

  it('parses slash dates as DMY with explicit hint', () => {
    expect(parseFlexibleDate('08/03/2025', 'DMY')).toBe('2025-03-08');
    expect(parseFlexibleDate('25/12/2024', 'DMY')).toBe('2024-12-25');
  });

  it('parses slash dates as MDY with explicit hint', () => {
    expect(parseFlexibleDate('03/08/2025', 'MDY')).toBe('2025-03-08');
    expect(parseFlexibleDate('12/25/2024', 'MDY')).toBe('2024-12-25');
  });

  it('ambiguous slash date: 05/03/2025 depends on hint', () => {
    // Without hint → DMY (European default): day=05, month=03
    expect(parseFlexibleDate('05/03/2025')).toBe('2025-03-05');
    // With DMY hint: day=05, month=03
    expect(parseFlexibleDate('05/03/2025', 'DMY')).toBe('2025-03-05');
    // With MDY hint: month=05, day=03
    expect(parseFlexibleDate('05/03/2025', 'MDY')).toBe('2025-05-03');
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

  it('detects EU-slash-DMY when first part > 12 (unambiguous)', () => {
    // 25/03/2025 → first part 25 > 12, must be day → DMY
    expect(detectDateFormat(['25/03/2025', '15/06/2025', '08/01/2025'])).toBe('EU-slash-DMY');
  });

  it('detects US-slash-MDY when second part > 12 (unambiguous)', () => {
    // 03/25/2025 → second part 25 > 12, must be day → MDY
    expect(detectDateFormat(['03/25/2025', '06/15/2025', '01/08/2025'])).toBe('US-slash-MDY');
  });

  it('defaults to EU-slash-DMY for fully ambiguous slash dates', () => {
    // All parts ≤ 12 — no way to tell, defaults to European
    expect(detectDateFormat(['05/03/2025', '08/06/2025', '01/12/2025'])).toBe('EU-slash-DMY');
  });

  it('defaults to EU-slash-DMY for contradictory slash dates (some first>12, some second>12)', () => {
    // 25/03/2025 → first=25>12 implies DMY; 06/15/2025 → second=15>12 implies MDY
    // Both signals present — impossible to resolve, falls back to European
    expect(detectDateFormat(['25/03/2025', '06/15/2025'])).toBe('EU-slash-DMY');
  });

  it('returns unknown for empty input', () => {
    expect(detectDateFormat([])).toBe('unknown');
  });
});

describe('getSlashHintFromFormat', () => {
  it('returns DMY for EU-slash-DMY', () => {
    expect(getSlashHintFromFormat('EU-slash-DMY')).toBe('DMY');
  });

  it('returns MDY for US-slash-MDY', () => {
    expect(getSlashHintFromFormat('US-slash-MDY')).toBe('MDY');
  });

  it('returns null for non-slash formats', () => {
    expect(getSlashHintFromFormat('ISO')).toBeNull();
    expect(getSlashHintFromFormat('EU-dot-YMD')).toBeNull();
    expect(getSlashHintFromFormat('EU-dot-DMY')).toBeNull();
    expect(getSlashHintFromFormat('fallback')).toBeNull();
    expect(getSlashHintFromFormat('unknown')).toBeNull();
  });
});

describe('getDateFormatLabel', () => {
  it('returns human-readable labels', () => {
    expect(getDateFormatLabel('ISO')).toBe('ISO (yyyy-MM-dd)');
    expect(getDateFormatLabel('EU-dot-DMY')).toBe('European dot (dd.MM.yyyy)');
  });
});
