import { useInventory } from "@/context/InventoryContext";
import { EmptyState } from "@/components/EmptyState";
import { ExportButton } from "@/components/ExportButton";
import { getUrgency } from "@/lib/calculations";
import { computeReorder, STRATEGY_OPTIONS, ReorderStrategy } from "@/lib/reorderStrategies";
import { loadSkuOverrides, saveSkuOverrides, SkuStrategyOverrides } from "@/lib/skuStrategyOverrides";
import { SortableHeader, useSortableTable } from "@/components/SortableHeader";
import { TablePagination, usePagination } from "@/components/TablePagination";
import { HighlightText } from "@/components/HighlightText";
import { DemandSparkline } from "@/components/DemandSparkline";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { RotateCcw, CheckSquare } from "lucide-react";
import { useMemo, useState, useCallback } from "react";

export default function ReorderList() {
  const { filtered, hasData } = useInventory();
  const [globalStrategy, setGlobalStrategy] = useState<ReorderStrategy>('rop');
  const [skuOverrides, setSkuOverrides] = useState<SkuStrategyOverrides>(loadSkuOverrides);
  const [selectedSkus, setSelectedSkus] = useState<Set<string>>(new Set());

  const overrideCount = Object.keys(skuOverrides).length;

  const setSkuStrategy = useCallback((sku: string, strategy: ReorderStrategy | '__global__') => {
    setSkuOverrides(prev => {
      const next = { ...prev };
      if (strategy === '__global__') {
        delete next[sku];
      } else {
        next[sku] = strategy;
      }
      saveSkuOverrides(next);
      return next;
    });
  }, []);

  const clearAllOverrides = useCallback(() => {
    setSkuOverrides({});
    saveSkuOverrides({});
  }, []);

  const toggleSelect = useCallback((sku: string) => {
    setSelectedSkus(prev => {
      const next = new Set(prev);
      if (next.has(sku)) next.delete(sku);
      else next.add(sku);
      return next;
    });
  }, []);

  const reorder = useMemo(() =>
    filtered
      .filter(s => s.effective_stock <= s.reorder_point && s.avg_daily_demand > 0)
      .map(s => {
        const effectiveStrategy = skuOverrides[s.sku] || globalStrategy;
        const result = computeReorder(s, effectiveStrategy);
        return {
          ...s,
          suggested_order_qty: result.suggested_order_qty,
          urgency: getUrgency(s.days_of_stock, s.lead_time_days),
          strategyLabel: result.strategyLabel,
          reorder_trigger: result.reorder_trigger,
          effectiveStrategy,
          hasOverride: !!skuOverrides[s.sku],
        };
      }),
    [filtered, globalStrategy, skuOverrides]
  );

  const { sorted, sort, toggleSort } = useSortableTable(reorder);
  const { paginatedData, currentPage, pageSize, setCurrentPage, setPageSize, totalItems } = usePagination(sorted);

  const allPageSelected = paginatedData.length > 0 && paginatedData.every(s => selectedSkus.has(s.sku));
  const someSelected = selectedSkus.size > 0;

  const toggleSelectAll = useCallback(() => {
    setSelectedSkus(prev => {
      const next = new Set(prev);
      if (allPageSelected) {
        paginatedData.forEach(s => next.delete(s.sku));
      } else {
        paginatedData.forEach(s => next.add(s.sku));
      }
      return next;
    });
  }, [allPageSelected, paginatedData]);

  const applyBulkStrategy = useCallback((strategy: ReorderStrategy | '__global__') => {
    setSkuOverrides(prev => {
      const next = { ...prev };
      selectedSkus.forEach(sku => {
        if (strategy === '__global__') {
          delete next[sku];
        } else {
          next[sku] = strategy;
        }
      });
      saveSkuOverrides(next);
      return next;
    });
    setSelectedSkus(new Set());
  }, [selectedSkus]);

  if (!hasData) return <EmptyState />;

  const exportData = sorted.map(s => ({
    sku: s.sku, name: s.sku_name, supplier: s.supplier,
    suggested_order_qty: s.suggested_order_qty, urgency: s.urgency,
    strategy: s.strategyLabel, trigger: s.reorder_trigger,
    has_override: s.hasOverride ? 'Yes' : 'No',
  }));

  const urgencyClass: Record<string, string> = {
    Critical: 'urgency-critical',
    Warning: 'urgency-warning',
    Watch: 'urgency-watch',
  };

  return (
    <div>
      <div className="page-header flex items-center justify-between">
        <div>
          <h1 className="page-title">Reorder List</h1>
          <p className="page-subtitle">Items where effective stock ≤ reorder point</p>
        </div>
        <ExportButton data={exportData} filename="reorder-list.csv" />
      </div>

      <div className="filter-bar mb-4">
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground whitespace-nowrap">Default Strategy</Label>
          <Select value={globalStrategy} onValueChange={(v) => setGlobalStrategy(v as ReorderStrategy)}>
            <SelectTrigger className="w-[220px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STRATEGY_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  <div className="flex flex-col">
                    <span>{opt.label}</span>
                    <span className="text-[10px] text-muted-foreground">{opt.description}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-3 ml-auto">
          {overrideCount > 0 && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="sm" onClick={clearAllOverrides} className="text-xs text-muted-foreground gap-1.5">
                    <RotateCcw className="h-3 w-3" />
                    {overrideCount} override{overrideCount !== 1 ? 's' : ''}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Clear all per-SKU strategy overrides</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          <span className="text-xs text-muted-foreground">{totalItems} items need reordering</span>
        </div>
      </div>

      {/* Bulk action bar */}
      {someSelected && (
        <div className="flex items-center gap-3 mb-3 px-4 py-2.5 bg-primary/5 border border-primary/20 rounded-lg animate-in fade-in slide-in-from-top-1 duration-200">
          <CheckSquare className="h-4 w-4 text-primary shrink-0" />
          <span className="text-sm font-medium">{selectedSkus.size} selected</span>
          <div className="flex items-center gap-2 ml-2">
            <Label className="text-xs text-muted-foreground">Apply strategy:</Label>
            <Select onValueChange={(v) => applyBulkStrategy(v as ReorderStrategy | '__global__')}>
              <SelectTrigger className="h-7 w-[160px] text-xs">
                <SelectValue placeholder="Choose…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__global__">
                  <span className="text-muted-foreground">Reset to Default</span>
                </SelectItem>
                {STRATEGY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setSelectedSkus(new Set())} className="text-xs text-muted-foreground ml-auto">
            Clear selection
          </Button>
        </div>
      )}

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
                  <th className="px-3 py-3 bg-muted/50 w-10">
                    <Checkbox
                      checked={allPageSelected}
                      onCheckedChange={toggleSelectAll}
                      aria-label="Select all on page"
                    />
                  </th>
                  <SortableHeader column="sku" label="SKU" sort={sort} onSort={toggleSort} />
                  <SortableHeader column="sku_name" label="Name" sort={sort} onSort={toggleSort} />
                  <SortableHeader column="supplier" label="Supplier" sort={sort} onSort={toggleSort} />
                  <th className="px-4 py-3 font-semibold text-muted-foreground uppercase text-xs tracking-wider bg-muted/50">Trend</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground uppercase text-xs tracking-wider bg-muted/50">Strategy</th>
                  <SortableHeader column="suggested_order_qty" label="Suggested Qty" sort={sort} onSort={toggleSort} align="right" />
                  <th className="px-4 py-3 font-semibold text-muted-foreground uppercase text-xs tracking-wider bg-muted/50">Trigger</th>
                  <SortableHeader column="urgency" label="Urgency" sort={sort} onSort={toggleSort} />
                </tr>
              </thead>
              <tbody>
                {paginatedData.map(s => (
                  <tr key={s.sku} className={selectedSkus.has(s.sku) ? 'bg-primary/5' : ''}>
                    <td className="px-3">
                      <Checkbox
                        checked={selectedSkus.has(s.sku)}
                        onCheckedChange={() => toggleSelect(s.sku)}
                        aria-label={`Select ${s.sku}`}
                      />
                    </td>
                    <td className="font-mono font-medium"><HighlightText text={s.sku} /></td>
                    <td><HighlightText text={s.sku_name} /></td>
                    <td><HighlightText text={s.supplier} /></td>
                    <td><DemandSparkline sku={s} /></td>
                    <td>
                      <Select
                        value={skuOverrides[s.sku] || '__global__'}
                        onValueChange={(v) => setSkuStrategy(s.sku, v as ReorderStrategy | '__global__')}
                      >
                        <SelectTrigger
                          className={`h-7 text-[11px] w-[140px] ${s.hasOverride ? 'border-primary/50 bg-primary/5' : ''}`}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__global__">
                            <span className="text-muted-foreground">Default</span>
                          </SelectItem>
                          {STRATEGY_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="text-right font-semibold">{s.suggested_order_qty.toLocaleString()}</td>
                    <td className="text-xs text-muted-foreground max-w-[180px]">{s.reorder_trigger}</td>
                    <td>
                      <span className={`inline-block px-2.5 py-1 rounded-md text-xs ${urgencyClass[s.urgency]}`}>
                        {s.urgency}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <TablePagination totalItems={totalItems} pageSize={pageSize} currentPage={currentPage} onPageChange={setCurrentPage} onPageSizeChange={setPageSize} />
        </div>
      )}
    </div>
  );
}
