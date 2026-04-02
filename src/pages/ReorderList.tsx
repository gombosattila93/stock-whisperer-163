import { useInventory } from "@/context/InventoryContext";
import { EmptyState } from "@/components/EmptyState";
import { ExportButton } from "@/components/ExportButton";
import { getUrgency } from "@/lib/calculations";
import { purchaseToEur } from "@/lib/fxRates";
import { computeReorder, getStrategyOptions, ReorderStrategy, EoqSettings, DEFAULT_EOQ_SETTINGS } from "@/lib/reorderStrategies";
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
import { useLanguage } from "@/lib/i18n";
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
import { RotateCcw, CheckSquare, Download, AlertTriangle as AlertTriangleIcon, Clock, FileText } from "lucide-react";
import { HelpTooltip } from "@/components/HelpTooltip";
import { PurchaseOrderGenerator } from "@/components/PurchaseOrderGenerator";
import { useMemo, useState, useCallback, useEffect } from "react";
import { Input } from "@/components/ui/input";

function LeadTimeQuickInput({ sku, onSave }: { sku: string; onSave: (sku: string, field: string, value: number) => void }) {
  const { t } = useLanguage();
  const [value, setValue] = useState('');
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    const num = parseInt(value, 10);
    if (!isNaN(num) && num >= 1 && num <= 365) {
      onSave(sku, 'lead_time_days', num);
      setSaved(true);
    }
  };

  if (saved) {
    return <span className="text-xs text-primary font-medium">✓ {t('common.save')}</span>;
  }

  return (
    <div className="flex items-center gap-2">
      <Input
        type="number"
        min={1}
        max={365}
        placeholder={t('placeholder.eg14')}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleSave()}
        className="h-7 w-20 text-xs"
      />
      <Button variant="outline" size="sm" className="h-7 text-xs px-2" onClick={handleSave} disabled={!value}>
        {t('common.save')}
      </Button>
    </div>
  );
}

