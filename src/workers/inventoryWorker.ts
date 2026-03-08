import { parseRows, analyzeSkus } from '@/lib/calculations';
import type { RawRow, SkuAnalysis } from '@/lib/types';
import type { ClassificationThresholds } from '@/lib/classificationTypes';
import type { CostSettings } from '@/lib/costSettings';
import type { FxRateConfig } from '@/lib/fxRates';
import { FALLBACK_RATES } from '@/lib/fxRates';

export interface WorkerRequest {
  type: 'ANALYZE';
  payload: {
    rows: RawRow[];
    demandDays: number;
    serviceFactor: number;
    thresholds: ClassificationThresholds;
    costSettings: CostSettings;
    fxRates?: FxRateConfig;
  };
}

export interface WorkerProgressMessage {
  type: 'PROGRESS';
  payload: { pct: number; stage: string };
}

export interface WorkerResultMessage {
  type: 'RESULT';
  payload: SkuAnalysis[];
}

export interface WorkerErrorMessage {
  type: 'ERROR';
  payload: { message: string };
}

export type WorkerResponse = WorkerProgressMessage | WorkerResultMessage | WorkerErrorMessage;

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  if (e.data.type !== 'ANALYZE') return;

  try {
    const { rows, demandDays, serviceFactor, thresholds, costSettings, fxRates } = e.data.payload;

    // Stage 1: parseRows
    self.postMessage({ type: 'PROGRESS', payload: { pct: 10, stage: 'Parsing rows…' } } satisfies WorkerProgressMessage);
    const skuMap = parseRows(rows);

    // Stage 2: analyzeSkus
    self.postMessage({ type: 'PROGRESS', payload: { pct: 50, stage: 'Analyzing SKUs…' } } satisfies WorkerProgressMessage);
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - demandDays);
    const analyses = analyzeSkus(skuMap, startDate, endDate, demandDays, serviceFactor, thresholds, costSettings, fxRates || FALLBACK_RATES);

    // Done
    self.postMessage({ type: 'PROGRESS', payload: { pct: 100, stage: 'Complete' } } satisfies WorkerProgressMessage);
    self.postMessage({ type: 'RESULT', payload: analyses } satisfies WorkerResultMessage);
  } catch (err) {
    self.postMessage({ type: 'ERROR', payload: { message: err instanceof Error ? err.message : 'Unknown calculation error' } });
  }
};
