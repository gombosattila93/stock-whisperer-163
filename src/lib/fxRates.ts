// ─── FX Rate Configuration ─────────────────────────────────────────────────

export interface FxRateConfig {
  usdEur: number;
  eurHuf: number;
  usdHuf: number; // derived: usdEur × eurHuf
  lastUpdated: string; // ISO datetime
  source: 'ecb' | 'manual' | 'fallback';
  manualOverride: boolean;
  manualOverrideDate?: string;
}

export const FALLBACK_RATES: FxRateConfig = {
  usdEur: 0.924,
  eurHuf: 392.5,
  usdHuf: 0.924 * 392.5, // 362.59
  lastUpdated: '2026-01-01T00:00:00Z',
  source: 'fallback',
  manualOverride: false,
};

// ─── Conversion helpers ────────────────────────────────────────────────────

export function purchaseToEur(
  amount: number,
  currency: 'USD' | 'EUR',
  rates: FxRateConfig,
): number {
  if (!isFinite(amount) || amount < 0) return 0;
  if (currency === 'EUR') return amount;
  // USD → EUR
  const rate = isFinite(rates.usdEur) && rates.usdEur > 0 ? rates.usdEur : FALLBACK_RATES.usdEur;
  return amount * rate;
}

export function hufToEur(huf: number, rates: FxRateConfig): number {
  if (!isFinite(huf)) return 0;
  const rate = isFinite(rates.eurHuf) && rates.eurHuf > 0 ? rates.eurHuf : FALLBACK_RATES.eurHuf;
  return huf / rate;
}

export function eurToHuf(eur: number, rates: FxRateConfig): number {
  if (!isFinite(eur)) return 0;
  const rate = isFinite(rates.eurHuf) && rates.eurHuf > 0 ? rates.eurHuf : FALLBACK_RATES.eurHuf;
  return eur * rate;
}

// ─── Manual override ───────────────────────────────────────────────────────

export function createManualRates(usdEur: number, eurHuf: number): FxRateConfig {
  const safeUsdEur = isFinite(usdEur) && usdEur > 0 ? usdEur : FALLBACK_RATES.usdEur;
  const safeEurHuf = isFinite(eurHuf) && eurHuf > 0 ? eurHuf : FALLBACK_RATES.eurHuf;
  return {
    usdEur: safeUsdEur,
    eurHuf: safeEurHuf,
    usdHuf: safeUsdEur * safeEurHuf,
    lastUpdated: new Date().toISOString(),
    source: 'manual',
    manualOverride: true,
    manualOverrideDate: new Date().toISOString(),
  };
}

// ─── ECB API fetch ─────────────────────────────────────────────────────────

export async function fetchEcbRates(): Promise<FxRateConfig> {
  const url = 'https://data-api.ecb.europa.eu/service/data/EXR/D.USD+HUF.EUR.SP00.A?lastNObservations=1&format=csvdata';

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  let resp: Response;
  try {
    resp = await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
  if (!resp.ok) throw new Error(`ECB API returned ${resp.status}`);

  const text = await resp.text();
  // Parse CSV: look for lines with USD and HUF rates
  const lines = text.split('\n');
  let usdEur = 0;
  let eurHuf = 0;

  for (const line of lines) {
    const cols = line.split(',');
    // csvdata format: KEY,FREQ,CURRENCY,... OBS_VALUE is typically column index 7
    if (cols.length < 8) continue;
    const currency = cols[2]?.replace(/"/g, '');
    const obsValue = parseFloat(cols[7]);
    if (isNaN(obsValue)) continue;

    if (currency === 'USD') {
      // ECB publishes EUR/USD (how many USD per 1 EUR)
      // We need USD→EUR, so usdEur = 1 / eurUsd
      usdEur = 1 / obsValue;
    } else if (currency === 'HUF') {
      // ECB publishes EUR/HUF (how many HUF per 1 EUR)
      eurHuf = obsValue;
    }
  }

  if (usdEur <= 0 || eurHuf <= 0) {
    throw new Error('Failed to parse ECB rates');
  }

  return {
    usdEur,
    eurHuf,
    usdHuf: usdEur * eurHuf,
    lastUpdated: new Date().toISOString(),
    source: 'ecb',
    manualOverride: false,
  };
}

// ─── Rate deviation check ──────────────────────────────────────────────────

export function isRateDeviant(rates: FxRateConfig, threshold = 0.3): boolean {
  const usdDev = Math.abs(rates.usdEur - FALLBACK_RATES.usdEur) / FALLBACK_RATES.usdEur;
  const hufDev = Math.abs(rates.eurHuf - FALLBACK_RATES.eurHuf) / FALLBACK_RATES.eurHuf;
  return usdDev > threshold || hufDev > threshold;
}

// ─── Staleness check ───────────────────────────────────────────────────────

export function isRateStale(rates: FxRateConfig, maxAgeMs = 24 * 60 * 60 * 1000): boolean {
  const updated = new Date(rates.lastUpdated).getTime();
  if (isNaN(updated)) return true;
  return Date.now() - updated > maxAgeMs;
}
