import { useInventory } from "@/context/InventoryContext";
import { EmptyState } from "@/components/EmptyState";
import { ExportButton } from "@/components/ExportButton";

export default function Overstock() {
  const { filtered, hasData } = useInventory();

  if (!hasData) return <EmptyState />;

  const overstock = filtered
    .filter(s => s.days_of_stock > 180)
    .map(s => {
      const idealStock = s.avg_daily_demand * 90; // 90 days ideal
      const excess_qty = Math.max(0, s.effective_stock - idealStock);
      const tied_up_capital = excess_qty * s.unit_price;
      return { ...s, excess_qty: Math.round(excess_qty), tied_up_capital };
    })
    .sort((a, b) => b.tied_up_capital - a.tied_up_capital);

  const totalTiedUp = overstock.reduce((s, o) => s + o.tied_up_capital, 0);

  const exportData = overstock.map(s => ({
    sku: s.sku, name: s.sku_name, supplier: s.supplier,
    days_of_stock: s.days_of_stock === Infinity ? 'N/A' : Math.round(s.days_of_stock),
    excess_qty: s.excess_qty, tied_up_capital: s.tied_up_capital.toFixed(2),
  }));

  return (
    <div>
      <div className="page-header flex items-center justify-between">
        <div>
          <h1 className="page-title">Overstock Analysis</h1>
          <p className="page-subtitle">
            Items with &gt;180 days of stock — Total tied-up capital:{' '}
            <span className="font-semibold text-foreground">${totalTiedUp.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
          </p>
        </div>
        <ExportButton data={exportData} filename="overstock.csv" />
      </div>

      {overstock.length === 0 ? (
        <div className="bg-card border rounded-lg p-12 text-center text-muted-foreground">
          No overstock items found with current filters.
        </div>
      ) : (
        <div className="bg-card border rounded-lg overflow-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Name</th>
                <th>Supplier</th>
                <th className="text-right">Days of Stock</th>
                <th className="text-right">Excess Qty</th>
                <th className="text-right">Tied-up Capital</th>
              </tr>
            </thead>
            <tbody>
              {overstock.map(s => (
                <tr key={s.sku}>
                  <td className="font-mono font-medium">{s.sku}</td>
                  <td>{s.sku_name}</td>
                  <td>{s.supplier}</td>
                  <td className="text-right">
                    {s.days_of_stock === Infinity ? '∞' : Math.round(s.days_of_stock).toLocaleString()}
                  </td>
                  <td className="text-right">{s.excess_qty.toLocaleString()}</td>
                  <td className="text-right font-semibold">
                    ${s.tied_up_capital.toLocaleString(undefined, { minimumFractionDigits: 2 })}
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
