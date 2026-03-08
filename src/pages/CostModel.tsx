import { useInventory } from "@/context/InventoryContext";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { HelpCircle, DollarSign, Warehouse, Truck, Tag, AlertTriangle, RotateCcw, Clock, ShieldAlert, Info, TrendingUp, Timer, Target } from "lucide-react";
import { CostSettings, DEFAULT_COST_SETTINGS, ServiceLevelKey } from "@/lib/costSettings";
import { useCallback } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function SectionHeader({ icon: Icon, title, enabled, onToggle, tip }: {
  icon: React.ElementType;
  title: string;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  tip: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <Icon className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">{title}</h3>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
            </TooltipTrigger>
            <TooltipContent className="max-w-[280px]"><p className="text-xs">{tip}</p></TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <Switch checked={enabled} onCheckedChange={onToggle} />
    </div>
  );
}

function NumericField({ label, value, onChange, disabled, suffix, min = 0 }: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  disabled: boolean;
  suffix?: string;
  min?: number;
}) {
  return (
    <div className="flex items-center gap-2">
      <Label className={`text-xs w-48 shrink-0 ${disabled ? 'text-muted-foreground/50' : ''}`}>{label}</Label>
      <div className="flex items-center gap-1">
        <Input
          type="number"
          min={min}
          value={value}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
          disabled={disabled}
          className="h-8 w-24 text-xs"
        />
        {suffix && <span className={`text-xs ${disabled ? 'text-muted-foreground/40' : 'text-muted-foreground'}`}>{suffix}</span>}
      </div>
    </div>
  );
}

