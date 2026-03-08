import { useInventory } from "@/context/InventoryContext";
import { EmptyState } from "@/components/EmptyState";
import { ExportButton } from "@/components/ExportButton";
import { getSuggestedOrderQty, getUrgency } from "@/lib/calculations";
import { SortableHeader, useSortableTable } from "@/components/SortableHeader";
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
        <div className="bg-card border rounded-lg overflow-auto">
          <table className="data-table">
            <thead>
              <tr>
                <SortableHeader column="sku" label="SKU" sort={sort} onSort={toggleSort} />
                <SortableHeader column="sku_name" label="Name" sort={sort} onSort={toggleSort} />
                <SortableHeader column="supplier" label="Supplier" sort={sort} onSort={toggleSort} />
                <SortableHeader column="suggested_order_qty" label="Suggested Order Qty" sort={sort} onSort={toggleSort} align="right" />
                <SortableHeader column="urgency" label="Urgency" sort={sort} onSort={toggleSort} />
              </tr>
            </thead>
            <tbody>
              {sorted.map(s => (
                <tr key={s.sku}>
                  <td className="font-mono font-medium">{s.sku}</td>
                  <td>{s.sku_name}</td>
                  <td>{s.supplier}</td>
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
      )}
    </div>
  );
}
