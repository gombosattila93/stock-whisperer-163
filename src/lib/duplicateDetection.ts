import { RawRow } from './types';

/** Exact fingerprint: same sku + date + partner_id + sold_qty */
export function fingerprint(r: RawRow): string {
  return `${r.sku}|${r.date}|${r.partner_id}|${r.sold_qty}`;
}

/** Partial fingerprint for conflict detection: same sku + date + partner_id */
export function partialFingerprint(r: RawRow): string {
  return `${r.sku}|${r.date}|${r.partner_id}`;
}

export interface ConflictRow {
  incoming: RawRow;
  existing: RawRow;
  partialKey: string;
}

export interface DuplicateAnalysis {
  genuineNew: RawRow[];
  exactDuplicates: RawRow[];
  conflicts: ConflictRow[];
}

export function analyzeDuplicates(existing: RawRow[], incoming: RawRow[]): DuplicateAnalysis {
  const exactSet = new Set(existing.map(fingerprint));
  // Map partial key → existing row (take last occurrence per key for comparison)
  const partialMap = new Map<string, RawRow>();
  for (const r of existing) {
    partialMap.set(partialFingerprint(r), r);
  }

  const genuineNew: RawRow[] = [];
  const exactDuplicates: RawRow[] = [];
  const conflicts: ConflictRow[] = [];

  for (const row of incoming) {
    const fp = fingerprint(row);
    if (exactSet.has(fp)) {
      exactDuplicates.push(row);
      continue;
    }

    const pk = partialFingerprint(row);
    const existingRow = partialMap.get(pk);
    if (existingRow && existingRow.sold_qty !== row.sold_qty) {
      conflicts.push({ incoming: row, existing: existingRow, partialKey: pk });
    } else {
      genuineNew.push(row);
    }
  }

  return { genuineNew, exactDuplicates, conflicts };
}
