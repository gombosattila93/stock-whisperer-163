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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { HelpCircle, RotateCcw } from "lucide-react";

export type { ClassificationThresholds } from '@/lib/classificationTypes';
export { DEFAULT_THRESHOLDS } from '@/lib/classificationTypes';
import type { ClassificationThresholds } from '@/lib/classificationTypes';

interface ClassificationSettingsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  thresholds: ClassificationThresholds;
  onApply: (t: ClassificationThresholds) => void;
}

const ABC_TIP = `ABC classification uses Pareto (80/20) analysis on cumulative revenue.

Best practices:
• A items (top ~80% revenue): Typically 15-20% of SKUs. Monitor closely — tight safety stock, frequent reviews.
• B items (next ~15%): Moderate control. Review weekly/bi-weekly.
• C items (remaining ~5%): Low value — can use simpler reorder rules.

Standard thresholds: A = 80%, B = 95%. Adjust only if your revenue distribution is unusually flat (lower cutoffs) or concentrated (raise cutoffs).`;

const XYZ_TIP = `XYZ classification uses Coefficient of Variation (CV = σ/μ) to measure demand predictability.

Best practices:
• X (CV < 0.5): Stable demand — safe to use lean inventory, just-in-time replenishment.
• Y (0.5 ≤ CV ≤ 1.0): Moderate variability — use safety stock formulas, consider seasonal patterns.
• Z (CV > 1.0): Erratic/lumpy demand — higher safety stock, consider make-to-order or consignment.

If most items are Z, your demand window may be too short. Try 90-180 days for smoother averages.`;

export function ClassificationSettings({ open, onOpenChange, thresholds, onApply }: ClassificationSettingsProps) {
  const [local, setLocal] = useState<ClassificationThresholds>(thresholds);
  const [errors, setErrors] = useState<string[]>([]);

  const validate = (): boolean => {
    const errs: string[] = [];
    if (local.abcA <= 0 || local.abcA >= 100) errs.push("ABC A cutoff must be between 1-99%");
    if (local.abcB <= local.abcA || local.abcB >= 100) errs.push("ABC B cutoff must be > A cutoff and < 100%");
    if (local.xyzX <= 0) errs.push("XYZ X threshold must be > 0");
    if (local.xyzY <= local.xyzX) errs.push("XYZ Y threshold must be > X threshold");
    setErrors(errs);
    return errs.length === 0;
  };

  const handleApply = () => {
    if (validate()) {
      onApply(local);
      onOpenChange(false);
    }
  };

  const handleReset = () => {
    setLocal(DEFAULT_THRESHOLDS);
    setErrors([]);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Classification Thresholds</DialogTitle>
          <DialogDescription>
            Customize ABC revenue cutoffs and XYZ variability boundaries.
          </DialogDescription>
        </DialogHeader>

        <TooltipProvider>
          <div className="space-y-5">
            {/* ABC Section */}
            <div>
              <div className="flex items-center gap-1.5 mb-3">
                <h3 className="text-sm font-semibold">ABC Classification (Revenue)</h3>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-[320px] text-xs whitespace-pre-line">
                    {ABC_TIP}
                  </TooltipContent>
                </Tooltip>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">A cutoff (cumulative %)</Label>
                  <div className="flex items-center gap-1 mt-1">
                    <Input
                      type="number"
                      value={local.abcA}
                      onChange={(e) => setLocal((p) => ({ ...p, abcA: Number(e.target.value) }))}
                      className="h-8 text-xs"
                      min={1}
                      max={99}
                    />
                    <span className="text-xs text-muted-foreground">%</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">SKUs covering top {local.abcA}% revenue → A</p>
                </div>
                <div>
                  <Label className="text-xs">B cutoff (cumulative %)</Label>
                  <div className="flex items-center gap-1 mt-1">
                    <Input
                      type="number"
                      value={local.abcB}
                      onChange={(e) => setLocal((p) => ({ ...p, abcB: Number(e.target.value) }))}
                      className="h-8 text-xs"
                      min={1}
                      max={99}
                    />
                    <span className="text-xs text-muted-foreground">%</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Up to {local.abcB}% → B, rest → C</p>
                </div>
              </div>
            </div>

            {/* XYZ Section */}
            <div>
              <div className="flex items-center gap-1.5 mb-3">
                <h3 className="text-sm font-semibold">XYZ Classification (Demand Variability)</h3>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-[320px] text-xs whitespace-pre-line">
                    {XYZ_TIP}
                  </TooltipContent>
                </Tooltip>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">X threshold (CV &lt;)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={local.xyzX}
                    onChange={(e) => setLocal((p) => ({ ...p, xyzX: Number(e.target.value) }))}
                    className="h-8 text-xs mt-1"
                    min={0.01}
                  />
                  <p className="text-[10px] text-muted-foreground mt-0.5">CV &lt; {local.xyzX} → Stable (X)</p>
                </div>
                <div>
                  <Label className="text-xs">Y threshold (CV ≤)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={local.xyzY}
                    onChange={(e) => setLocal((p) => ({ ...p, xyzY: Number(e.target.value) }))}
                    className="h-8 text-xs mt-1"
                    min={0.01}
                  />
                  <p className="text-[10px] text-muted-foreground mt-0.5">CV ≤ {local.xyzY} → Variable (Y), else Erratic (Z)</p>
                </div>
              </div>
            </div>

            {errors.length > 0 && (
              <div className="bg-destructive/10 text-destructive text-xs rounded-md p-2 space-y-0.5">
                {errors.map((e, i) => (
                  <p key={i}>• {e}</p>
                ))}
              </div>
            )}
          </div>
        </TooltipProvider>

        <DialogFooter className="mt-2 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={handleReset} className="text-xs gap-1">
            <RotateCcw className="h-3 w-3" /> Reset defaults
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleApply}>Apply</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
