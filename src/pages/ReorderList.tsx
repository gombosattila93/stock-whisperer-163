import { useInventory } from "@/context/InventoryContext";
import { EmptyState } from "@/components/EmptyState";
import { ExportButton } from "@/components/ExportButton";
import { getUrgency } from "@/lib/calculations";
import { computeReorder, STRATEGY_OPTIONS, ReorderStrategy, EoqSettings, DEFAULT_EOQ_SETTINGS } from "@/lib/reorderStrategies";
import { SkuStrategyOverrides } from "@/lib/skuStrategyOverrides";
import { loadSkuOverrides, saveSkuOverrides, loadEoqSettings, saveEoqSettings } from "@/lib/persistence";
import { SortableHeader, useSortableTable } from "@/components/SortableHeader";
import { TablePagination, usePagination } from "@/components/TablePagination";
import { HighlightText } from "@/components/HighlightText";
import { DemandSparkline } from "@/components/DemandSparkline";
import { EoqSettingsPanel } from "@/components/EoqSettingsPanel";
import { EditableCell } from "@/components/EditableCell";
import { TrendBadge } from "@/components/TrendBadge";
import { exportToCsv } from "@/lib/csvUtils";
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
import { RotateCcw, CheckSquare, Download, AlertTriangle as AlertTriangleIcon } from "lucide-react";
import { useMemo, useState, useCallback, useEffect } from "react";

