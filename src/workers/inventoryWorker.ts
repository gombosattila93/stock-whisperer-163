import { parseRows, analyzeSkus } from '@/lib/calculations';
import type { RawRow, SkuAnalysis } from '@/lib/types';
import type { ClassificationThresholds } from '@/lib/classificationTypes';
import type { CostSettings } from '@/lib/costSettings';

export interface WorkerRequest {
  type: 'ANALYZE';
  payload: {
    rows: RawRow[];
    demandDays: number;
    serviceFactor: number;
    thresholds: ClassificationThresholds;
    costSettings: CostSettings;
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

export type WorkerResponse = WorkerProgressMessage | WorkerResultMessage;

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  if (e.data.type !== 'ANALYZE') return;

  const { rows, demandDays, serviceFactor, thresholds, costSettings } = e.data.payload;

  // Stage 1: parseRows
  self.postMessage({ type: 'PROGRESS', payload: { pct: 10, stage: 'Parsing rows…' } } satisfies WorkerProgressMessage);
  const skuMap = parseRows(rows);

  // Stage 2: analyzeSkus
  self.postMessage({ type: 'PROGRESS', payload: { pct: 50, stage: 'Analyzing SKUs…' } } satisfies WorkerProgressMessage);
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - demandDays);
  const analyses = analyzeSkus(skuMap, startDate, endDate, demandDays, serviceFactor, thresholds, costSettings);

  // Done
  self.postMessage({ type: 'PROGRESS', payload: { pct: 100, stage: 'Complete' } } satisfies WorkerProgressMessage);
  self.postMessage({ type: 'RESULT', payload: analyses } satisfies WorkerResultMessage);
};
