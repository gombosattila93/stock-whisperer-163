import { useInventory } from "@/context/InventoryContext";
import { EmptyState } from "@/components/EmptyState";
import { getUrgency } from "@/lib/calculations";
import { computeReorder, STRATEGY_OPTIONS, ReorderStrategy, EoqSettings, DEFAULT_EOQ_SETTINGS } from "@/lib/reorderStrategies";
import { loadSkuOverrides, loadEoqSettings } from "@/lib/persistence";
import { SortableHeader, useSortableTable } from "@/components/SortableHeader";
import { TablePagination, usePagination } from "@/components/TablePagination";
import { HighlightText } from "@/components/HighlightText";
import { exportToCsv } from "@/lib/csvUtils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Slider } from "@/components/ui/slider";
import { Download, Zap, AlertTriangle, CheckCircle, Clock, Info, SlidersHorizontal } from "lucide-react";
import { HelpTooltip } from "@/components/HelpTooltip";
import { useMemo, useState, useCallback, useEffect } from "react";
import type { SkuStrategyOverrides } from "@/lib/skuStrategyOverrides";

interface ReorderItem {
  sku: string;
  sku_name: string;
  supplier: string;
  category: string;
  abc_class: string;
  urgency: string;
  trend: string;
  days_of_stock: number | null;
  lead_time_days: number;
  suggested_order_qty: number;
  unit_price: number;
  order_value: number;
  priority_score: number;
  approved: boolean;
}

function priorityScore(urgency: string, abc: string, trend: string): number {
  const urgencyW: Record<string, number> = { Critical: 3, Warning: 2, Watch: 1 };
  const abcW: Record<string, number> = { A: 3, B: 2, C: 1 };
  const trendW: Record<string, number> = { rising: 1.5, stable: 1, falling: 0.7 };
  return (urgencyW[urgency] || 1) * (abcW[abc] || 1) * (trendW[trend] || 1);
}

