import { useInventory } from "@/context/InventoryContext";
import { EmptyState } from "@/components/EmptyState";
import { ExportButton } from "@/components/ExportButton";
import { getSuggestedOrderQty, getUrgency } from "@/lib/calculations";
import { SortableHeader, useSortableTable } from "@/components/SortableHeader";
import { TablePagination, usePagination } from "@/components/TablePagination";
import { HighlightText } from "@/components/HighlightText";
import { DemandSparkline } from "@/components/DemandSparkline";
import { useMemo } from "react";

export default function ReorderList() {
  const { filtered, hasData } = useInventory();

  const reorder = useMemo(() =>
    filtered
      .filter(s => s.effective_stock <= s.reorder_point && s.avg_daily_demand > 0)
      .map(s => ({
        ...s,
        suggested_order_qty: getSuggestedOrderQty(s.reorder_point, s.effective_stock),
        urgency: getUrgency(s.days_of_stock, s.lead_time_days),
      })),
    [filtered]
  );

  const { sorted, sort, toggleSort } = useSortableTable(reorder);
  const { paginatedData, currentPage, pageSize, setCurrentPage, setPageSize, totalItems } = usePagination(sorted);

  if (!hasData) return <EmptyState />;

  const exportData = sorted.map(s => ({
    sku: s.sku, name: s.sku_name, supplier: s.supplier,
    suggested_order_qty: s.suggested_order_qty, urgency: s.urgency,
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
                  <SortableHeader column="sku" label="SKU" sort={sort} onSort={toggleSort} />
                  <SortableHeader column="sku_name" label="Name" sort={sort} onSort={toggleSort} />
                  <SortableHeader column="supplier" label="Supplier" sort={sort} onSort={toggleSort} />
                  <th className="px-4 py-3 font-semibold text-muted-foreground uppercase text-xs tracking-wider bg-muted/50">Trend</th>
                  <SortableHeader column="suggested_order_qty" label="Suggested Order Qty" sort={sort} onSort={toggleSort} align="right" />
                  <SortableHeader column="urgency" label="Urgency" sort={sort} onSort={toggleSort} />
                </tr>
              </thead>
              <tbody>
                {paginatedData.map(s => (
                  <tr key={s.sku}>
                    <td className="font-mono font-medium"><HighlightText text={s.sku} /></td>
                    <td><HighlightText text={s.sku_name} /></td>
                    <td><HighlightText text={s.supplier} /></td>
                    <td><DemandSparkline sku={s} /></td>
                    <td className="text-right font-semibold">{s.suggested_order_qty.toLocaleString()}</td>
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
