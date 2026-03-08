import { useInventory } from "@/context/InventoryContext";
import { EmptyState } from "@/components/EmptyState";
import { ExportButton } from "@/components/ExportButton";
import { getSuggestedOrderQty, getUrgency } from "@/lib/calculations";

export default function ReorderList() {
  const { filtered, hasData } = useInventory();

  if (!hasData) return <EmptyState />;

  const reorder = filtered
    .filter(s => s.effective_stock <= s.reorder_point && s.avg_daily_demand > 0)
    .map(s => ({
      ...s,
      suggested_order_qty: getSuggestedOrderQty(s.reorder_point, s.effective_stock),
      urgency: getUrgency(s.days_of_stock, s.lead_time_days),
    }))
    .sort((a, b) => {
      const urgencyOrder: Record<string, number> = { Critical: 0, Warning: 1, Watch: 2 };
      return (urgencyOrder[a.urgency] ?? 3) - (urgencyOrder[b.urgency] ?? 3);
    });

  const exportData = reorder.map(s => ({
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

      {reorder.length === 0 ? (
        <div className="bg-card border rounded-lg p-12 text-center text-muted-foreground">
          No items need reordering with current filters.
        </div>
      ) : (
        <div className="bg-card border rounded-lg overflow-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Name</th>
                <th>Supplier</th>
                <th className="text-right">Suggested Order Qty</th>
                <th>Urgency</th>
              </tr>
            </thead>
            <tbody>
              {reorder.map(s => (
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