export default function ReorderPlan() {
  const { filtered, hasData, costSettings, skuSupplierOptions } = useInventory();
  const [skuOverrides, setSkuOverrides] = useState<SkuStrategyOverrides>({});
  const [eoqSettings, setEoqSettings] = useState<EoqSettings>(DEFAULT_EOQ_SETTINGS);
  const [optimized, setOptimized] = useState(false);
  const [approvedSkus, setApprovedSkus] = useState<Set<string>>(new Set());
  const [whatIfOpen, setWhatIfOpen] = useState(false);

  useEffect(() => {
    loadSkuOverrides().then(setSkuOverrides);
    loadEoqSettings().then(setEoqSettings);
  }, []);

  const budgetEnabled = costSettings.budgetEnabled;
  const budget = costSettings.monthlyBudget;
  const supplierBudgets = costSettings.supplierBudgets;

  const [whatIfBudget, setWhatIfBudget] = useState<number>(budget);
  useEffect(() => { setWhatIfBudget(budget); }, [budget]);

  // Build reorder items with priority scores
  const reorderItems = useMemo<ReorderItem[]>(() => {
    return filtered
      .filter(s => s.reorder_point !== null && s.effective_stock <= s.reorder_point && s.avg_daily_demand > 0)
      .map(s => {
        const effectiveStrategy = skuOverrides[s.sku] || 'rop';
        const result = computeReorder(s, effectiveStrategy as ReorderStrategy, eoqSettings);
        const supplierOpts = skuSupplierOptions[s.sku] || [];
        const primaryOpt = supplierOpts.find(o => o.is_primary) || supplierOpts[0];
        const moq = primaryOpt?.moq || 1;
        const effectiveMoq = Math.max(1, moq);
        const raw = result.suggested_order_qty;
        const qty = raw > 0 ? Math.max(effectiveMoq, Math.ceil(raw / effectiveMoq) * effectiveMoq) : 0;
        const urgency = getUrgency(s.days_of_stock, s.lead_time_days);
        const score = priorityScore(urgency, s.abc_class, s.trend);
        return {
          sku: s.sku,
          sku_name: s.sku_name,
          supplier: s.supplier,
          category: s.category,
          abc_class: s.abc_class,
          urgency,
          trend: s.trend,
          days_of_stock: s.days_of_stock,
          lead_time_days: s.lead_time_days,
          suggested_order_qty: qty,
          unit_price: s.unit_price,
          order_value: qty * s.unit_price,
          priority_score: score,
          approved: false,
        };
      })
      .sort((a, b) => b.priority_score - a.priority_score);
  }, [filtered, skuOverrides, eoqSettings, skuSupplierOptions]);

  const totalOrderValue = useMemo(() => reorderItems.reduce((s, i) => s + i.order_value, 0), [reorderItems]);
  const overBudget = budgetEnabled && totalOrderValue > budget;

  // What-if simulation — runs greedy algorithm at whatIfBudget
  const whatIfResult = useMemo(() => {
    if (!whatIfOpen) return null;
    let remaining = whatIfBudget;
    const supplierSpent: Record<string, number> = {};
    let approvedCount = 0;
    let approvedValue = 0;
    for (const item of reorderItems) {
      const supplierCap = supplierBudgets[item.supplier];
      const supplierCurrent = supplierSpent[item.supplier] || 0;
      if (item.order_value <= remaining) {
        if (supplierCap && (supplierCurrent + item.order_value) > supplierCap) continue;
        approvedCount++;
        approvedValue += item.order_value;
        remaining -= item.order_value;
        supplierSpent[item.supplier] = supplierCurrent + item.order_value;
      }
    }
    const deferredCount = reorderItems.length - approvedCount;
    const deferredValue = totalOrderValue - approvedValue;
    return { approvedCount, approvedValue, deferredCount, deferredValue };
  }, [whatIfOpen, whatIfBudget, reorderItems, totalOrderValue, supplierBudgets]);

  // Budget optimization — greedy by priority
  const optimizeWithinBudget = useCallback(() => {
    const approved = new Set<string>();
    let remaining = budget;
    const supplierSpent: Record<string, number> = {};

    for (const item of reorderItems) {
      const supplierCap = supplierBudgets[item.supplier];
      const supplierCurrent = supplierSpent[item.supplier] || 0;

      if (item.order_value <= remaining) {
        if (supplierCap && (supplierCurrent + item.order_value) > supplierCap) continue;
        approved.add(item.sku);
        remaining -= item.order_value;
        supplierSpent[item.supplier] = supplierCurrent + item.order_value;
      }
    }

    setApprovedSkus(approved);
    setOptimized(true);
  }, [reorderItems, budget, supplierBudgets]);

  const resetOptimization = useCallback(() => {
    setApprovedSkus(new Set());
    setOptimized(false);
  }, []);

  const approvedItems = useMemo(() => reorderItems.filter(i => approvedSkus.has(i.sku)), [reorderItems, approvedSkus]);
  const deferredItems = useMemo(() => reorderItems.filter(i => !approvedSkus.has(i.sku)), [reorderItems, approvedSkus]);
  const approvedValue = useMemo(() => approvedItems.reduce((s, i) => s + i.order_value, 0), [approvedItems]);
  const deferredValue = useMemo(() => deferredItems.reduce((s, i) => s + i.order_value, 0), [deferredItems]);

  // Per-supplier spend tracking
  const supplierSpend = useMemo(() => {
    const items = optimized ? approvedItems : reorderItems;
    const map: Record<string, number> = {};
    for (const i of items) {
      map[i.supplier] = (map[i.supplier] || 0) + i.order_value;
    }
    return map;
  }, [reorderItems, approvedItems, optimized]);

  // For table display, use sorted lists
  const displayItems = optimized ? approvedItems : reorderItems;
  const { sorted, sort, toggleSort } = useSortableTable(displayItems, { column: 'priority_score', direction: 'desc' });
  const { paginatedData, currentPage, pageSize, setCurrentPage, setPageSize, totalItems } = usePagination(sorted);

  const exportApprovedPlan = useCallback(() => {
    const items = optimized ? approvedItems : reorderItems;
    exportToCsv(
      items.map(i => ({
        sku: i.sku,
        name: i.sku_name,
        supplier: i.supplier,
        category: i.category,
        abc_class: i.abc_class,
        urgency: i.urgency,
        priority_score: i.priority_score.toFixed(1),
        suggested_qty: i.suggested_order_qty,
        unit_price: i.unit_price.toFixed(2),
        order_value: i.order_value.toFixed(2),
        status: optimized ? 'approved' : 'pending',
      })),
      optimized ? 'approved-reorder-plan.csv' : 'reorder-plan.csv'
    );
  }, [reorderItems, approvedItems, optimized]);

  if (!hasData) return <EmptyState />;

  const urgencyClass: Record<string, string> = {
    Critical: 'bg-destructive/15 text-destructive border-destructive/30',
    Warning: 'bg-warning/15 text-warning-foreground border-warning/30',
    Watch: 'bg-muted text-muted-foreground',
  };

  return (
    <div>
      <div className="page-header flex items-center justify-between">
        <div>
          <h1 className="page-title">Reorder Plan</h1>
          <p className="page-subtitle">
            Budget-constrained reorder prioritization
            {budgetEnabled && (
              <span className="ml-2 font-medium">
                — Budget: €{budget.toLocaleString()}
                {costSettings.budgetPeriodDays !== 30 && ` / ${costSettings.budgetPeriodDays}d`}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportApprovedPlan} className="gap-1.5">
            <Download className="h-4 w-4" />
            Export {optimized ? 'approved' : ''} plan
          </Button>
        </div>
      </div>

      {!budgetEnabled && (
        <div className="flex items-start gap-2.5 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 mb-6">
          <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            Enable <strong className="text-foreground">Budget Constraints</strong> in{' '}
            <strong className="text-foreground">Cost Model</strong> to activate budget-limited optimization. Currently showing all reorder items ranked by priority.
          </p>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-card border rounded-lg p-4">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Total Order Value</p>
          <p className={`text-2xl font-bold mt-1 ${overBudget ? 'text-destructive' : ''}`}>
            €{totalOrderValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </p>
          {overBudget && (
            <p className="text-xs text-destructive mt-0.5">
              €{(totalOrderValue - budget).toLocaleString(undefined, { maximumFractionDigits: 0 })} over budget
            </p>
          )}
        </div>
        <div className="bg-card border rounded-lg p-4">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">SKUs to Reorder</p>
          <p className="text-2xl font-bold mt-1">{reorderItems.length}</p>
        </div>
        {optimized && (
          <>
            <div className="bg-card border rounded-lg p-4 border-primary/30">
              <p className="text-xs text-primary font-medium uppercase tracking-wide flex items-center gap-1">
                <CheckCircle className="h-3.5 w-3.5" /> Approved
              </p>
              <p className="text-2xl font-bold mt-1 text-primary">
                {approvedItems.length} SKUs — €{approvedValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </p>
            </div>
            <div className="bg-card border rounded-lg p-4 border-muted-foreground/20">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" /> Deferred
              </p>
              <p className="text-2xl font-bold mt-1 text-muted-foreground">
                {deferredItems.length} SKUs — €{deferredValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </p>
            </div>
          </>
        )}
      </div>

      {/* Budget optimization button */}
      {budgetEnabled && (<>
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          {!optimized ? (
            <Button onClick={optimizeWithinBudget} className="gap-1.5">
              <Zap className="h-4 w-4" />
              Optimize within budget
            </Button>
          ) : (
            <Button variant="outline" onClick={resetOptimization} className="gap-1.5">
              Reset optimization
            </Button>
          )}
          <Button
            variant={whatIfOpen ? "secondary" : "outline"}
            size="sm"
            onClick={() => setWhatIfOpen(v => !v)}
            className="gap-1.5"
          >
            <SlidersHorizontal className="h-4 w-4" />
            What-if
          </Button>
          {overBudget && !optimized && (
            <div className="flex items-center gap-1.5 text-destructive text-sm">
              <AlertTriangle className="h-4 w-4" />
              Total exceeds budget — click optimize to prioritize
            </div>
          )}
        </div>

        {/* What-if budget slider */}
        {whatIfOpen && (
          <div className="bg-card border rounded-lg p-5 mb-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <SlidersHorizontal className="h-4 w-4 text-primary" />
                What-if Budget Simulator
              </h3>
              <span className="text-lg font-bold text-primary">
                €{whatIfBudget.toLocaleString()}
              </span>
            </div>
            <Slider
              value={[whatIfBudget]}
              onValueChange={([v]) => setWhatIfBudget(v)}
              min={0}
              max={Math.max(totalOrderValue * 1.5, budget * 2, 1000) || 1000}
              step={100}
              className="w-full"
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>€0</span>
              <span className="font-medium text-foreground">
                Current budget: €{budget.toLocaleString()}
              </span>
              <span>€{Math.max(totalOrderValue * 1.5, budget * 2, 1000).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
            </div>
            {whatIfResult && (
              <div className="grid grid-cols-2 gap-4 pt-2 border-t">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                    <CheckCircle className="h-3 w-3 text-primary" /> Approved
                  </p>
                  <p className="text-xl font-bold text-primary">
                    {whatIfResult.approvedCount} SKUs
                  </p>
                  <p className="text-sm text-muted-foreground">
                    €{whatIfResult.approvedValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                    <Clock className="h-3 w-3" /> Deferred
                  </p>
                  <p className="text-xl font-bold text-muted-foreground">
                    {whatIfResult.deferredCount} SKUs
                  </p>
                  <p className="text-sm text-muted-foreground">
                    €{whatIfResult.deferredValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </p>
                </div>
              </div>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => setWhatIfBudget(budget)}
              className="text-xs"
            >
              Reset to current budget
            </Button>
          </div>
        )}
      </>)}

      {/* Per-supplier budget tracking */}
      {budgetEnabled && Object.keys(supplierSpend).length > 0 && (
        <div className="bg-card border rounded-lg p-5 mb-6">
          <h3 className="text-sm font-semibold mb-3">Supplier Budget Allocation</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {Object.entries(supplierSpend)
              .sort((a, b) => b[1] - a[1])
              .map(([supplier, spent]) => {
                const cap = supplierBudgets[supplier] || budget || 1;
                const pct = Math.min(100, cap > 0 ? (spent / cap) * 100 : 0);
                const concentrationRisk = budget > 0 && spent > budget * 0.4;
                return (
                  <div key={supplier} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium truncate">{supplier}</span>
                      <span className="text-xs text-muted-foreground">
                        €{spent.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        {supplierBudgets[supplier] && (
                          <span> / €{supplierBudgets[supplier].toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                        )}
                      </span>
                    </div>
                    <Progress value={pct} className="h-2" />
                    {concentrationRisk && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge variant="destructive" className="text-[9px] cursor-help">
                              Concentration risk
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="text-xs">This supplier represents &gt;40% of total budget — consider diversifying</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Reorder table */}
      {sorted.length === 0 ? (
        <div className="bg-card border rounded-lg p-12 text-center text-muted-foreground">
          No items need reordering with current filters.
        </div>
      ) : (
        <div className="bg-card border rounded-lg overflow-hidden">
          <div className="overflow-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <SortableHeader column="priority_score" label="Priority" sort={sort} onSort={toggleSort} align="right" />
                  <SortableHeader column="sku" label="SKU" sort={sort} onSort={toggleSort} />
                  <SortableHeader column="sku_name" label="Name" sort={sort} onSort={toggleSort} />
                  <SortableHeader column="supplier" label="Supplier" sort={sort} onSort={toggleSort} />
                  <SortableHeader column="abc_class" label="ABC" sort={sort} onSort={toggleSort} />
                  <SortableHeader column="urgency" label="Urgency" sort={sort} onSort={toggleSort} />
                  <SortableHeader column="days_of_stock" label="Days Stock" sort={sort} onSort={toggleSort} align="right" />
                  <SortableHeader column="suggested_order_qty" label="Qty" sort={sort} onSort={toggleSort} align="right" />
                  <SortableHeader column="order_value" label="Order Value" sort={sort} onSort={toggleSort} align="right" />
                </tr>
              </thead>
              <tbody>
                {paginatedData.map(item => (
                  <tr key={item.sku}>
                    <td className="text-right font-mono text-sm font-medium">{item.priority_score.toFixed(1)}</td>
                    <td className="font-mono font-medium"><HighlightText text={item.sku} /></td>
                    <td><HighlightText text={item.sku_name} /></td>
                    <td><HighlightText text={item.supplier} /></td>
                    <td>
                      <Badge variant="outline" className="text-[10px]">{item.abc_class}</Badge>
                    </td>
                    <td>
                      <span className={`inline-block px-2.5 py-1 rounded-md text-xs border ${urgencyClass[item.urgency] || ''}`}>
                        {item.urgency}
                      </span>
                    </td>
                    <td className="text-right">{item.days_of_stock === null ? '—' : item.days_of_stock === Infinity ? '∞' : Math.round(item.days_of_stock)}</td>
                    <td className="text-right font-semibold">{item.suggested_order_qty.toLocaleString()}</td>
                    <td className="text-right">€{item.order_value.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <TablePagination totalItems={totalItems} pageSize={pageSize} currentPage={currentPage} onPageChange={setCurrentPage} onPageSizeChange={setPageSize} />
        </div>
      )}

      {/* Deferred items */}
      {optimized && deferredItems.length > 0 && (
        <div className="mt-6">
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Clock className="h-5 w-5 text-muted-foreground" />
            Deferred Items ({deferredItems.length})
          </h3>
          <p className="text-xs text-muted-foreground mb-3">
            These SKUs were deprioritized due to budget constraints. Review in {costSettings.budgetPeriodDays} days.
          </p>
          <div className="bg-card border rounded-lg overflow-hidden">
            <div className="overflow-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="px-4 py-3 font-semibold text-muted-foreground uppercase text-xs tracking-wider bg-muted/50 text-right">Priority</th>
                    <th className="px-4 py-3 font-semibold text-muted-foreground uppercase text-xs tracking-wider bg-muted/50">SKU</th>
                    <th className="px-4 py-3 font-semibold text-muted-foreground uppercase text-xs tracking-wider bg-muted/50">Name</th>
                    <th className="px-4 py-3 font-semibold text-muted-foreground uppercase text-xs tracking-wider bg-muted/50">Supplier</th>
                    <th className="px-4 py-3 font-semibold text-muted-foreground uppercase text-xs tracking-wider bg-muted/50">Urgency</th>
                    <th className="px-4 py-3 font-semibold text-muted-foreground uppercase text-xs tracking-wider bg-muted/50 text-right">Order Value</th>
                    <th className="px-4 py-3 font-semibold text-muted-foreground uppercase text-xs tracking-wider bg-muted/50">Next Review</th>
                  </tr>
                </thead>
                <tbody>
                  {deferredItems.slice(0, 50).map(item => {
                    const reviewDate = new Date();
                    reviewDate.setDate(reviewDate.getDate() + costSettings.budgetPeriodDays);
                    return (
                      <tr key={item.sku} className="opacity-70">
                        <td className="text-right font-mono text-sm">{item.priority_score.toFixed(1)}</td>
                        <td className="font-mono">{item.sku}</td>
                        <td>{item.sku_name}</td>
                        <td>{item.supplier}</td>
                        <td>
                          <span className={`inline-block px-2.5 py-1 rounded-md text-xs border ${urgencyClass[item.urgency] || ''}`}>
                            {item.urgency}
                          </span>
                        </td>
                        <td className="text-right">€{item.order_value.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        <td className="text-xs text-muted-foreground">{reviewDate.toLocaleDateString()}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
