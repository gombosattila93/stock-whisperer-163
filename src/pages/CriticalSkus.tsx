import { useInventory } from "@/context/InventoryContext";
import { EmptyState } from "@/components/EmptyState";
import { ExportButton } from "@/components/ExportButton";

export default function CriticalSkus() {
  const { filtered, hasData } = useInventory();

  if (!hasData) return <EmptyState />;

  const critical = filtered
    .filter(s => s.days_of_stock < s.lead_time_days && s.avg_daily_demand > 0)
    .sort((a, b) => a.days_of_stock - b.days_of_stock);

  const exportData = critical.map(s => ({
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

      {critical.length === 0 ? (
        <div className="bg-card border rounded-lg p-12 text-center text-muted-foreground">
          No critical SKUs found with current filters.
        </div>
      ) : (
        <div className="bg-card border rounded-lg overflow-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Name</th>
                <th>Supplier</th>
                <th>Category</th>
                <th className="text-right">Days of Stock</th>
                <th className="text-right">Reorder Point</th>
                <th className="text-right">Stock Qty</th>
                <th className="text-right">Ordered Qty</th>
                <th>Expected Delivery</th>
              </tr>
            </thead>
            <tbody>
              {critical.map(s => (
                <tr key={s.sku} className={s.days_of_stock < 7 ? 'row-critical' : ''}>
                  <td className="font-mono font-medium">{s.sku}</td>
                  <td>{s.sku_name}</td>
                  <td>{s.supplier}</td>
                  <td>{s.category}</td>
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
      )}
    </div>
  );
}
