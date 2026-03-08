import { useInventory } from "@/context/InventoryContext";
import { EmptyState } from "@/components/EmptyState";
import { ExportButton } from "@/components/ExportButton";
import { SortableHeader, useSortableTable } from "@/components/SortableHeader";
import { TablePagination, usePagination } from "@/components/TablePagination";
import { HighlightText } from "@/components/HighlightText";
import { DemandSparkline } from "@/components/DemandSparkline";

export default function CriticalSkus() {
  const { filtered, hasData } = useInventory();

  const critical = filtered
    .filter(s => s.days_of_stock < s.lead_time_days && s.avg_daily_demand > 0)
    .sort((a, b) => a.days_of_stock - b.days_of_stock);

  const { sorted, sort, toggleSort } = useSortableTable(critical, { column: "days_of_stock", direction: "asc" });
  const { paginatedData, currentPage, pageSize, setCurrentPage, setPageSize, totalItems } = usePagination(sorted);

  if (!hasData) return <EmptyState />;

  const exportData = sorted.map(s => ({
    sku: s.sku, name: s.sku_name, supplier: s.supplier, category: s.category,
    days_of_stock: Math.round(s.days_of_stock), reorder_point: Math.round(s.reorder_point),
    stock_qty: s.stock_qty, ordered_qty: s.ordered_qty,
    expected_delivery_date: s.expected_delivery_date,
  }));

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
          <div className="overflow-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <SortableHeader column="sku" label="SKU" sort={sort} onSort={toggleSort} />
                  <SortableHeader column="sku_name" label="Name" sort={sort} onSort={toggleSort} />
                  <SortableHeader column="supplier" label="Supplier" sort={sort} onSort={toggleSort} />
                  <SortableHeader column="category" label="Category" sort={sort} onSort={toggleSort} />
                  <th className="px-4 py-3 font-semibold text-muted-foreground uppercase text-xs tracking-wider bg-muted/50">Trend</th>
                  <SortableHeader column="days_of_stock" label="Days of Stock" sort={sort} onSort={toggleSort} align="right" />
                  <SortableHeader column="reorder_point" label="Reorder Point" sort={sort} onSort={toggleSort} align="right" />
                  <SortableHeader column="stock_qty" label="Stock Qty" sort={sort} onSort={toggleSort} align="right" />
                  <SortableHeader column="ordered_qty" label="Ordered Qty" sort={sort} onSort={toggleSort} align="right" />
                  <SortableHeader column="expected_delivery_date" label="Expected Delivery" sort={sort} onSort={toggleSort} />
                </tr>
              </thead>
              <tbody>
                {paginatedData.map(s => (
                  <tr key={s.sku} className={s.days_of_stock < 7 ? 'row-critical' : ''}>
                    <td className="font-mono font-medium"><HighlightText text={s.sku} /></td>
                    <td><HighlightText text={s.sku_name} /></td>
                    <td><HighlightText text={s.supplier} /></td>
                    <td><HighlightText text={s.category} /></td>
                    <td><DemandSparkline sku={s} /></td>
                    <td className={`text-right font-semibold ${s.days_of_stock < 7 ? 'text-destructive' : 'text-warning'}`}>
                      {s.days_of_stock === Infinity ? '∞' : Math.round(s.days_of_stock)}
                    </td>
                    <td className="text-right">{Math.round(s.reorder_point)}</td>
                    <td className="text-right">{s.stock_qty.toLocaleString()}</td>
                    <td className="text-right">{s.ordered_qty.toLocaleString()}</td>
                    <td>{s.expected_delivery_date || '—'}</td>
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
