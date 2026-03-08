/** Detected date format category */
export type DateFormatHint = 'ISO' | 'EU-dot-YMD' | 'EU-dot-DMY' | 'EU-slash-DMY' | 'US-slash-MDY' | 'fallback' | 'unknown';

/**
 * Parse a wide variety of date strings into ISO yyyy-MM-dd.
 * Returns null for unparseable / empty input.
 */
export function parseFlexibleDate(raw: string): string | null {
  if (!raw?.trim()) return null;
  const s = raw.trim();

  // Already ISO: 2025-03-08 or 2025-03-08T...
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);

  // Hungarian/European: 2025.03.08
  const dotYMD = s.match(/^(\d{4})\.(\d{2})\.(\d{2})$/);
  if (dotYMD) return `${dotYMD[1]}-${dotYMD[2]}-${dotYMD[3]}`;

  // European: 08.03.2025
  const dotDMY = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (dotDMY) return `${dotDMY[3]}-${dotDMY[2]}-${dotDMY[1]}`;

  // European slash: 08/03/2025
  const slashDMY = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (slashDMY) return `${slashDMY[3]}-${slashDMY[2]}-${slashDMY[1]}`;

  // Fallback: try Date.parse
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);

  return null;
}

/**
 * Detect the predominant date format in a set of raw date strings.
 */
export function detectDateFormat(samples: string[]): DateFormatHint {
  const counts: Record<DateFormatHint, number> = {
    'ISO': 0, 'EU-dot-YMD': 0, 'EU-dot-DMY': 0,
    'EU-slash-DMY': 0, 'US-slash-MDY': 0, 'fallback': 0, 'unknown': 0,
  };

  for (const raw of samples.slice(0, 100)) {
    const s = raw?.trim();
    if (!s) continue;
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) { counts['ISO']++; continue; }
    if (/^\d{4}\.\d{2}\.\d{2}$/.test(s)) { counts['EU-dot-YMD']++; continue; }
    if (/^\d{2}\.\d{2}\.\d{4}$/.test(s)) { counts['EU-dot-DMY']++; continue; }
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) { counts['EU-slash-DMY']++; continue; }
    const d = new Date(s);
    if (!isNaN(d.getTime())) { counts['fallback']++; continue; }
    counts['unknown']++;
  }

  let best: DateFormatHint = 'unknown';
  let bestCount = 0;
  for (const [fmt, cnt] of Object.entries(counts)) {
    if (cnt > bestCount) { bestCount = cnt; best = fmt as DateFormatHint; }
  }
  return best;
}

const DATE_FORMAT_LABELS: Record<DateFormatHint, string> = {
  'ISO': 'ISO (yyyy-MM-dd)',
  'EU-dot-YMD': 'European dot (yyyy.MM.dd)',
  'EU-dot-DMY': 'European dot (dd.MM.yyyy)',
  'EU-slash-DMY': 'European slash (dd/MM/yyyy)',
  'US-slash-MDY': 'US slash (MM/dd/yyyy)',
  'fallback': 'auto-detected',
  'unknown': 'unknown',
};

export function getDateFormatLabel(hint: DateFormatHint): string {
  return DATE_FORMAT_LABELS[hint] || 'unknown';
}