export default function ReorderList() {
  const { filtered, hasData, stockOverrides, setStockOverride, costSettings, skuSupplierOptions } = useInventory();
  const [globalStrategy, setGlobalStrategy] = useState<ReorderStrategy>('rop');
  const [skuOverrides, setSkuOverrides] = useState<SkuStrategyOverrides>({});
  const [eoqSettings, setEoqSettings] = useState<EoqSettings>(DEFAULT_EOQ_SETTINGS);
  const [selectedSkus, setSelectedSkus] = useState<Set<string>>(new Set());

  // Load persisted state from IndexedDB on mount
  useEffect(() => {
    loadSkuOverrides().then(setSkuOverrides);
    loadEoqSettings().then(setEoqSettings);
  }, []);

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

  const handleEoqChange = useCallback((settings: EoqSettings) => {
    setEoqSettings(settings);
    saveEoqSettings(settings);
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
        const result = computeReorder(s, effectiveStrategy, eoqSettings);
        // Get primary supplier MOQ
        const supplierOpts = skuSupplierOptions[s.sku] || [];
        const primaryOpt = supplierOpts.find(o => o.is_primary) || supplierOpts[0];
        const moq = primaryOpt?.moq || 1;
        // Seasonality-adjusted suggested qty
        const seasonalMultiplier = s.seasonalityFlag ? 1 + (s.seasonalityPct / 200) : 1;
        const baseAdjusted = Math.ceil(result.suggested_order_qty * seasonalMultiplier);
        // Apply MOQ rounding
        const effectiveMoq = Math.max(1, moq);
        const moqAdjusted = Math.max(effectiveMoq, Math.ceil(baseAdjusted / effectiveMoq) * effectiveMoq);
        const moqApplied = moq > 1 && moqAdjusted > baseAdjusted;

        // Price break opportunity from supplier options
        let pbOpportunityQty = 0;
        let pbOpportunitySaving = 0;
        if (primaryOpt && primaryOpt.price_breaks.length > 0) {
          const sortedBreaks = [...primaryOpt.price_breaks].sort((a, b) => a.minQty - b.minQty);
          for (const brk of sortedBreaks) {
            if (moqAdjusted < brk.minQty && brk.minQty <= moqAdjusted * 1.2) {
              const currentCost = moqAdjusted * (primaryOpt.unit_price || s.unit_price);
              const breakCost = brk.minQty * brk.unitPrice;
              if (breakCost < currentCost) {
                pbOpportunityQty = brk.minQty;
                pbOpportunitySaving = currentCost - breakCost;
                break;
              }
            }
          }
        }

        return {
          ...s,
          suggested_order_qty: moqAdjusted,
          base_suggested_qty: result.suggested_order_qty,
          urgency: getUrgency(s.days_of_stock, s.lead_time_days),
          strategyLabel: result.strategyLabel,
          reorder_trigger: result.reorder_trigger,
          effectiveStrategy,
          hasOverride: !!skuOverrides[s.sku],
          moq,
          moqApplied,
          pbOpportunityQty,
          pbOpportunitySaving,
        };
      }),
    [filtered, globalStrategy, skuOverrides, eoqSettings, skuSupplierOptions]
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

  // ─── Supplier summary ─────────────────────────────────────────────────
  const supplierSummary = useMemo(() => {
    const map = new Map<string, { supplier: string; skuCount: number; totalQty: number; totalValue: number; urgencies: string[] }>();
    for (const s of sorted) {
      const existing = map.get(s.supplier);
      const orderValue = s.suggested_order_qty * s.unit_price;
      if (existing) {
        existing.skuCount += 1;
        existing.totalQty += s.suggested_order_qty;
        existing.totalValue += orderValue;
        existing.urgencies.push(s.urgency);
      } else {
        map.set(s.supplier, {
          supplier: s.supplier,
          skuCount: 1,
          totalQty: s.suggested_order_qty,
          totalValue: orderValue,
          urgencies: [s.urgency],
        });
      }
    }
    return Array.from(map.values()).map(row => {
      const urgencyScore: Record<string, number> = { Critical: 3, Warning: 2, Watch: 1 };
      const avgScore = row.urgencies.reduce((s, u) => s + (urgencyScore[u] || 0), 0) / row.urgencies.length;
      const avgUrgency = avgScore >= 2.5 ? 'Critical' : avgScore >= 1.5 ? 'Warning' : 'Watch';
      return { ...row, avgUrgency };
    });
  }, [sorted]);

  const grandTotal = useMemo(() => ({
    skuCount: supplierSummary.reduce((s, r) => s + r.skuCount, 0),
    totalQty: supplierSummary.reduce((s, r) => s + r.totalQty, 0),
    totalValue: supplierSummary.reduce((s, r) => s + r.totalValue, 0),
  }), [supplierSummary]);

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

  const exportSupplierSummary = () => {
    const data = supplierSummary.map(r => ({
      supplier: r.supplier,
      skus_to_order: r.skuCount,
      total_order_qty: r.totalQty,
      total_order_value_eur: r.totalValue.toFixed(2),
      avg_urgency: r.avgUrgency,
    }));
    data.push({
      supplier: 'GRAND TOTAL',
      skus_to_order: grandTotal.skuCount,
      total_order_qty: grandTotal.totalQty,
      total_order_value_eur: grandTotal.totalValue.toFixed(2),
      avg_urgency: '',
    });
    exportToCsv(data, 'reorder-supplier-summary.csv');
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
          <EoqSettingsPanel settings={eoqSettings} onChange={handleEoqChange} />
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
        <>
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
                    <th className="px-4 py-3 font-semibold text-muted-foreground uppercase text-xs tracking-wider bg-muted/50">Sparkline</th>
                    <th className="px-4 py-3 font-semibold text-muted-foreground uppercase text-xs tracking-wider bg-muted/50">Direction</th>
                    <SortableHeader column="stock_qty" label="Stock Qty" sort={sort} onSort={toggleSort} align="right" />
                    <SortableHeader column="ordered_qty" label="Ordered Qty" sort={sort} onSort={toggleSort} align="right" />
                    <SortableHeader column="lead_time_days" label="Lead Time" sort={sort} onSort={toggleSort} align="right" />
                    <th className="px-4 py-3 font-semibold text-muted-foreground uppercase text-xs tracking-wider bg-muted/50">Strategy</th>
                    <SortableHeader column="suggested_order_qty" label="Suggested Qty" sort={sort} onSort={toggleSort} align="right" />
                    <th className="px-4 py-3 font-semibold text-muted-foreground uppercase text-xs tracking-wider bg-muted/50">Trigger</th>
                    <SortableHeader column="urgency" label="Urgency" sort={sort} onSort={toggleSort} />
                    {costSettings.priceBreaksEnabled && <th className="px-4 py-3 font-semibold text-muted-foreground uppercase text-xs tracking-wider bg-muted/50">Price Break</th>}
                    {costSettings.minOrderValueEnabled && <th className="px-4 py-3 font-semibold text-muted-foreground uppercase text-xs tracking-wider bg-muted/50">Min Order</th>}
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
                      <td><TrendBadge trend={s.trend} trendPct={s.trendPct} seasonalityFlag={s.seasonalityFlag} seasonalityPct={s.seasonalityPct} /></td>
                      <td className="text-right">
                        <EditableCell
                          value={s.stock_qty}
                          sku={s.sku}
                          field="stock_qty"
                          isOverridden={stockOverrides[s.sku]?.stock_qty !== undefined}
                          onSave={setStockOverride}
                        />
                      </td>
                      <td className="text-right">
                        <EditableCell
                          value={s.ordered_qty}
                          sku={s.sku}
                          field="ordered_qty"
                          isOverridden={stockOverrides[s.sku]?.ordered_qty !== undefined}
                          onSave={setStockOverride}
                        />
                      </td>
                      <td className="text-right">
                        <EditableCell
                          value={s.lead_time_days}
                          sku={s.sku}
                          field="lead_time_days"
                          isOverridden={stockOverrides[s.sku]?.lead_time_days !== undefined}
                          onSave={setStockOverride}
                        />
                      </td>
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
                      <td className="text-right font-semibold">
                        <div className="flex items-center justify-end gap-1.5">
                          {s.moqApplied && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="inline-block px-1.5 py-0.5 rounded text-[10px] bg-accent text-accent-foreground font-medium cursor-help">MOQ</span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="text-xs">Rounded up to MOQ: {s.moq} units</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                          {s.seasonalityFlag && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <AlertTriangleIcon className="h-3.5 w-3.5 text-amber-500 shrink-0 cursor-help" />
                                </TooltipTrigger>
                                <TooltipContent className="max-w-[250px]">
                                  <p className="text-xs">Demand is {Math.round(s.seasonalityPct)}% above 90d average — qty adjusted from {s.base_suggested_qty}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                          {s.suggested_order_qty.toLocaleString()}
                        </div>
                      </td>
                      <td className="text-xs text-muted-foreground max-w-[180px]">{s.reorder_trigger}</td>
                      <td>
                        <div className="flex items-center gap-1.5">
                          <span className={`inline-block px-2.5 py-1 rounded-md text-xs ${urgencyClass[s.urgency]}`}>
                            {s.urgency}
                          </span>
                          {costSettings.serviceLevelSettings?.usePerClassServiceLevel && (
                            <span className="inline-block px-1.5 py-0.5 rounded text-[10px] border border-border text-muted-foreground">
                              {s.effectiveServiceLevel}
                            </span>
                          )}
                        </div>
                      </td>
                      {costSettings.priceBreaksEnabled && (
                        <td className="text-xs">
                          {s.priceBreakQty > 0 ? (
                            <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                              ↑{s.priceBreakQty} (save €{s.priceBreakSaving.toFixed(0)})
                            </span>
                          ) : '—'}
                        </td>
                      )}
                      {costSettings.minOrderValueEnabled && (() => {
                        const orderValue = s.suggested_order_qty * s.unit_price;
                        const minVal = costSettings.supplierMinOrderValues[s.supplier];
                        const gap = minVal ? minVal - orderValue : 0;
                        return (
                          <td className="text-xs">
                            {minVal && gap > 0 ? (
                              <span className="text-destructive font-medium">−€{gap.toFixed(0)} below min</span>
                            ) : '—'}
                          </td>
                        );
                      })()}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <TablePagination totalItems={totalItems} pageSize={pageSize} currentPage={currentPage} onPageChange={setCurrentPage} onPageSizeChange={setPageSize} />
          </div>

          {/* ─── Reorder Summary by Supplier ──────────────────────────── */}
          {supplierSummary.length > 0 && (
            <div className="mt-6">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold">Reorder Summary by Supplier</h2>
                <Button variant="outline" size="sm" onClick={exportSupplierSummary}>
                  <Download className="h-4 w-4 mr-1.5" />
                  Export supplier summary
                </Button>
              </div>
              <div className="bg-card border rounded-lg overflow-hidden">
                <div className="overflow-auto">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th className="px-4 py-3 font-semibold text-muted-foreground uppercase text-xs tracking-wider bg-muted/50 text-left">Supplier</th>
                        <th className="px-4 py-3 font-semibold text-muted-foreground uppercase text-xs tracking-wider bg-muted/50 text-right">SKUs to Order</th>
                        <th className="px-4 py-3 font-semibold text-muted-foreground uppercase text-xs tracking-wider bg-muted/50 text-right">Total Order Qty</th>
                        <th className="px-4 py-3 font-semibold text-muted-foreground uppercase text-xs tracking-wider bg-muted/50 text-right">Total Order Value (€)</th>
                        <th className="px-4 py-3 font-semibold text-muted-foreground uppercase text-xs tracking-wider bg-muted/50">Avg Urgency</th>
                      </tr>
                    </thead>
                    <tbody>
                      {supplierSummary.map(row => (
                        <tr key={row.supplier}>
                          <td className="font-medium">{row.supplier}</td>
                          <td className="text-right">{row.skuCount}</td>
                          <td className="text-right">{row.totalQty.toLocaleString()}</td>
                          <td className="text-right">€{row.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          <td>
                            <span className={`inline-block px-2.5 py-1 rounded-md text-xs ${urgencyClass[row.avgUrgency]}`}>
                              {row.avgUrgency}
                            </span>
                          </td>
                        </tr>
                      ))}
                      <tr className="border-t-2 border-border font-bold bg-muted/30">
                        <td>Grand Total</td>
                        <td className="text-right">{grandTotal.skuCount}</td>
                        <td className="text-right">{grandTotal.totalQty.toLocaleString()}</td>
                        <td className="text-right">€{grandTotal.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
