import { useInventory } from "@/context/InventoryContext";
import { EmptyState } from "@/components/EmptyState";
import { ExportButton } from "@/components/ExportButton";
import { SortableHeader, useSortableTable } from "@/components/SortableHeader";
import { TablePagination, usePagination } from "@/components/TablePagination";
import { HighlightText } from "@/components/HighlightText";
import { DemandSparkline } from "@/components/DemandSparkline";
import { VirtualizedTable } from "@/components/VirtualizedTable";
import { HelpTooltip } from "@/components/HelpTooltip";
import { EditableCell } from "@/components/EditableCell";
import { TrendBadge } from "@/components/TrendBadge";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useMemo } from "react";

function CurrencyBadge({ currency }: { currency: 'USD' | 'EUR' }) {
  return (
    <Badge
      variant="outline"
      className={`text-[9px] px-1.5 py-0 ${currency === 'USD' ? 'border-blue-500/40 text-blue-600 dark:text-blue-400' : 'border-emerald-500/40 text-emerald-600 dark:text-emerald-400'}`}
    >
      {currency}
    </Badge>
  );
}

function MarginCell({ marginPct, marginEur }: { marginPct: number | null; marginEur: number | null }) {
  if (marginPct === null) return <span className="text-muted-foreground">—</span>;
  const color = marginPct < 0 ? 'text-destructive font-semibold' : marginPct < 15 ? 'text-warning-foreground' : 'text-foreground';
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={`text-right ${color}`}>{marginPct.toFixed(1)}%</span>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs">Margin: €{marginEur?.toFixed(2) ?? '—'}/unit</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default function CriticalSkus() {
  const { filtered, hasData, stockOverrides, setStockOverride, costSettings, skuSupplierOptions, reservedQtyMap } = useInventory();

  const hasReservations = Object.keys(reservedQtyMap).length > 0;

  // Only show SKUs where critical is calculable
  const calculable = filtered.filter(s => s.capability.hasStockData && s.capability.hasLeadTime && s.capability.hasDemandHistory);
  const excludedCount = filtered.length - calculable.length;

  const critical = calculable
    .filter(s => s.days_of_stock !== null && s.days_of_stock < s.lead_time_days && s.avg_daily_demand > 0)
    .sort((a, b) => (a.days_of_stock ?? 0) - (b.days_of_stock ?? 0));

  // Check if any SKU has pricing data
  const hasPricingData = critical.some(s => s.priceData?.hasMarginData);

  // Compute alt supplier suggestions
  const altSupplierMap = useMemo(() => {
    const map: Record<string, { supplier: string; lead_time_days: number }> = {};
    for (const s of critical) {
      if (s.lead_time_days <= 30) continue;
      const opts = skuSupplierOptions[s.sku] || [];
      const alt = opts
        .filter(o => !o.is_primary && o.lead_time_days < s.lead_time_days)
        .sort((a, b) => a.lead_time_days - b.lead_time_days)[0];
      if (alt) {
        map[s.sku] = { supplier: alt.supplier, lead_time_days: alt.lead_time_days };
      }
    }
    return map;
  }, [critical, skuSupplierOptions]);

  const { sorted, sort, toggleSort } = useSortableTable(critical, { column: "days_of_stock", direction: "asc" });
  const { paginatedData, currentPage, pageSize, setCurrentPage, setPageSize, totalItems } = usePagination(sorted);

  if (!hasData) return <EmptyState />;

  // 4b) Empty state after filter
  if (sorted.length === 0) {
    return (
      <div>
        <div className="page-header">
          <h1 className="page-title">Critical SKUs</h1>
          <p className="page-subtitle">Items where days of stock &lt; lead time — risk of stockout</p>
        </div>
        <div className="bg-card border rounded-lg p-12 text-center text-muted-foreground">
          No critical SKUs found with current filters.
        </div>
      </div>
    );
  }

  const exportData = sorted.map(s => ({
    sku: s.sku, name: s.sku_name, supplier: s.supplier, category: s.category,
    days_of_stock: s.days_of_stock !== null ? Math.round(s.days_of_stock) : 'N/A', reorder_point: s.reorder_point !== null ? Math.round(s.reorder_point) : 'N/A',
    stock_qty: s.stock_qty, ordered_qty: s.ordered_qty,
    expected_delivery_date: s.expected_delivery_date,
    overdue_delivery: s.overdueDelivery ? 'Yes' : 'No',
    ...(hasPricingData ? {
      purchase_currency: s.priceData?.purchaseCurrency ?? '',
      margin_pct: s.priceData?.marginPct?.toFixed(1) ?? '',
      margin_eur: s.priceData?.marginEur?.toFixed(2) ?? '',
    } : {}),
  }));

  const thClass = "px-4 py-3 font-semibold text-muted-foreground uppercase text-xs tracking-wider bg-muted/50";

  return (
    <div>
      <div className="page-header flex items-center justify-between">
        <div>
          <h1 className="page-title">Critical SKUs</h1>
          <p className="page-subtitle">Items where days of stock &lt; lead time — risk of stockout</p>
        </div>
        <ExportButton data={exportData} filename="critical-skus.csv" />
      </div>

      {excludedCount > 0 && (
        <div className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/50 px-4 py-3 mb-4">
          <span className="text-xs text-muted-foreground">
            {excludedCount} SKUs excluded — missing stock or lead time data. See ABC-XYZ Detail for full list.
          </span>
        </div>
      )}

      <div className="bg-card border rounded-lg overflow-hidden">
        <VirtualizedTable
          data={paginatedData}
          rowKey={(s) => s.sku}
          rowClassName={(s) => (s.days_of_stock ?? Infinity) < 7 ? 'row-critical' : ''}
          columns={[
            {
              key: 'sku',
              header: <SortableHeader column="sku" label="SKU" sort={sort} onSort={toggleSort} />,
              render: (s) => (
                <div>
                  <span className="font-mono font-medium"><HighlightText text={s.sku} /></span>
                  {s.insufficientData && (
                    <TooltipProvider><Tooltip><TooltipTrigger asChild>
                      <Badge variant="outline" className="text-[9px] ml-1.5 border-warning/50 text-warning-foreground">Limited data</Badge>
                    </TooltipTrigger><TooltipContent><p className="text-xs">Less than 30% of the demand window has sales data</p></TooltipContent></Tooltip></TooltipProvider>
                  )}
                  {s.singleRecordEstimate && (
                    <TooltipProvider><Tooltip><TooltipTrigger asChild>
                      <Badge variant="outline" className="text-[9px] ml-1 border-muted-foreground/30">1 record</Badge>
                    </TooltipTrigger><TooltipContent><p className="text-xs">Safety stock estimated — only 1 sale record</p></TooltipContent></Tooltip></TooltipProvider>
                  )}
                  {s.safetyStockCapped && (
                    <TooltipProvider><Tooltip><TooltipTrigger asChild>
                      <Badge variant="outline" className="text-[9px] ml-1 border-destructive/30 text-destructive">SS capped</Badge>
                    </TooltipTrigger><TooltipContent><p className="text-xs">Safety stock capped — highly erratic demand</p></TooltipContent></Tooltip></TooltipProvider>
                  )}
                  {s.shelfLifeLtWarning && (
                    <TooltipProvider><Tooltip><TooltipTrigger asChild>
                      <Badge variant="destructive" className="text-[9px] ml-1">⚠ Shelf &lt; LT</Badge>
                    </TooltipTrigger><TooltipContent><p className="text-xs">Shelf life shorter than lead time — order only on demand</p></TooltipContent></Tooltip></TooltipProvider>
                  )}
                </div>
              ),
            },
            {
              key: 'sku_name',
              header: <SortableHeader column="sku_name" label="Name" sort={sort} onSort={toggleSort} />,
              render: (s) => <HighlightText text={s.sku_name} />,
            },
            {
              key: 'supplier',
              header: <SortableHeader column="supplier" label="Supplier" sort={sort} onSort={toggleSort} />,
              render: (s) => <HighlightText text={s.supplier} />,
            },
            {
              key: 'category',
              header: <SortableHeader column="category" label="Category" sort={sort} onSort={toggleSort} />,
              render: (s) => <HighlightText text={s.category} />,
            },
            {
              key: 'sparkline',
              header: <span className={thClass}>Trend</span>,
              render: (s) => <DemandSparkline sku={s} />,
            },
            {
              key: 'trend',
              header: <SortableHeader column="trendPct" label="Direction" sort={sort} onSort={toggleSort} />,
              render: (s) => (
                <div className="flex items-center gap-1.5">
                  <TrendBadge trend={s.trend} trendPct={s.trendPct} seasonalityFlag={s.seasonalityFlag} seasonalityPct={s.seasonalityPct} />
                  {costSettings.serviceLevelSettings?.usePerClassServiceLevel && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">{s.effectiveServiceLevel}</Badge>
                  )}
                </div>
              ),
            },
            {
              key: 'days_of_stock',
              header: <SortableHeader column="days_of_stock" label="Days of Stock" sort={sort} onSort={toggleSort} align="right" />,
              render: (s) => (
                <span className={`text-right font-semibold ${(s.days_of_stock ?? Infinity) < 7 ? 'text-destructive' : 'text-warning'}`}>
                  {s.days_of_stock === null ? '—' : s.days_of_stock === Infinity ? '∞' : Math.round(s.days_of_stock)}
                </span>
              ),
            },
            {
              key: 'reorder_point',
              header: <SortableHeader column="reorder_point" label="Reorder Point" sort={sort} onSort={toggleSort} align="right" />,
              render: (s) => <span className="text-right">{s.reorder_point !== null ? Math.round(s.reorder_point) : '—'}</span>,
            },
            {
              key: 'stock_qty',
              header: <SortableHeader column="stock_qty" label="Stock Qty" sort={sort} onSort={toggleSort} align="right" />,
              render: (s) => (
                <EditableCell
                  value={s.stock_qty}
                  sku={s.sku}
                  field="stock_qty"
                  isOverridden={stockOverrides[s.sku]?.stock_qty !== undefined}
                  onSave={setStockOverride}
                />
              ),
            },
            {
              key: 'ordered_qty',
              header: <SortableHeader column="ordered_qty" label="Ordered Qty" sort={sort} onSort={toggleSort} align="right" />,
              render: (s) => (
                <div>
                  <EditableCell
                    value={s.ordered_qty}
                    sku={s.sku}
                    field="ordered_qty"
                    isOverridden={stockOverrides[s.sku]?.ordered_qty !== undefined}
                    onSave={setStockOverride}
                  />
                  {s.pastDueOrders && (
                    <TooltipProvider><Tooltip><TooltipTrigger asChild>
                      <Badge variant="outline" className="text-[9px] border-warning/50 text-warning-foreground mt-0.5">Past due</Badge>
                    </TooltipTrigger><TooltipContent><p className="text-xs">Order excluded from effective stock — delivery likely already arrived</p></TooltipContent></Tooltip></TooltipProvider>
                  )}
                </div>
              ),
            },
            {
              key: 'lead_time_days',
              header: <SortableHeader column="lead_time_days" label="Lead Time" sort={sort} onSort={toggleSort} align="right" />,
              render: (s) => (
                <EditableCell
                  value={s.lead_time_days}
                  sku={s.sku}
                  field="lead_time_days"
                  isOverridden={stockOverrides[s.sku]?.lead_time_days !== undefined}
                  onSave={setStockOverride}
                />
              ),
            },
            ...(hasPricingData ? [{
              key: 'currency',
              header: <span className={thClass}>Currency</span>,
              render: (s: typeof paginatedData[0]) => (
                s.priceData?.hasPurchasePrice
                  ? <CurrencyBadge currency={s.priceData.purchaseCurrency} />
                  : <span className="text-muted-foreground">—</span>
              ),
            }] : []),
            ...(hasPricingData ? [{
              key: 'margin',
              header: <SortableHeader column="marginPct" label="Margin %" sort={sort} onSort={toggleSort} align="right" />,
              render: (s: typeof paginatedData[0]) => (
                <MarginCell marginPct={s.priceData?.marginPct ?? null} marginEur={s.priceData?.marginEur ?? null} />
              ),
            }] : []),
            {
              key: 'expected_delivery_date',
              header: <SortableHeader column="expected_delivery_date" label="Expected Delivery" sort={sort} onSort={toggleSort} />,
              render: (s) => (
                <div>
                  <span>{s.expected_delivery_date || '—'}</span>
                  {s.overdueDelivery && (
                    <Badge variant="outline" className="text-[9px] ml-1.5 border-warning/50 bg-warning/10 text-warning-foreground">
                      Overdue
                    </Badge>
                  )}
                </div>
              ),
            },
            ...(costSettings.stockoutCostEnabled ? [{
              key: 'stockoutRisk',
              header: <SortableHeader column="stockoutRisk" label="Stockout Risk €" sort={sort} onSort={toggleSort} align="right" />,
              render: (s: typeof paginatedData[0]) => (
                <span className="text-right text-destructive font-medium">
                  {s.stockoutRisk > 0 ? `€${s.stockoutRisk.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '—'}
                </span>
              ),
            }] : []),
            ...(hasReservations ? [{
              key: 'reserved_qty',
              header: <span className="px-4 py-3 font-semibold text-muted-foreground uppercase text-xs tracking-wider bg-muted/50 text-right">Reserved</span>,
              render: (s: typeof paginatedData[0]) => (
                <div className="text-right">
                  {s.reserved_qty > 0 ? (
                    <div>
                      <span className="font-medium">{s.reserved_qty}</span>
                      <div className={`text-[10px] ${s.available_qty < 0 ? 'text-destructive font-semibold' : 'text-muted-foreground'}`}>
                        avail: {s.available_qty}
                      </div>
                      {s.available_qty < 0 && (
                        <Badge variant="destructive" className="text-[9px] mt-0.5">Deficit</Badge>
                      )}
                    </div>
                  ) : <span className="text-muted-foreground">—</span>}
                </div>
              ),
            }] : []),
            {
              key: 'altSupplier',
              header: <span className="px-4 py-3 font-semibold text-muted-foreground uppercase text-xs tracking-wider bg-muted/50">Alt Supplier</span>,
              render: (s) => {
                const alt = altSupplierMap[s.sku];
                if (!alt) return <span className="text-muted-foreground">—</span>;
                return (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge variant="secondary" className="text-[10px] cursor-help">
                          Alt: {alt.supplier} — {alt.lead_time_days}d
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-xs">Alternative supplier with shorter lead time ({alt.lead_time_days}d vs {s.lead_time_days}d)</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                );
              },
            },
          ]}
        />
        <TablePagination totalItems={totalItems} pageSize={pageSize} currentPage={currentPage} onPageChange={setCurrentPage} onPageSizeChange={setPageSize} />
      </div>
    </div>
  );
}