export default function ReorderList() {
  const { filtered, hasData, stockOverrides, setStockOverride, costSettings, skuSupplierOptions, reservedQtyMap, fxRates } = useInventory();
  const { t } = useLanguage();
  const hasReservations = Object.keys(reservedQtyMap).length > 0;
  const [globalStrategy, setGlobalStrategy] = useState<ReorderStrategy>('rop');
  const [skuOverrides, setSkuOverrides] = useState<SkuStrategyOverrides>({});
  const [eoqSettings, setEoqSettings] = useState<EoqSettings>(DEFAULT_EOQ_SETTINGS);
  const [selectedSkus, setSelectedSkus] = useState<Set<string>>(new Set());
  const [showPO, setShowPO] = useState(false);
  const [bulkLeadTime, setBulkLeadTime] = useState('');

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

  const calculable = filtered.filter(s => s.reorder_point !== null && s.capability.hasStockData && s.capability.hasLeadTime && s.capability.hasDemandHistory);
  const needsLeadTime = filtered.filter(s => s.capability.hasDemandHistory && s.capability.hasStockData && !s.capability.hasLeadTime);
  const excludedCount = filtered.length - calculable.length;

  const reorder = useMemo(() =>
    calculable
      .filter(s => s.effective_stock <= s.reorder_point! && s.avg_daily_demand > 0)
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
    [calculable, globalStrategy, skuOverrides, eoqSettings, skuSupplierOptions]
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

  const applyBulkLeadTime = useCallback(() => {
    const num = parseInt(bulkLeadTime, 10);
    if (isNaN(num) || num < 1 || num > 365) return;
    selectedSkus.forEach(sku => {
      setStockOverride(sku, 'lead_time_days', num);
    });
    setBulkLeadTime('');
    setSelectedSkus(new Set());
  }, [selectedSkus, bulkLeadTime, setStockOverride]);

  // PO items from selected or all sorted
  const poItems = useMemo(() => {
    const source = selectedSkus.size > 0
      ? sorted.filter(s => selectedSkus.has(s.sku))
      : sorted;
    return source.map(s => ({
      sku: s.sku,
      sku_name: s.sku_name,
      supplier: s.supplier,
      suggested_order_qty: s.suggested_order_qty,
      unit_price: s.priceData?.effectivePurchasePriceEur ?? s.unit_price,
      lead_time_days: s.lead_time_days,
      urgency: s.urgency,
    }));
  }, [sorted, selectedSkus]);

  // ─── Supplier summary ─────────────────────────────────────────────────
  const supplierSummary = useMemo(() => {
    const map = new Map<string, { supplier: string; skuCount: number; totalQty: number; totalValueEur: number; totalValueUsdRaw: number; totalValueUsdAsEur: number; hasUsd: boolean; urgencies: string[] }>();
    for (const s of sorted) {
      const pd = s.priceData;
      const effPrice = pd?.effectivePurchasePriceEur ?? s.unit_price;
      const orderValueEur = s.suggested_order_qty * effPrice;
      const isUsd = pd?.purchaseCurrency === 'USD' && pd?.hasPurchasePrice;
      const usdRaw = isUsd ? s.suggested_order_qty * (pd!.priceBreaks[0]?.price ?? 0) : 0;

      const existing = map.get(s.supplier);
      if (existing) {
        existing.skuCount += 1;
        existing.totalQty += s.suggested_order_qty;
        existing.totalValueEur += orderValueEur;
        if (isUsd) { existing.totalValueUsdRaw += usdRaw; existing.totalValueUsdAsEur += orderValueEur; existing.hasUsd = true; }
        existing.urgencies.push(s.urgency);
      } else {
        map.set(s.supplier, {
          supplier: s.supplier, skuCount: 1, totalQty: s.suggested_order_qty,
          totalValueEur: orderValueEur, totalValueUsdRaw: isUsd ? usdRaw : 0,
          totalValueUsdAsEur: isUsd ? orderValueEur : 0, hasUsd: isUsd,
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
    totalValueEur: supplierSummary.reduce((s, r) => s + r.totalValueEur, 0),
    totalUsdRaw: supplierSummary.reduce((s, r) => s + r.totalValueUsdRaw, 0),
    totalUsdAsEur: supplierSummary.reduce((s, r) => s + r.totalValueUsdAsEur, 0),
    hasAnyUsd: supplierSummary.some(r => r.hasUsd),
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
      total_order_value_eur: r.totalValueEur.toFixed(2),
      usd_component: r.hasUsd ? `$${r.totalValueUsdRaw.toFixed(2)}` : '',
      avg_urgency: r.avgUrgency,
    }));
    data.push({
      supplier: t('reorder.grandTotal'),
      skus_to_order: grandTotal.skuCount,
      total_order_qty: grandTotal.totalQty,
      total_order_value_eur: grandTotal.totalValueEur.toFixed(2),
      usd_component: grandTotal.hasAnyUsd ? `$${grandTotal.totalUsdRaw.toFixed(2)}` : '',
      avg_urgency: '',
    });
    exportToCsv(data, 'reorder-supplier-summary.csv');
  };

  return (
    <div>
      <div className="page-header flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="page-title">{t('reorder.title')}</h1>
            <HelpTooltip
              text={t('reorder.helpText')}
              tip={t('reorder.helpTip')}
            />
          </div>
          <p className="page-subtitle">{t('reorder.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowPO(true)} disabled={sorted.length === 0} className="gap-1.5">
            <FileText className="h-4 w-4" />
            {t('reorder.generatePO')}
          </Button>
          <ExportButton data={exportData} filename="reorder-list.csv" />
        </div>
      </div>

      {excludedCount > 0 && (
        <div className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/50 px-4 py-3 mb-4">
          <span className="text-xs text-muted-foreground">
            {excludedCount} {t('reorder.excluded')}
          </span>
        </div>
      )}

      {needsLeadTime.length > 0 && (
        <div className="rounded-lg border border-border bg-card mb-4">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-muted/30">
            <Clock className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">{t('reorder.setLeadTime')}</span>
            <span className="text-xs text-muted-foreground ml-1">({needsLeadTime.length} SKU)</span>
          </div>
          <div className="overflow-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="px-4 py-2 font-semibold text-muted-foreground uppercase text-xs tracking-wider bg-muted/50 text-left">SKU</th>
                  <th className="px-4 py-2 font-semibold text-muted-foreground uppercase text-xs tracking-wider bg-muted/50 text-left">{t('common.name')}</th>
                  <th className="px-4 py-2 font-semibold text-muted-foreground uppercase text-xs tracking-wider bg-muted/50 text-left">{t('common.supplier')}</th>
                  <th className="px-4 py-2 font-semibold text-muted-foreground uppercase text-xs tracking-wider bg-muted/50 text-right">{t('common.stock')}</th>
                  <th className="px-4 py-2 font-semibold text-muted-foreground uppercase text-xs tracking-wider bg-muted/50 text-right">{t('abcxyz.avgDailyDemand')}</th>
                  <th className="px-4 py-2 font-semibold text-muted-foreground uppercase text-xs tracking-wider bg-muted/50">{t('critical.leadTime')} ({t('common.days')})</th>
                </tr>
              </thead>
              <tbody>
                {needsLeadTime.map(s => (
                  <tr key={s.sku}>
                    <td className="font-mono font-medium text-sm">{s.sku}</td>
                    <td className="text-sm">{s.sku_name}</td>
                    <td className="text-sm">{s.supplier}</td>
                    <td className="text-right text-sm">{s.stock_qty.toLocaleString()}</td>
                    <td className="text-right text-sm">{s.avg_daily_demand.toFixed(1)}</td>
                    <td>
                      <LeadTimeQuickInput sku={s.sku} onSave={setStockOverride} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="filter-bar mb-4">
        <div className="flex items-center gap-2">
          <EoqSettingsPanel settings={eoqSettings} onChange={handleEoqChange} />
          <Label className="text-xs text-muted-foreground whitespace-nowrap">{t('reorder.defaultStrategy')}</Label>
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
                    {overrideCount} {overrideCount !== 1 ? 'overrides' : 'override'}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('reorder.resetToDefault')}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          <span className="text-xs text-muted-foreground">{totalItems} {t('reorder.needsReorderCount')}</span>
        </div>
      </div>

      {/* Bulk action bar */}
      {someSelected && (
        <div className="flex items-center gap-3 mb-3 px-4 py-2.5 bg-primary/5 border border-primary/20 rounded-lg animate-in fade-in slide-in-from-top-1 duration-200">
           <CheckSquare className="h-4 w-4 text-primary shrink-0" />
          <span className="text-sm font-medium">{selectedSkus.size} {t('reorder.selected')}</span>
          <div className="flex items-center gap-2 ml-2">
            <Label className="text-xs text-muted-foreground">{t('common.strategy')}:</Label>
            <Select onValueChange={(v) => applyBulkStrategy(v as ReorderStrategy | '__global__')}>
              <SelectTrigger className="h-7 w-[160px] text-xs">
                <SelectValue placeholder={t('placeholder.choose')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__global__">
                  <span className="text-muted-foreground">{t('reorder.resetToDefault')}</span>
                </SelectItem>
                {STRATEGY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 ml-2">
            <Label className="text-xs text-muted-foreground">{t('critical.leadTime')}:</Label>
            <Input
              type="number"
              min={1}
              max={365}
              placeholder={t('common.days')}
              value={bulkLeadTime}
              onChange={e => setBulkLeadTime(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && applyBulkLeadTime()}
              className="h-7 w-20 text-xs"
            />
            <Button variant="outline" size="sm" className="h-7 text-xs px-2" onClick={applyBulkLeadTime} disabled={!bulkLeadTime}>
              {t('common.apply')}
            </Button>
          </div>
          <Button variant="outline" size="sm" onClick={() => setShowPO(true)} className="text-xs gap-1 ml-2">
            <FileText className="h-3.5 w-3.5" />
            {t('reorder.poForSelected')}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSelectedSkus(new Set())} className="text-xs text-muted-foreground ml-auto">
            {t('reorder.clearSelection')}
          </Button>
        </div>
      )}

      {sorted.length === 0 ? (
        <div className="bg-card border rounded-lg p-12 text-center text-muted-foreground">
          {t('reorder.noItems')}
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
                    <SortableHeader column="sku_name" label={t('common.name')} sort={sort} onSort={toggleSort} />
                    <SortableHeader column="supplier" label={t('common.supplier')} sort={sort} onSort={toggleSort} />
                    <th className="px-4 py-3 font-semibold text-muted-foreground uppercase text-xs tracking-wider bg-muted/50">{t('reorder.sparkline')}</th>
                    <th className="px-4 py-3 font-semibold text-muted-foreground uppercase text-xs tracking-wider bg-muted/50">{t('common.direction')}</th>
                    <SortableHeader column="stock_qty" label={t('critical.stockQty')} sort={sort} onSort={toggleSort} align="right" />
                    <SortableHeader column="ordered_qty" label={t('critical.orderedQty')} sort={sort} onSort={toggleSort} align="right" />
                    <SortableHeader column="lead_time_days" label={t('critical.leadTime')} sort={sort} onSort={toggleSort} align="right" />
                    <th className="px-4 py-3 font-semibold text-muted-foreground uppercase text-xs tracking-wider bg-muted/50">{t('common.strategy')}</th>
                    <SortableHeader column="suggested_order_qty" label={t('reorder.suggestedQty')} sort={sort} onSort={toggleSort} align="right" />
                    <th className="px-4 py-3 font-semibold text-muted-foreground uppercase text-xs tracking-wider bg-muted/50">{t('reorder.trigger')}</th>
                    <SortableHeader column="urgency" label={t('common.urgency')} sort={sort} onSort={toggleSort} />
                    <th className="px-4 py-3 font-semibold text-muted-foreground uppercase text-xs tracking-wider bg-muted/50 text-right">{t('reorder.estPoValue')}</th>
                    {costSettings.priceBreaksEnabled && <th className="px-4 py-3 font-semibold text-muted-foreground uppercase text-xs tracking-wider bg-muted/50">{t('reorder.priceBreak')}</th>}
                    {costSettings.minOrderValueEnabled && <th className="px-4 py-3 font-semibold text-muted-foreground uppercase text-xs tracking-wider bg-muted/50">{t('reorder.minOrder')}</th>}
                    {hasReservations && <th className="px-4 py-3 font-semibold text-muted-foreground uppercase text-xs tracking-wider bg-muted/50 text-right">{t('critical.reserved')}</th>}
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
                              <span className="text-muted-foreground">{t('common.default')}</span>
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
                                  <p className="text-xs">MOQ: {s.moq} {t('common.units')}</p>
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
                                  <p className="text-xs">{t('common.seasonal')} {Math.round(s.seasonalityPct)}%</p>
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
                      {/* Est. PO Value + price break hint */}
                      <td className="text-right text-xs">
                        {(() => {
                          const pd = s.priceData;
                          const effPrice = pd?.effectivePurchasePriceEur ?? null;
                          if (!effPrice) return <span className="text-muted-foreground">—</span>;
                          const poEur = s.suggested_order_qty * effPrice;
                          const isUsd = pd?.purchaseCurrency === 'USD';
                          const poUsd = isUsd && pd?.priceBreaks[0] ? s.suggested_order_qty * pd.priceBreaks[0].price : null;
                          return (
                            <div>
                              <span className="font-semibold">€{poEur.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                              {isUsd && poUsd && (
                                <div className="text-[10px] text-muted-foreground">≈ ${poUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                              )}
                              {pd && pd.nextPriceBreakQty !== null && pd.nextPriceBreakQty > 0 && pd.nextPriceBreakSaving !== null && pd.nextPriceBreakSaving > 0 && (
                                <div className="text-[10px] text-warning-foreground mt-0.5">
                                  +{pd.nextPriceBreakQty} db → €{(pd.nextPriceBreakSaving / s.suggested_order_qty).toFixed(2)}/db {t('reorder.saving')}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      {costSettings.priceBreaksEnabled && (
                        <td className="text-xs">
                          {s.priceBreakQty > 0 ? (
                            <span className="text-primary font-medium">
                              ↑{s.priceBreakQty} ({t('reorder.saving')} €{s.priceBreakSaving.toFixed(0)})
                            </span>
                          ) : s.pbOpportunityQty > 0 ? (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="text-primary/80 font-medium cursor-help">
                                    +{s.pbOpportunityQty - s.suggested_order_qty} → {t('reorder.saving')} €{s.pbOpportunitySaving.toFixed(0)}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="text-xs">{t('reorder.priceBreak')} @ {s.pbOpportunityQty} {t('common.units')}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
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
                              <span className="text-destructive font-medium">−€{gap.toFixed(0)} {t('reorder.belowMin')}</span>
                            ) : '—'}
                          </td>
                        );
                      })()}
                      {hasReservations && (
                        <td className="text-right text-xs">
                          {s.reserved_qty > 0 ? (
                            <div>
                              <span className="font-medium">{s.reserved_qty}</span>
                              <div className={`text-[10px] ${s.available_qty < 0 ? 'text-destructive font-semibold' : 'text-muted-foreground'}`}>
                                avail: {s.available_qty}
                              </div>
                            </div>
                          ) : '—'}
                        </td>
                      )}
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
                <h2 className="text-lg font-semibold">{t('reorder.supplierSummary')}</h2>
                <Button variant="outline" size="sm" onClick={exportSupplierSummary}>
                  <Download className="h-4 w-4 mr-1.5" />
                  {t('reorder.exportSupplierSummary')}
                </Button>
              </div>
              <div className="bg-card border rounded-lg overflow-hidden">
                <div className="overflow-auto">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th className="px-4 py-3 font-semibold text-muted-foreground uppercase text-xs tracking-wider bg-muted/50 text-left">{t('common.supplier')}</th>
                        <th className="px-4 py-3 font-semibold text-muted-foreground uppercase text-xs tracking-wider bg-muted/50 text-right">{t('reorder.skusToOrder')}</th>
                        <th className="px-4 py-3 font-semibold text-muted-foreground uppercase text-xs tracking-wider bg-muted/50 text-right">{t('reorder.totalOrderQty')}</th>
                        <th className="px-4 py-3 font-semibold text-muted-foreground uppercase text-xs tracking-wider bg-muted/50 text-right">{t('reorder.eurValue')}</th>
                        <th className="px-4 py-3 font-semibold text-muted-foreground uppercase text-xs tracking-wider bg-muted/50 text-right">{t('reorder.usdComponent')}</th>
                        <th className="px-4 py-3 font-semibold text-muted-foreground uppercase text-xs tracking-wider bg-muted/50">{t('reorder.avgUrgency')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {supplierSummary.map(row => (
                        <tr key={row.supplier}>
                          <td className="font-medium">{row.supplier}</td>
                          <td className="text-right">{row.skuCount}</td>
                          <td className="text-right">{row.totalQty.toLocaleString()}</td>
                          <td className="text-right">
                            €{(row.totalValueEur - row.totalValueUsdAsEur).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                          </td>
                          <td className="text-right">
                            {row.hasUsd ? (
                              <span>
                                ${row.totalValueUsdRaw.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                <span className="text-muted-foreground text-[10px] ml-1">(≈ €{row.totalValueUsdAsEur.toLocaleString(undefined, { maximumFractionDigits: 0 })})</span>
                              </span>
                            ) : '—'}
                          </td>
                          <td>
                            <span className={`inline-block px-2.5 py-1 rounded-md text-xs ${urgencyClass[row.avgUrgency]}`}>
                              {row.avgUrgency}
                            </span>
                          </td>
                        </tr>
                      ))}
                      <tr className="border-t-2 border-border font-bold bg-muted/30">
                        <td>{t('reorder.grandTotal')}</td>
                        <td className="text-right">{grandTotal.skuCount}</td>
                        <td className="text-right">{grandTotal.totalQty.toLocaleString()}</td>
                        <td className="text-right">€{grandTotal.totalValueEur.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                        <td className="text-right">
                          {grandTotal.hasAnyUsd && (
                            <span className="text-muted-foreground text-xs">USD: ${grandTotal.totalUsdRaw.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                          )}
                        </td>
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
      <PurchaseOrderGenerator
        open={showPO}
        onOpenChange={setShowPO}
        items={poItems}
      />
    </div>
  );
}
