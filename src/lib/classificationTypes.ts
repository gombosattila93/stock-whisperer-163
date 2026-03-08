export interface ClassificationThresholds {
  abcA: number; // cumulative revenue % cutoff for A (default 0.80)
  abcB: number; // cumulative revenue % cutoff for B (default 0.95), rest is C
  xyzX: number; // CV < this = X (default 0.50)
  xyzY: number; // CV <= this = Y (default 1.00), rest is Z
}

export const DEFAULT_THRESHOLDS: ClassificationThresholds = {
  abcA: 80,
  abcB: 95,
  xyzX: 0.5,
  xyzY: 1.0,
};