function SupplierCostEditor({ costs, suppliers, onChange, disabled, label, suffix }: {
  costs: Record<string, number>;
  suppliers: string[];
  onChange: (costs: Record<string, number>) => void;
  disabled: boolean;
  label: string;
  suffix: string;
}) {
  if (suppliers.length === 0) return null;
  return (
    <div className={`space-y-1.5 ${disabled ? 'opacity-40' : ''}`}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        {suppliers.map(s => (
          <div key={s} className="flex items-center gap-2">
            <span className="text-xs w-28 truncate" title={s}>{s}</span>
            <Input
              type="number"
              min={0}
              value={costs[s] ?? ''}
              placeholder="default"
              onChange={(e) => {
                const val = e.target.value;
                const next = { ...costs };
                if (val === '' || val === '0') {
                  delete next[s];
                } else {
                  next[s] = Number(val) || 0;
                }
                onChange(next);
              }}
              disabled={disabled}
              className="h-7 w-20 text-xs"
            />
            <span className="text-xs text-muted-foreground">{suffix}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CategoryRateEditor({ rates, categories, onChange, disabled }: {
  rates: Record<string, number>;
  categories: string[];
  onChange: (rates: Record<string, number>) => void;
  disabled: boolean;
}) {
  if (categories.length === 0) return null;
  return (
    <div className={`space-y-1.5 ${disabled ? 'opacity-40' : ''}`}>
      <Label className="text-xs text-muted-foreground">Annual obsolescence rate per category</Label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        {categories.map(c => (
          <div key={c} className="flex items-center gap-2">
            <span className="text-xs w-28 truncate" title={c}>{c}</span>
            <Input
              type="number"
              min={0}
              max={100}
              value={rates[c] ?? ''}
              placeholder="0"
              onChange={(e) => {
                const val = e.target.value;
                const next = { ...rates };
                if (val === '' || val === '0') {
                  delete next[c];
                } else {
                  next[c] = Number(val) || 0;
                }
                onChange(next);
              }}
              disabled={disabled}
              className="h-7 w-20 text-xs"
            />
            <span className="text-xs text-muted-foreground">%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CostModel() {
  const { costSettings, setCostSettings, suppliers, categories } = useInventory();

  const update = useCallback(<K extends keyof CostSettings>(key: K, value: CostSettings[K]) => {
    setCostSettings({ ...costSettings, [key]: value });
  }, [costSettings, setCostSettings]);

  const enabledCount = [
    costSettings.holdingCostEnabled,
    costSettings.storageCostEnabled,
    costSettings.orderingCostEnabled,
    costSettings.priceBreaksEnabled,
    costSettings.stockoutCostEnabled,
    costSettings.obsolescenceCostEnabled,
    costSettings.minOrderValueEnabled,
    costSettings.paymentTermsEnabled,
    costSettings.ewmaEnabled,
    costSettings.serviceLevelSettings.usePerClassServiceLevel,
  ].filter(Boolean).length;

  const hasLeadTimeStats = Object.keys(costSettings.supplierLeadTimeStats).length > 0;
  const sls = costSettings.serviceLevelSettings;

  const updateSL = useCallback((key: keyof typeof sls, value: unknown) => {
    update('serviceLevelSettings', { ...sls, [key]: value });
  }, [sls, update]);

  return (
    <div>
      <div className="page-header flex items-center justify-between">
        <div>
          <h1 className="page-title">Cost Model</h1>
          <p className="page-subtitle">Configure cost parameters that affect EOQ, order suggestions, and TCO</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="secondary" className="text-xs">
            {enabledCount}/10 modules active
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCostSettings(DEFAULT_COST_SETTINGS)}
            className="gap-1.5"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset all
          </Button>
        </div>
      </div>

      {/* Impact notice */}
      <div className="flex items-start gap-2.5 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 mb-6">
        <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
        <p className="text-xs text-muted-foreground leading-relaxed">
          These settings affect <strong className="text-foreground">EOQ calculations</strong>,{' '}
          <strong className="text-foreground">suggested order quantities</strong>,{' '}
          <strong className="text-foreground">overstock capital analysis</strong>, and{' '}
          <strong className="text-foreground">TCO (Total Cost of Ownership)</strong> across all dashboard pages.
          Toggle modules on/off — disabled modules have zero impact on calculations.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Holding Cost */}
        <div className="bg-card border rounded-lg p-5 space-y-4">
          <SectionHeader
            icon={DollarSign}
            title="Holding Cost"
            enabled={costSettings.holdingCostEnabled}
            onToggle={(v) => update('holdingCostEnabled', v)}
            tip="Annual cost of capital tied up in inventory. Typically 6-12% of inventory value based on interest rates and opportunity cost."
          />
          <NumericField
            label="Annual interest rate"
            value={costSettings.annualInterestRate}
            onChange={(v) => update('annualInterestRate', v)}
            disabled={!costSettings.holdingCostEnabled}
            suffix="%"
          />
        </div>

        {/* Storage Cost */}
        <div className="bg-card border rounded-lg p-5 space-y-4">
          <SectionHeader
            icon={Warehouse}
            title="Storage Cost"
            enabled={costSettings.storageCostEnabled}
            onToggle={(v) => update('storageCostEnabled', v)}
            tip="Physical warehouse cost per pallet position per month. Covers rent, utilities, handling."
          />
          <NumericField
            label="Cost per pallet/month"
            value={costSettings.storageCostPerPalletPerMonth}
            onChange={(v) => update('storageCostPerPalletPerMonth', v)}
            disabled={!costSettings.storageCostEnabled}
            suffix="€"
          />
          <NumericField
            label="Units per pallet"
            value={costSettings.unitsPerPallet}
            onChange={(v) => update('unitsPerPallet', v)}
            disabled={!costSettings.storageCostEnabled}
            suffix="units"
            min={1}
          />
        </div>

        {/* Ordering Cost */}
        <div className="bg-card border rounded-lg p-5 space-y-4">
          <SectionHeader
            icon={Truck}
            title="Ordering Cost"
            enabled={costSettings.orderingCostEnabled}
            onToggle={(v) => update('orderingCostEnabled', v)}
            tip="Fixed cost per purchase order (admin, shipping, receiving). Used in EOQ formula. Can be set per supplier."
          />
          <NumericField
            label="Default ordering cost"
            value={costSettings.defaultOrderingCost}
            onChange={(v) => update('defaultOrderingCost', v)}
            disabled={!costSettings.orderingCostEnabled}
            suffix="€"
          />
          <SupplierCostEditor
            costs={costSettings.supplierOrderingCosts}
            suppliers={suppliers}
            onChange={(v) => update('supplierOrderingCosts', v)}
            disabled={!costSettings.orderingCostEnabled}
            label="Per-supplier overrides"
            suffix="€"
          />
        </div>

        {/* Price Breaks */}
        <div className="bg-card border rounded-lg p-5 space-y-4">
          <SectionHeader
            icon={Tag}
            title="Quantity Price Breaks"
            enabled={costSettings.priceBreaksEnabled}
            onToggle={(v) => update('priceBreaksEnabled', v)}
            tip="When suggested order qty is within 15% of a price break threshold, system suggests rounding up for savings."
          />
          <p className={`text-xs ${costSettings.priceBreaksEnabled ? 'text-muted-foreground' : 'text-muted-foreground/40'}`}>
            Price breaks are configured per-SKU. When enabled, the system checks if rounding up the order quantity to the next price break threshold saves money.
          </p>
        </div>

        {/* Stockout Cost */}
        <div className="bg-card border rounded-lg p-5 space-y-4">
          <SectionHeader
            icon={AlertTriangle}
            title="Stockout Cost"
            enabled={costSettings.stockoutCostEnabled}
            onToggle={(v) => update('stockoutCostEnabled', v)}
            tip="Estimated lost margin during stockout periods. Calculated as lost sales × margin percentage."
          />
          <NumericField
            label="Default margin"
            value={costSettings.defaultMarginPct}
            onChange={(v) => update('defaultMarginPct', v)}
            disabled={!costSettings.stockoutCostEnabled}
            suffix="%"
          />
        </div>

        {/* Obsolescence */}
        <div className="bg-card border rounded-lg p-5 space-y-4">
          <SectionHeader
            icon={ShieldAlert}
            title="Obsolescence Risk"
            enabled={costSettings.obsolescenceCostEnabled}
            onToggle={(v) => update('obsolescenceCostEnabled', v)}
            tip="Annual write-down risk based on category. Electronics typically 5-15%, fashion 10-25%, FMCG 2-5%."
          />
          <CategoryRateEditor
            rates={costSettings.categoryObsolescenceRates}
            categories={categories}
            onChange={(v) => update('categoryObsolescenceRates', v)}
            disabled={!costSettings.obsolescenceCostEnabled}
          />
        </div>

        {/* Minimum Order Value */}
        <div className="bg-card border rounded-lg p-5 space-y-4">
          <SectionHeader
            icon={Tag}
            title="Minimum Order Value"
            enabled={costSettings.minOrderValueEnabled}
            onToggle={(v) => update('minOrderValueEnabled', v)}
            tip="Flag reorder items that don't meet supplier minimum order values. Helps plan consolidated orders."
          />
          <SupplierCostEditor
            costs={costSettings.supplierMinOrderValues}
            suppliers={suppliers}
            onChange={(v) => update('supplierMinOrderValues', v)}
            disabled={!costSettings.minOrderValueEnabled}
            label="Minimum order value per supplier"
            suffix="€"
          />
        </div>

        {/* Payment Terms */}
        <div className="bg-card border rounded-lg p-5 space-y-4">
          <SectionHeader
            icon={Clock}
            title="Payment Terms"
            enabled={costSettings.paymentTermsEnabled}
            onToggle={(v) => update('paymentTermsEnabled', v)}
            tip="Track supplier payment terms (net days). Affects working capital calculations."
          />
          <SupplierCostEditor
            costs={costSettings.supplierPaymentTermsDays}
            suppliers={suppliers}
            onChange={(v) => update('supplierPaymentTermsDays', v)}
            disabled={!costSettings.paymentTermsEnabled}
            label="Payment terms per supplier"
            suffix="days"
          />
        </div>

        {/* EWMA Demand */}
        <div className="bg-card border rounded-lg p-5 space-y-4">
          <SectionHeader
            icon={TrendingUp}
            title="EWMA Demand Smoothing"
            enabled={costSettings.ewmaEnabled}
            onToggle={(v) => update('ewmaEnabled', v)}
            tip="Exponential Weighted Moving Average gives more weight to recent demand, better capturing trends. Recommended for variable-demand items."
          />
          <div className={`space-y-3 ${!costSettings.ewmaEnabled ? 'opacity-40 pointer-events-none' : ''}`}>
            <div className="flex items-center justify-between">
              <Label className="text-xs">Smoothing factor (α)</Label>
              <span className="text-xs font-mono font-medium">{costSettings.ewmaAlpha.toFixed(2)}</span>
            </div>
            <Slider
              min={0.1}
              max={0.5}
              step={0.05}
              value={[costSettings.ewmaAlpha]}
              onValueChange={([v]) => update('ewmaAlpha', v)}
              disabled={!costSettings.ewmaEnabled}
            />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>0.1 — slow (stable items)</span>
              <span>0.5 — fast (volatile items)</span>
            </div>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <p className="text-xs text-muted-foreground flex items-center gap-1 cursor-help">
                    <HelpCircle className="h-3 w-3" />
                    Higher α = more weight on recent demand. Use 0.2–0.3 for stable items, 0.4–0.5 for fast-changing.
                  </p>
                </TooltipTrigger>
                <TooltipContent className="max-w-[300px]">
                  <p className="text-xs">EWMA formula: S_t = α × x_t + (1-α) × S_(t-1). This replaces the simple average in reorder point and safety stock calculations when enabled.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>

        {/* Lead Time Variability */}
        <div className="bg-card border rounded-lg p-5 space-y-4">
          <div className="flex items-center gap-2.5">
            <Timer className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Lead Time Variability</h3>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-[300px]">
                  <p className="text-xs">When provided, safety stock uses the full formula: Z × √(LT × σ_d² + d² × σ_LT²), accounting for both demand AND lead time variability.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          {suppliers.length === 0 ? (
            <p className="text-xs text-muted-foreground">Load data to configure per-supplier lead time statistics.</p>
          ) : (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Observed lead time stats per supplier</Label>
              <div className="grid grid-cols-1 gap-2">
                {suppliers.map(s => {
                  const stats = costSettings.supplierLeadTimeStats[s] ?? { avgLeadTimeActual: 0, stdDevLeadTime: 0 };
                  return (
                    <div key={s} className="flex items-center gap-2">
                      <span className="text-xs w-28 truncate" title={s}>{s}</span>
                      <Input
                        type="number"
                        min={0}
                        value={stats.avgLeadTimeActual || ''}
                        placeholder="Avg LT"
                        onChange={(e) => {
                          const val = Number(e.target.value) || 0;
                          const next = { ...costSettings.supplierLeadTimeStats };
                          next[s] = { ...stats, avgLeadTimeActual: val };
                          if (!val && !stats.stdDevLeadTime) delete next[s];
                          update('supplierLeadTimeStats', next);
                        }}
                        className="h-7 w-20 text-xs"
                      />
                      <span className="text-[10px] text-muted-foreground">days</span>
                      <Input
                        type="number"
                        min={0}
                        step={0.5}
                        value={stats.stdDevLeadTime || ''}
                        placeholder="σ LT"
                        onChange={(e) => {
                          const val = Number(e.target.value) || 0;
                          const next = { ...costSettings.supplierLeadTimeStats };
                          next[s] = { ...stats, stdDevLeadTime: val };
                          if (!val && !stats.avgLeadTimeActual) delete next[s];
                          update('supplierLeadTimeStats', next);
                        }}
                        className="h-7 w-20 text-xs"
                      />
                      <span className="text-[10px] text-muted-foreground">σ days</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
