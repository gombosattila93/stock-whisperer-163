import { useInventory } from "@/context/InventoryContext";
import { EmptyState } from "@/components/EmptyState";
import { ExportButton } from "@/components/ExportButton";
import { SortableHeader, useSortableTable } from "@/components/SortableHeader";
import { TablePagination, usePagination } from "@/components/TablePagination";
import { HighlightText } from "@/components/HighlightText";
import { DemandSparkline } from "@/components/DemandSparkline";
import { VirtualizedTable } from "@/components/VirtualizedTable";
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

export default function CriticalSkus() {
  const { filtered, hasData, stockOverrides, setStockOverride, costSettings, skuSupplierOptions } = useInventory();

  const critical = filtered
    .filter(s => s.days_of_stock < s.lead_time_days && s.avg_daily_demand > 0)
    .sort((a, b) => a.days_of_stock - b.days_of_stock);

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

  const exportData = sorted.map(s => ({
    sku: s.sku, name: s.sku_name, supplier: s.supplier, category: s.category,
    days_of_stock: Math.round(s.days_of_stock), reorder_point: Math.round(s.reorder_point),
    stock_qty: s.stock_qty, ordered_qty: s.ordered_qty,
    expected_delivery_date: s.expected_delivery_date,
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

      {sorted.length === 0 ? (
        <div className="bg-card border rounded-lg p-12 text-center text-muted-foreground">
          No critical SKUs found with current filters.
        </div>
      ) : (
        <div className="bg-card border rounded-lg overflow-hidden">
          <VirtualizedTable
            data={paginatedData}
            rowKey={(s) => s.sku}
            rowClassName={(s) => s.days_of_stock < 7 ? 'row-critical' : ''}
            columns={[
              {
                key: 'sku',
                header: <SortableHeader column="sku" label="SKU" sort={sort} onSort={toggleSort} />,
                render: (s) => <span className="font-mono font-medium"><HighlightText text={s.sku} /></span>,
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
                  <span className={`text-right font-semibold ${s.days_of_stock < 7 ? 'text-destructive' : 'text-warning'}`}>
                    {s.days_of_stock === Infinity ? '∞' : Math.round(s.days_of_stock)}
                  </span>
                ),
              },
              {
                key: 'reorder_point',
                header: <SortableHeader column="reorder_point" label="Reorder Point" sort={sort} onSort={toggleSort} align="right" />,
                render: (s) => <span className="text-right">{Math.round(s.reorder_point)}</span>,
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
                  <EditableCell
                    value={s.ordered_qty}
                    sku={s.sku}
                    field="ordered_qty"
                    isOverridden={stockOverrides[s.sku]?.ordered_qty !== undefined}
                    onSave={setStockOverride}
                  />
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
              {
                key: 'expected_delivery_date',
                header: <SortableHeader column="expected_delivery_date" label="Expected Delivery" sort={sort} onSort={toggleSort} />,
                render: (s) => <span>{s.expected_delivery_date || '—'}</span>,
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
            ]}
          />
          <TablePagination totalItems={totalItems} pageSize={pageSize} currentPage={currentPage} onPageChange={setCurrentPage} onPageSizeChange={setPageSize} />
        </div>
      )}
    </div>
  );
}
