import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertTriangle, CheckCircle2, Copy, Plus } from "lucide-react";
import type { DuplicateAnalysis } from "@/lib/duplicateDetection";

export type ConflictResolution = "keep_old" | "use_new" | "keep_both";

interface DuplicateDetectionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  analysis: DuplicateAnalysis;
  fileName: string;
  onConfirm: (conflictResolutions: Map<string, ConflictResolution>) => void;
}

export function DuplicateDetectionModal({
  open,
  onOpenChange,
  analysis,
  fileName,
  onConfirm,
}: DuplicateDetectionModalProps) {
  const { genuineNew, exactDuplicates, conflicts } = analysis;

  const [resolutions, setResolutions] = useState<Map<string, ConflictResolution>>(() => {
    const m = new Map<string, ConflictResolution>();
    conflicts.forEach((c) => m.set(c.partialKey, "use_new"));
    return m;
  });

  const setResolution = (key: string, value: ConflictResolution) => {
    setResolutions((prev) => {
      const next = new Map(prev);
      next.set(key, value);
      return next;
    });
  };

  const setAllResolutions = (value: ConflictResolution) => {
    setResolutions(() => {
      const m = new Map<string, ConflictResolution>();
      conflicts.forEach((c) => m.set(c.partialKey, value));
      return m;
    });
  };

  const totalIncoming = genuineNew.length + exactDuplicates.length + conflicts.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Duplicate Detection — {fileName}
          </DialogTitle>
          <DialogDescription>
            {totalIncoming} incoming rows analyzed against existing data.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Summary badges */}
          <div className="flex flex-wrap gap-3">
            <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
              <Plus className="h-4 w-4 text-emerald-500" />
              <span className="text-sm font-medium">{genuineNew.length} new rows</span>
              <span className="text-xs text-muted-foreground">will be added</span>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
              <Copy className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">{exactDuplicates.length} exact duplicates</span>
              <span className="text-xs text-muted-foreground">will be skipped</span>
            </div>
            {conflicts.length > 0 && (
              <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 px-3 py-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                <span className="text-sm font-medium">{conflicts.length} conflicts</span>
                <span className="text-xs text-muted-foreground">need resolution</span>
              </div>
            )}
          </div>

          {/* Conflict resolution table */}
          {conflicts.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold">
                  Conflicts — same SKU + date + partner, different qty
                </h4>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs h-7"
                    onClick={() => setAllResolutions("keep_old")}
                  >
                    All: Keep old
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs h-7"
                    onClick={() => setAllResolutions("use_new")}
                  >
                    All: Use new
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs h-7"
                    onClick={() => setAllResolutions("keep_both")}
                  >
                    All: Keep both
                  </Button>
                </div>
              </div>

              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">SKU</TableHead>
                      <TableHead className="text-xs">Date</TableHead>
                      <TableHead className="text-xs">Partner</TableHead>
                      <TableHead className="text-xs text-right">Old Qty</TableHead>
                      <TableHead className="text-xs text-right">New Qty</TableHead>
                      <TableHead className="text-xs w-[140px]">Resolution</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {conflicts.map((c) => (
                      <TableRow key={c.partialKey}>
                        <TableCell className="text-xs font-mono">{c.existing.sku}</TableCell>
                        <TableCell className="text-xs">{c.existing.date}</TableCell>
                        <TableCell className="text-xs">{c.existing.partner_id}</TableCell>
                        <TableCell className="text-xs text-right font-medium">
                          {c.existing.sold_qty}
                        </TableCell>
                        <TableCell className="text-xs text-right font-medium text-primary">
                          {c.incoming.sold_qty}
                        </TableCell>
                        <TableCell>
                          <Select
                            value={resolutions.get(c.partialKey) || "use_new"}
                            onValueChange={(v) =>
                              setResolution(c.partialKey, v as ConflictResolution)
                            }
                          >
                            <SelectTrigger className="h-7 text-xs w-[130px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="keep_old">Keep old</SelectItem>
                              <SelectItem value="use_new">Use new</SelectItem>
                              <SelectItem value="keep_both">Keep both</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {/* No action needed message */}
          {genuineNew.length === 0 && conflicts.length === 0 && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4 justify-center">
              <CheckCircle2 className="h-4 w-4" />
              All incoming rows are exact duplicates — nothing to add.
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => onConfirm(resolutions)}
            disabled={genuineNew.length === 0 && conflicts.length === 0}
          >
            Merge {genuineNew.length + conflicts.length} rows
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
