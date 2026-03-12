import { useInventory } from "@/context/InventoryContext";
import { useLanguage } from "@/lib/i18n";
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
import { HelpCircle, DollarSign, Warehouse, Truck, Tag, AlertTriangle, RotateCcw, Clock, ShieldAlert, Info, TrendingUp, Timer, Target, Hourglass, Wallet } from "lucide-react";
import { CostSettings, DEFAULT_COST_SETTINGS, DEFAULT_SHELF_LIFE, ServiceLevelKey } from "@/lib/costSettings";
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
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === '') { onChange(min); return; }
            const num = Number(raw);
            if (!Number.isFinite(num)) return;
            onChange(Math.max(min, num));
          }}
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
              placeholder={suffix === '€' ? '0' : 'default'}
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

function CategoryRateEditor({ rates, categories, onChange, disabled, label }: {
  rates: Record<string, number>;
  categories: string[];
  onChange: (rates: Record<string, number>) => void;
  disabled: boolean;
  label: string;
}) {
  if (categories.length === 0) return null;
  return (
    <div className={`space-y-1.5 ${disabled ? 'opacity-40' : ''}`}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
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
  const { t } = useLanguage();

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
    costSettings.shelfLifeEnabled,
    costSettings.budgetEnabled,
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
          <h1 className="page-title">{t('cost.title')}</h1>
          <p className="page-subtitle">{t('cost.subtitle')}</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="secondary" className="text-xs">
            {enabledCount}/12 {t('cost.modulesActive')}
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCostSettings(DEFAULT_COST_SETTINGS)}
            className="gap-1.5"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {t('cost.resetAll')}
          </Button>
        </div>
      </div>

      {/* Impact notice */}
      <div className="flex items-start gap-2.5 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 mb-6">
        <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
        <p className="text-xs text-muted-foreground leading-relaxed">
          {t('cost.impactNotice')}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Holding Cost */}
        <div className="bg-card border rounded-lg p-5 space-y-4">
          <SectionHeader icon={DollarSign} title={t('cost.holdingCost')} enabled={costSettings.holdingCostEnabled} onToggle={(v) => update('holdingCostEnabled', v)} tip="Annual cost of capital tied up in inventory." />
          <NumericField label={t('cost.annualInterestRate')} value={costSettings.annualInterestRate} onChange={(v) => update('annualInterestRate', v)} disabled={!costSettings.holdingCostEnabled} suffix="%" />
        </div>

        {/* Storage Cost */}
        <div className="bg-card border rounded-lg p-5 space-y-4">
          <SectionHeader icon={Warehouse} title={t('cost.storageCost')} enabled={costSettings.storageCostEnabled} onToggle={(v) => update('storageCostEnabled', v)} tip="Physical warehouse cost per pallet position per month." />
          <NumericField label={t('cost.costPerPallet')} value={costSettings.storageCostPerPalletPerMonth} onChange={(v) => update('storageCostPerPalletPerMonth', v)} disabled={!costSettings.storageCostEnabled} suffix="€" />
          <NumericField label={t('cost.unitsPerPallet')} value={costSettings.unitsPerPallet} onChange={(v) => update('unitsPerPallet', v)} disabled={!costSettings.storageCostEnabled} suffix={t('common.units')} min={1} />
        </div>

        {/* Ordering Cost */}
        <div className="bg-card border rounded-lg p-5 space-y-4">
          <SectionHeader icon={Truck} title={t('cost.orderingCost')} enabled={costSettings.orderingCostEnabled} onToggle={(v) => update('orderingCostEnabled', v)} tip="Fixed cost per purchase order (admin, shipping, receiving)." />
          <NumericField label={t('cost.defaultOrderingCost')} value={costSettings.defaultOrderingCost} onChange={(v) => update('defaultOrderingCost', v)} disabled={!costSettings.orderingCostEnabled} suffix="€" />
          <SupplierCostEditor costs={costSettings.supplierOrderingCosts} suppliers={suppliers} onChange={(v) => update('supplierOrderingCosts', v)} disabled={!costSettings.orderingCostEnabled} label={t('cost.perSupplierOverrides')} suffix="€" />
        </div>

        {/* Price Breaks */}
        <div className="bg-card border rounded-lg p-5 space-y-4">
          <SectionHeader icon={Tag} title={t('cost.priceBreaks')} enabled={costSettings.priceBreaksEnabled} onToggle={(v) => update('priceBreaksEnabled', v)} tip="When suggested order qty is within 15% of a price break threshold, system suggests rounding up." />
          <p className={`text-xs ${costSettings.priceBreaksEnabled ? 'text-muted-foreground' : 'text-muted-foreground/40'}`}>
            {t('cost.priceBreaks')}
          </p>
        </div>

        {/* Stockout Cost */}
        <div className="bg-card border rounded-lg p-5 space-y-4">
          <SectionHeader icon={AlertTriangle} title={t('cost.stockoutCost')} enabled={costSettings.stockoutCostEnabled} onToggle={(v) => update('stockoutCostEnabled', v)} tip="Estimated lost margin during stockout periods." />
          <NumericField label={t('cost.defaultMargin')} value={costSettings.defaultMarginPct} onChange={(v) => update('defaultMarginPct', v)} disabled={!costSettings.stockoutCostEnabled} suffix="%" />
        </div>

        {/* Obsolescence */}
        <div className="bg-card border rounded-lg p-5 space-y-4">
          <SectionHeader icon={ShieldAlert} title={t('cost.obsolescence')} enabled={costSettings.obsolescenceCostEnabled} onToggle={(v) => update('obsolescenceCostEnabled', v)} tip="Annual write-down risk based on category." />
          <CategoryRateEditor rates={costSettings.categoryObsolescenceRates} categories={categories} onChange={(v) => update('categoryObsolescenceRates', v)} disabled={!costSettings.obsolescenceCostEnabled} label={t('cost.obsolescenceRatePerCategory')} />
        </div>

        {/* Minimum Order Value */}
        <div className="bg-card border rounded-lg p-5 space-y-4">
          <SectionHeader icon={Tag} title={t('cost.minOrderValue')} enabled={costSettings.minOrderValueEnabled} onToggle={(v) => update('minOrderValueEnabled', v)} tip="Flag reorder items that don't meet supplier minimum order values." />
          <SupplierCostEditor costs={costSettings.supplierMinOrderValues} suppliers={suppliers} onChange={(v) => update('supplierMinOrderValues', v)} disabled={!costSettings.minOrderValueEnabled} label={t('cost.minOrderValuePerSupplier')} suffix="€" />
        </div>

        {/* Payment Terms */}
        <div className="bg-card border rounded-lg p-5 space-y-4">
          <SectionHeader icon={Clock} title={t('cost.paymentTerms')} enabled={costSettings.paymentTermsEnabled} onToggle={(v) => update('paymentTermsEnabled', v)} tip="Track supplier payment terms (net days)." />
          <SupplierCostEditor costs={costSettings.supplierPaymentTermsDays} suppliers={suppliers} onChange={(v) => update('supplierPaymentTermsDays', v)} disabled={!costSettings.paymentTermsEnabled} label={t('cost.paymentTermsPerSupplier')} suffix={t('common.days')} />
        </div>

        {/* EWMA Demand */}
        <div className="bg-card border rounded-lg p-5 space-y-4">
          <SectionHeader icon={TrendingUp} title={t('cost.ewma')} enabled={costSettings.ewmaEnabled} onToggle={(v) => update('ewmaEnabled', v)} tip="Exponential Weighted Moving Average gives more weight to recent demand." />
          <div className={`space-y-3 ${!costSettings.ewmaEnabled ? 'opacity-40 pointer-events-none' : ''}`}>
            <div className="flex items-center justify-between">
              <Label className="text-xs">{t('cost.smoothingFactor')}</Label>
              <span className="text-xs font-mono font-medium">{costSettings.ewmaAlpha.toFixed(2)}</span>
            </div>
            <Slider
              min={0.1} max={0.5} step={0.05}
              value={[costSettings.ewmaAlpha]}
              onValueChange={([v]) => update('ewmaAlpha', v)}
              disabled={!costSettings.ewmaEnabled}
            />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>0.1 — {t('cost.slowStable')}</span>
              <span>0.5 — {t('cost.fastVolatile')}</span>
            </div>
          </div>
        </div>

        {/* Lead Time Variability */}
        <div className="bg-card border rounded-lg p-5 space-y-4">
          <div className="flex items-center gap-2.5">
            <Timer className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">{t('cost.leadTimeVar')}</h3>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-[300px]">
                  <p className="text-xs">Safety stock uses: Z × √(LT × σ_d² + d² × σ_LT²)</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          {suppliers.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t('cost.loadDataToConfig')}</p>
          ) : (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">{t('cost.observedLeadTimeStats')}</Label>
              <div className="grid grid-cols-1 gap-2">
                {suppliers.map(s => {
                  const stats = costSettings.supplierLeadTimeStats[s] ?? { avgLeadTimeActual: 0, stdDevLeadTime: 0 };
                  return (
                    <div key={s} className="flex items-center gap-2">
                      <span className="text-xs w-28 truncate" title={s}>{s}</span>
                      <Input type="number" min={0} value={stats.avgLeadTimeActual || ''} placeholder="Avg LT"
                        onChange={(e) => {
                          const val = Number(e.target.value) || 0;
                          const next = { ...costSettings.supplierLeadTimeStats };
                          next[s] = { ...stats, avgLeadTimeActual: val };
                          if (!val && !stats.stdDevLeadTime) delete next[s];
                          update('supplierLeadTimeStats', next);
                        }}
                        className="h-7 w-20 text-xs"
                      />
                      <span className="text-[10px] text-muted-foreground">{t('common.days')}</span>
                      <Input type="number" min={0} step={0.5} value={stats.stdDevLeadTime || ''} placeholder="σ LT"
                        onChange={(e) => {
                          const val = Number(e.target.value) || 0;
                          const next = { ...costSettings.supplierLeadTimeStats };
                          next[s] = { ...stats, stdDevLeadTime: val };
                          if (!val && !stats.avgLeadTimeActual) delete next[s];
                          update('supplierLeadTimeStats', next);
                        }}
                        className="h-7 w-20 text-xs"
                      />
                      <span className="text-[10px] text-muted-foreground">σ {t('common.days')}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Per-ABC Service Level */}
        <div className="bg-card border rounded-lg p-5 space-y-4">
          <SectionHeader icon={Target} title={t('cost.perAbcServiceLevels')} enabled={sls.usePerClassServiceLevel} onToggle={(v) => updateSL('usePerClassServiceLevel', v)} tip="Set different service level targets per ABC class." />
          <div className={`space-y-3 ${!sls.usePerClassServiceLevel ? 'opacity-40 pointer-events-none' : ''}`}>
            {(['A', 'B', 'C'] as const).map(cls => {
              const key = `class${cls}` as 'classA' | 'classB' | 'classC';
              const defaults: Record<string, string> = { A: '99%', B: '95%', C: '90%' };
              return (
                <div key={cls} className="flex items-center gap-3">
                  <Label className="text-xs w-20 font-medium">Class {cls}</Label>
                  <Select value={sls[key]} onValueChange={(v) => updateSL(key, v as ServiceLevelKey)} disabled={!sls.usePerClassServiceLevel}>
                    <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="90%">90% (Z=1.28)</SelectItem>
                      <SelectItem value="95%">95% (Z=1.65)</SelectItem>
                      <SelectItem value="99%">99% (Z=2.33)</SelectItem>
                    </SelectContent>
                  </Select>
                  <span className="text-[10px] text-muted-foreground">{t('common.default')}: {defaults[cls]}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Shelf Life / Expiry */}
        <div className="bg-card border rounded-lg p-5 space-y-4">
          <SectionHeader icon={Hourglass} title={t('cost.shelfLife')} enabled={costSettings.shelfLifeEnabled} onToggle={(v) => update('shelfLifeEnabled', v)} tip="Track shelf life per category. Items exceeding shelf life are flagged." />
          <div className={`space-y-3 ${!costSettings.shelfLifeEnabled ? 'opacity-40 pointer-events-none' : ''}`}>
            {Object.keys(costSettings.categoryShelfLifeDays).length === 0 && costSettings.shelfLifeEnabled && (
              <Button variant="outline" size="sm" onClick={() => update('categoryShelfLifeDays', { ...DEFAULT_SHELF_LIFE })} className="text-xs">
                {t('cost.loadDefaultShelfLife')}
              </Button>
            )}
            <div className="grid grid-cols-1 gap-2">
              {Object.entries(costSettings.categoryShelfLifeDays).map(([cat, days]) => (
                <div key={cat} className="flex items-center gap-2">
                  <span className="text-xs w-40 truncate" title={cat}>{cat}</span>
                  <Input type="number" min={1} value={days}
                    onChange={(e) => {
                      const next = { ...costSettings.categoryShelfLifeDays };
                      next[cat] = Number(e.target.value) || 9999;
                      update('categoryShelfLifeDays', next);
                    }}
                    disabled={!costSettings.shelfLifeEnabled}
                    className="h-7 w-24 text-xs"
                  />
                  <span className="text-[10px] text-muted-foreground">{t('common.days')}</span>
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => {
                      const next = { ...costSettings.categoryShelfLifeDays };
                      delete next[cat];
                      update('categoryShelfLifeDays', next);
                    }}
                    disabled={!costSettings.shelfLifeEnabled}
                  >×</Button>
                </div>
              ))}
            </div>
            {costSettings.shelfLifeEnabled && (
              <div className="flex items-center gap-2">
                <Input id="new-shelf-cat" placeholder={t('cost.categoryName')} className="h-7 w-40 text-xs"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const val = (e.target as HTMLInputElement).value.trim();
                      if (val && !(val in costSettings.categoryShelfLifeDays)) {
                        update('categoryShelfLifeDays', { ...costSettings.categoryShelfLifeDays, [val]: 9999 });
                        (e.target as HTMLInputElement).value = '';
                      }
                    }
                  }}
                />
                <span className="text-[10px] text-muted-foreground">{t('cost.pressEnterToAdd')}</span>
              </div>
            )}
          </div>
        </div>

        {/* Budget Constraints */}
        <div className="bg-card border rounded-lg p-5 space-y-4">
          <SectionHeader icon={Wallet} title={t('cost.budgetConstraints')} enabled={costSettings.budgetEnabled} onToggle={(v) => update('budgetEnabled', v)} tip="Set monthly reorder budgets (total and per-supplier)." />
          <div className={`space-y-3 ${!costSettings.budgetEnabled ? 'opacity-40 pointer-events-none' : ''}`}>
            <NumericField label={t('cost.monthlyBudget')} value={costSettings.monthlyBudget} onChange={(v) => update('monthlyBudget', v)} disabled={!costSettings.budgetEnabled} suffix="€" />
            <NumericField label={t('cost.budgetPeriod')} value={costSettings.budgetPeriodDays} onChange={(v) => update('budgetPeriodDays', v)} disabled={!costSettings.budgetEnabled} suffix={t('common.days')} min={1} />
            <SupplierCostEditor costs={costSettings.supplierBudgets} suppliers={suppliers} onChange={(v) => update('supplierBudgets', v)} disabled={!costSettings.budgetEnabled} label={t('cost.perSupplierBudgetCaps')} suffix="€" />
          </div>
        </div>
      </div>
    </div>
  );
}

