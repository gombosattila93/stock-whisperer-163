/** Detected date format category */
export type DateFormatHint = 'ISO' | 'EU-dot-YMD' | 'EU-dot-DMY' | 'EU-slash-DMY' | 'US-slash-MDY' | 'fallback' | 'unknown';

/** Slash format hint: 'DMY' = dd/MM/yyyy (European), 'MDY' = MM/dd/yyyy (US) */
export type SlashHint = 'DMY' | 'MDY' | null;

/**
 * Parse a wide variety of date strings into ISO yyyy-MM-dd.
 * Returns null for unparseable / empty input.
 *
 * @param raw - The raw date string to parse
 * @param slashHint - Optional hint for ambiguous slash dates: 'DMY' or 'MDY'.
 *   When null (default), ambiguous slash dates like 05/03/2025 default to DMY (European).
 */
export function parseFlexibleDate(raw: string, slashHint?: SlashHint): string | null {
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

  // Slash-separated: dd/MM/yyyy or MM/dd/yyyy — use hint to disambiguate
  const slashMatch = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (slashMatch) {
    const [, a, b, year] = slashMatch;
    const hint = slashHint ?? 'DMY'; // Default to European
    if (hint === 'MDY') {
      return `${year}-${a}-${b}`; // a=month, b=day
    }
    return `${year}-${b}-${a}`; // a=day, b=month (DMY)
  }

  // Fallback: try Date.parse
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);

  return null;
}

/**
 * Detect the predominant date format in a set of raw date strings.
 *
 * For slash-separated dates (dd/MM or MM/dd), uses heuristic disambiguation:
 * - If any value has first part > 12 → definitely DMY (European)
 * - If any value has second part > 12 → definitely MDY (US)
 * - If all parts ≤ 12 (fully ambiguous) → defaults to EU-slash-DMY
 */
export function detectDateFormat(samples: string[]): DateFormatHint {
  const counts: Record<DateFormatHint, number> = {
    'ISO': 0, 'EU-dot-YMD': 0, 'EU-dot-DMY': 0,
    'EU-slash-DMY': 0, 'US-slash-MDY': 0, 'fallback': 0, 'unknown': 0,
  };

  // Collect slash-separated dates for disambiguation
  const slashDates: Array<{ a: number; b: number }> = [];

  for (const raw of samples.slice(0, 100)) {
    const s = raw?.trim();
    if (!s) continue;
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) { counts['ISO']++; continue; }
    if (/^\d{4}\.\d{2}\.\d{2}$/.test(s)) { counts['EU-dot-YMD']++; continue; }
    if (/^\d{2}\.\d{2}\.\d{4}$/.test(s)) { counts['EU-dot-DMY']++; continue; }
    const slashMatch = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (slashMatch) {
      slashDates.push({ a: parseInt(slashMatch[1], 10), b: parseInt(slashMatch[2], 10) });
      continue;
    }
    const d = new Date(s);
    if (!isNaN(d.getTime())) { counts['fallback']++; continue; }
    counts['unknown']++;
  }

  // Disambiguate slash dates
  if (slashDates.length > 0) {
    const hasFirstOver12 = slashDates.some(d => d.a > 12); // first part is day → DMY
    const hasSecondOver12 = slashDates.some(d => d.b > 12); // second part is day → MDY

    if (hasFirstOver12 && !hasSecondOver12) {
      counts['EU-slash-DMY'] = slashDates.length;
    } else if (hasSecondOver12 && !hasFirstOver12) {
      counts['US-slash-MDY'] = slashDates.length;
    } else {
      // Fully ambiguous (all ≤ 12) or contradictory — default to European
      counts['EU-slash-DMY'] = slashDates.length;
    }
  }

  let best: DateFormatHint = 'unknown';
  let bestCount = 0;
  for (const [fmt, cnt] of Object.entries(counts)) {
    if (cnt > bestCount) { bestCount = cnt; best = fmt as DateFormatHint; }
  }
  return best;
}

/**
 * Derive a SlashHint from a detected DateFormatHint.
 * Used to lock slash-date interpretation for consistent parsing within an import.
 */
export function getSlashHintFromFormat(fmt: DateFormatHint): SlashHint {
  if (fmt === 'US-slash-MDY') return 'MDY';
  if (fmt === 'EU-slash-DMY') return 'DMY';
  return null; // Non-slash formats don't need a hint
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
