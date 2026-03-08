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
import { HelpCircle, Settings2 } from "lucide-react";
import { EoqSettings, DEFAULT_EOQ_SETTINGS } from "@/lib/reorderStrategies";

interface EoqSettingsPanelProps {
  settings: EoqSettings;
  onChange: (settings: EoqSettings) => void;
}

export function EoqSettingsPanel({ settings, onChange }: EoqSettingsPanelProps) {
  const [open, setOpen] = useState(false);
  const [local, setLocal] = useState<EoqSettings>(settings);

  const handleOpen = () => {
    setLocal(settings);
    setOpen(true);
  };

  const handleSave = () => {
    onChange(local);
    setOpen(false);
  };

  const handleReset = () => {
    setLocal(DEFAULT_EOQ_SETTINGS);
  };

  return (
    <>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="sm" onClick={handleOpen} className="h-8 text-xs gap-1.5">
              <Settings2 className="h-3.5 w-3.5" />
              EOQ
            </Button>
          </TooltipTrigger>
          <TooltipContent>Configure EOQ cost parameters</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>EOQ Parameters</DialogTitle>
            <DialogDescription>
              Configure the cost assumptions used in Economic Order Quantity calculations.
            </DialogDescription>
          </DialogHeader>

          <TooltipProvider>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="orderingCost" className="text-sm">Ordering Cost ($)</Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-[240px] text-xs">
                      Fixed cost per purchase order — includes admin, shipping setup, receiving labor. 
                      Typical range: $20–$200. Higher ordering cost → larger EOQ batches.
                    </TooltipContent>
                  </Tooltip>
                </div>
                <Input
                  id="orderingCost"
                  type="number"
                  min={1}
                  max={10000}
                  step={5}
                  value={local.orderingCost}
                  onChange={(e) => setLocal(prev => ({ ...prev, orderingCost: Math.max(1, Number(e.target.value) || 1) }))}
                  className="h-8"
                />
                <p className="text-[10px] text-muted-foreground">Default: ${DEFAULT_EOQ_SETTINGS.orderingCost}</p>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="holdingPct" className="text-sm">Holding Cost (% of unit price/year)</Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-[240px] text-xs">
                      Annual cost to hold one unit as a percentage of its price — includes warehousing, 
                      insurance, obsolescence, capital cost. Typical range: 15%–35%. 
                      Higher holding cost → smaller EOQ batches.
                    </TooltipContent>
                  </Tooltip>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    id="holdingPct"
                    type="number"
                    min={1}
                    max={100}
                    step={1}
                    value={Math.round(local.holdingPct * 100)}
                    onChange={(e) => setLocal(prev => ({ ...prev, holdingPct: Math.max(0.01, Math.min(1, (Number(e.target.value) || 20) / 100)) }))}
                    className="h-8"
                  />
                  <span className="text-sm text-muted-foreground shrink-0">%</span>
                </div>
                <p className="text-[10px] text-muted-foreground">Default: {DEFAULT_EOQ_SETTINGS.holdingPct * 100}%</p>
              </div>
            </div>
          </TooltipProvider>

          <DialogFooter className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={handleReset} className="mr-auto text-xs">
              Reset Defaults
            </Button>
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handleSave}>Apply</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
