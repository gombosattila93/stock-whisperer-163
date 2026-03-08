import { ImportSummary } from "@/lib/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle, Info, XCircle } from "lucide-react";

interface ImportSummaryModalProps {
  open: boolean;
  summary: ImportSummary | null;
  onProceed: () => void;
  onCancel: () => void;
}

export function ImportSummaryModal({ open, summary, onProceed, onCancel }: ImportSummaryModalProps) {
  if (!summary) return null;

  const hasErrors = summary.dataWarnings.some(w => w.startsWith('[ERROR]'));
  const errors = summary.dataWarnings.filter(w => w.startsWith('[ERROR]')).map(w => w.replace('[ERROR] ', ''));
  const warnings = summary.dataWarnings.filter(w => !w.startsWith('[ERROR]'));
  const skipReasons = summary.skippedReasons.filter(r => r.count > 0);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-primary" />
            Import Summary
          </DialogTitle>
          <DialogDescription>Review the import results before proceeding</DialogDescription>
        </DialogHeader>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="bg-muted/50 rounded-lg p-3">
            <p className="text-xs text-muted-foreground font-medium">Total Rows</p>
            <p className="text-lg font-bold">{summary.totalRows.toLocaleString()}</p>
          </div>
          <div className="bg-muted/50 rounded-lg p-3">
            <p className="text-xs text-muted-foreground font-medium">Valid Rows</p>
            <p className="text-lg font-bold text-primary">{summary.validRows.toLocaleString()}</p>
          </div>
          <div className="bg-muted/50 rounded-lg p-3">
            <p className="text-xs text-muted-foreground font-medium">Unique SKUs</p>
            <p className="text-lg font-bold">{summary.uniqueSkus.toLocaleString()}</p>
          </div>
          <div className="bg-muted/50 rounded-lg p-3">
            <p className="text-xs text-muted-foreground font-medium">Skipped Rows</p>
            <p className={`text-lg font-bold ${summary.skippedRows > 0 ? 'text-warning-foreground' : ''}`}>
              {summary.skippedRows.toLocaleString()}
            </p>
          </div>
        </div>

        {/* Metadata */}
        <div className="space-y-1.5 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Date Range</span>
            <span className="font-medium">{summary.dateRange.from} → {summary.dateRange.to}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Date Format</span>
            <span className="font-medium">{summary.detectedDateFormat}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Encoding</span>
            <Badge variant={summary.detectedEncoding !== 'UTF-8' ? 'secondary' : 'outline'} className="text-[10px]">
              {summary.detectedEncoding}
            </Badge>
          </div>
        </div>

        {/* Skip reasons */}
        {skipReasons.length > 0 && (
          <div className="bg-warning/10 border border-warning/30 rounded-lg p-3 space-y-1.5">
            <p className="text-xs font-semibold text-warning-foreground flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" /> Skipped Rows Breakdown
            </p>
            {skipReasons.map((r, i) => (
              <div key={i} className="flex justify-between text-xs">
                <span className="text-muted-foreground">{r.reason}</span>
                <Badge variant="secondary" className="text-[10px]">{r.count}</Badge>
              </div>
            ))}
          </div>
        )}

        {/* Warnings */}
        {warnings.length > 0 && (
          <div className="bg-warning/10 border border-warning/30 rounded-lg p-3 space-y-1.5">
            <p className="text-xs font-semibold text-warning-foreground flex items-center gap-1.5">
              <Info className="h-3.5 w-3.5" /> Warnings
            </p>
            {warnings.map((w, i) => (
              <p key={i} className="text-xs text-muted-foreground">• {w}</p>
            ))}
          </div>
        )}

        {/* Errors */}
        {errors.length > 0 && (
          <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 space-y-1.5">
            <p className="text-xs font-semibold text-destructive flex items-center gap-1.5">
              <XCircle className="h-3.5 w-3.5" /> Errors — Recommended to fix before proceeding
            </p>
            {errors.map((e, i) => (
              <p key={i} className="text-xs text-destructive/80">• {e}</p>
            ))}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onCancel}>Cancel Import</Button>
          <Button onClick={onProceed}>
            {hasErrors ? 'Proceed Anyway' : 'Proceed'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
