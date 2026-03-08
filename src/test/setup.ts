import "@testing-library/jest-dom";
import { parseRows, analyzeSkus } from '@/lib/calculations';

// Mock Web Worker for tests
class MockWorker {
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;

  postMessage(data: any) {
    if (data.type === 'ANALYZE') {
      const { rows, demandDays, serviceFactor, thresholds } = data.payload;
      setTimeout(() => {
        try {
          const skuMap = parseRows(rows);
          const endDate = new Date();
          const startDate = new Date();
          startDate.setDate(startDate.getDate() - demandDays);
          const analyses = analyzeSkus(skuMap, startDate, endDate, demandDays, serviceFactor, thresholds);
          this.onmessage?.({ data: { type: 'RESULT', payload: analyses } } as MessageEvent);
        } catch (err) {
          this.onerror?.({ message: String(err) } as ErrorEvent);
        }
      }, 0);
    }
  }

  terminate() {}
  addEventListener() {}
  removeEventListener() {}
  dispatchEvent() { return false; }
}

(globalThis as any).Worker = MockWorker;

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

// Mock pointer capture for Radix UI components
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
}
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => {};
}
if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = () => {};
}
