import { useMemo, useState } from "react";
import { useInventory } from "@/context/InventoryContext";
import { EmptyState } from "@/components/EmptyState";
import { ExportButton } from "@/components/ExportButton";
import { SortableHeader, useSortableTable } from "@/components/SortableHeader";
import { TablePagination, usePagination } from "@/components/TablePagination";
import { getSuggestedOrderQty } from "@/lib/calculations";
import { ReorderEmailModal } from "@/components/ReorderEmailModal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, Mail } from "lucide-react";

interface SupplierRow {
  supplier: string;
  totalSkus: number;
  criticalSkus: number;
  reorderSkus: number;
  tiedUpCapital: number;
  suggestedOrderValue: number;
  avgLeadTime: number;
  overdueCount: number;
}

export default function Suppliers() {
  const { filtered, hasData } = useInventory();
  const [expandedSupplier, setExpandedSupplier] = useState<string | null>(null);
  const [emailSupplier, setEmailSupplier] = useState<string | null>(null);

  const supplierData = useMemo(() => {
    const map = new Map<string, SupplierRow>();
    for (const s of filtered) {
      const existing = map.get(s.supplier);
      const isCritical = s.days_of_stock !== null && s.days_of_stock < s.lead_time_days && s.avg_daily_demand > 0;
      const needsReorder = s.reorder_point !== null && s.effective_stock <= s.reorder_point && s.avg_daily_demand > 0;
      const excessQty = s.days_of_stock !== null && s.days_of_stock > 180 && s.avg_daily_demand > 0
        ? s.effective_stock - s.avg_daily_demand * 180
        : 0;
      const tiedUp = excessQty > 0 ? excessQty * s.unit_price : 0;
      const orderQty = needsReorder ? getSuggestedOrderQty(s.reorder_point ?? 0, s.effective_stock) : 0;
      const orderVal = orderQty * s.unit_price;

      if (existing) {
        existing.totalSkus += 1;
        existing.criticalSkus += isCritical ? 1 : 0;
        existing.reorderSkus += needsReorder ? 1 : 0;
        existing.tiedUpCapital += tiedUp;
        existing.suggestedOrderValue += orderVal;
        existing.avgLeadTime += s.lead_time_days;
        existing.overdueCount += s.overdueDelivery ? 1 : 0;
      } else {
        map.set(s.supplier, {
          supplier: s.supplier,
          totalSkus: 1,
          criticalSkus: isCritical ? 1 : 0,
          reorderSkus: needsReorder ? 1 : 0,
          tiedUpCapital: tiedUp,
          suggestedOrderValue: orderVal,
          avgLeadTime: s.lead_time_days,
          overdueCount: s.overdueDelivery ? 1 : 0,
        });
      }
    }
    for (const row of map.values()) {
      row.avgLeadTime = Math.round(row.avgLeadTime / row.totalSkus);
    }
    return Array.from(map.values());
  }, [filtered]);

  const { sorted, sort, toggleSort } = useSortableTable(supplierData);
  const { paginatedData, currentPage, pageSize, setCurrentPage, setPageSize, totalItems } = usePagination(sorted);

  const expandedSkus = useMemo(() => {
    if (!expandedSupplier) return [];
    return filtered
      .filter(s => s.supplier === expandedSupplier && s.reorder_point !== null && s.effective_stock <= s.reorder_point && s.avg_daily_demand > 0)
      .map(s => ({
        sku: s.sku,
        sku_name: s.sku_name,
        category: s.category,
        stock_qty: s.stock_qty,
        ordered_qty: s.ordered_qty,
        days_of_stock: s.days_of_stock,
        unit_price: s.unit_price,
        suggested_order_qty: getSuggestedOrderQty(s.reorder_point ?? 0, s.effective_stock),
        order_value: getSuggestedOrderQty(s.reorder_point ?? 0, s.effective_stock) * s.unit_price,
        overdueDelivery: s.overdueDelivery,
        expected_delivery_date: s.expected_delivery_date,
      }));
  }, [expandedSupplier, filtered]);

  const emailSkus = useMemo(() => {
    if (!emailSupplier) return [];
    return filtered
      .filter(s => s.supplier === emailSupplier && s.reorder_point !== null && s.effective_stock <= s.reorder_point && s.avg_daily_demand > 0)
      .map(s => ({
        sku: s.sku,
        sku_name: s.sku_name,
        suggested_order_qty: getSuggestedOrderQty(s.reorder_point ?? 0, s.effective_stock),
        unit_price: s.unit_price,
      }));
  }, [emailSupplier, filtered]);

  if (!hasData) return <EmptyState />;

  const exportData = sorted.map(s => ({
    supplier: s.supplier,
    total_skus: s.totalSkus,
    critical_skus: s.criticalSkus,
    skus_to_reorder: s.reorderSkus,
    tied_up_capital_eur: s.tiedUpCapital.toFixed(2),
    suggested_order_value_eur: s.suggestedOrderValue.toFixed(2),
    avg_lead_time_days: s.avgLeadTime,
    overdue_deliveries: s.overdueCount,
  }));

  return (
    <div>
      <div className="page-header flex items-center justify-between">
        <div>
          <h1 className="page-title">Supplier Summary</h1>
          <p className="page-subtitle">Aggregated metrics per supplier — click a row to see its reorder list</p>
        </div>
        <ExportButton data={exportData} filename="supplier-summary.csv" />
      </div>

      {sorted.length === 0 ? (
        <div className="bg-card border rounded-lg p-12 text-center text-muted-foreground">
          No suppliers found with current filters.
        </div>
      ) : (
        <div className="bg-card border rounded-lg overflow-hidden">
          <div className="overflow-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="px-4 py-3 w-8 bg-muted/50"></th>
                  <SortableHeader column="supplier" label="Supplier" sort={sort} onSort={toggleSort} />
                  <SortableHeader column="totalSkus" label="Total SKUs" sort={sort} onSort={toggleSort} align="right" />
                  <SortableHeader column="criticalSkus" label="Critical SKUs" sort={sort} onSort={toggleSort} align="right" />
                  <SortableHeader column="reorderSkus" label="To Reorder" sort={sort} onSort={toggleSort} align="right" />
                  <SortableHeader column="overdueCount" label="Overdue" sort={sort} onSort={toggleSort} align="right" />
                  <SortableHeader column="tiedUpCapital" label="Tied-Up Capital (€)" sort={sort} onSort={toggleSort} align="right" />
                  <SortableHeader column="suggestedOrderValue" label="Suggested Order (€)" sort={sort} onSort={toggleSort} align="right" />
                  <SortableHeader column="avgLeadTime" label="Avg Lead Time" sort={sort} onSort={toggleSort} align="right" />
                </tr>
              </thead>
              <tbody>
                {paginatedData.map(row => (
                  <>
                    <tr
                      key={row.supplier}
                      className="cursor-pointer"
                      onClick={() => setExpandedSupplier(expandedSupplier === row.supplier ? null : row.supplier)}
                    >
                      <td className="text-center">
                        {expandedSupplier === row.supplier
                          ? <ChevronDown className="h-4 w-4 text-muted-foreground inline" />
                          : <ChevronRight className="h-4 w-4 text-muted-foreground inline" />}
                      </td>
                      <td className="font-medium">{row.supplier}</td>
                      <td className="text-right">{row.totalSkus}</td>
                      <td className="text-right">
                        {row.criticalSkus > 0 ? (
                          <span className="text-destructive font-semibold">{row.criticalSkus}</span>
                        ) : '0'}
                      </td>
                      <td className="text-right">
                        {row.reorderSkus > 0 ? (
                          <span className="text-warning-foreground font-semibold">{row.reorderSkus}</span>
                        ) : '0'}
                      </td>
                      <td className="text-right">
                        {row.overdueCount > 0 ? (
                          <Badge variant="outline" className="text-[10px] border-warning/50 bg-warning/10 text-warning-foreground">
                            {row.overdueCount}
                          </Badge>
                        ) : '0'}
                      </td>
                      <td className="text-right">€{row.tiedUpCapital.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td className="text-right font-semibold">€{row.suggestedOrderValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td className="text-right">{row.avgLeadTime}d</td>
                    </tr>
                    {expandedSupplier === row.supplier && expandedSkus.length > 0 && (
                      <tr key={`${row.supplier}-detail`}>
                        <td colSpan={9} className="p-0">
                          <div className="bg-muted/30 px-8 py-3">
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                Reorder List — {row.supplier}
                              </p>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs gap-1.5"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEmailSupplier(row.supplier);
                                }}
                              >
                                <Mail className="h-3.5 w-3.5" />
                                Draft Email
                              </Button>
                            </div>
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-muted-foreground">
                                  <th className="text-left py-1.5 px-2">SKU</th>
                                  <th className="text-left py-1.5 px-2">Name</th>
                                  <th className="text-left py-1.5 px-2">Category</th>
                                  <th className="text-right py-1.5 px-2">Stock</th>
                                  <th className="text-right py-1.5 px-2">Ordered</th>
                                  <th className="text-right py-1.5 px-2">Days of Stock</th>
                                  <th className="text-right py-1.5 px-2">Order Qty</th>
                                  <th className="text-right py-1.5 px-2">Order Value (€)</th>
                                  <th className="text-left py-1.5 px-2">Status</th>
                                </tr>
                              </thead>
                              <tbody>
                                {expandedSkus.map(s => (
                                  <tr key={s.sku} className="border-t border-border/50">
                                    <td className="py-1.5 px-2 font-mono">{s.sku}</td>
                                    <td className="py-1.5 px-2">{s.sku_name}</td>
                                    <td className="py-1.5 px-2">{s.category}</td>
                                    <td className="py-1.5 px-2 text-right">{s.stock_qty.toLocaleString()}</td>
                                    <td className="py-1.5 px-2 text-right">{s.ordered_qty.toLocaleString()}</td>
                                    <td className="py-1.5 px-2 text-right">{s.days_of_stock === Infinity ? '∞' : Math.round(s.days_of_stock)}</td>
                                    <td className="py-1.5 px-2 text-right font-semibold">{s.suggested_order_qty.toLocaleString()}</td>
                                    <td className="py-1.5 px-2 text-right">€{s.order_value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                    <td className="py-1.5 px-2">
                                      {s.overdueDelivery && (
                                        <Badge variant="outline" className="text-[9px] border-warning/50 bg-warning/10 text-warning-foreground">
                                          Overdue delivery
                                        </Badge>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                    {expandedSupplier === row.supplier && expandedSkus.length === 0 && (
                      <tr key={`${row.supplier}-empty`}>
                        <td colSpan={9} className="p-0">
                          <div className="bg-muted/30 px-8 py-4 text-xs text-muted-foreground">
                            No SKUs need reordering for this supplier.
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
          <TablePagination totalItems={totalItems} pageSize={pageSize} currentPage={currentPage} onPageChange={setCurrentPage} onPageSizeChange={setPageSize} />
        </div>
      )}

      {emailSupplier && (
        <ReorderEmailModal
          open={!!emailSupplier}
          onOpenChange={(open) => { if (!open) setEmailSupplier(null); }}
          supplier={emailSupplier}
          skus={emailSkus}
        />
      )}
    </div>
  );
}
