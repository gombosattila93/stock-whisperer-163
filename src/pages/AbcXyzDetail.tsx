import { useState } from "react";
import { useInventory } from "@/context/InventoryContext";
import { EmptyState } from "@/components/EmptyState";
import { ExportButton } from "@/components/ExportButton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AbcClass, XyzClass } from "@/lib/types";

export default function AbcXyzDetail() {
  const { filtered, hasData } = useInventory();
  const [abcFilter, setAbcFilter] = useState<string>("");
  const [xyzFilter, setXyzFilter] = useState<string>("");

  if (!hasData) return <EmptyState />;

  const data = filtered.filter(s => {
    if (abcFilter && s.abc_class !== abcFilter) return false;
    if (xyzFilter && s.xyz_class !== xyzFilter) return false;
    return true;
  });

  const exportData = data.map(s => ({
    sku: s.sku, name: s.sku_name, supplier: s.supplier, category: s.category,
    abc_class: s.abc_class, xyz_class: s.xyz_class,
    total_revenue: s.total_revenue.toFixed(2), cv: s.cv.toFixed(3),
    avg_daily_demand: s.avg_daily_demand.toFixed(2),
    stock_qty: s.stock_qty, days_of_stock: Math.round(s.days_of_stock),
  }));

  return (
    <div>
      <div className="page-header flex items-center justify-between">
        <div>
          <h1 className="page-title">ABC-XYZ Detail</h1>
          <p className="page-subtitle">Full SKU analysis with classification filters</p>
        </div>
        <ExportButton data={exportData} filename="abc-xyz-detail.csv" />
      </div>

      <div className="filter-bar">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">ABC Class</span>
          <Select value={abcFilter} onValueChange={(v) => setAbcFilter(v === "all" ? "" : v)}>
            <SelectTrigger className="w-[100px] h-8 text-xs">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {(['A', 'B', 'C'] as AbcClass[]).map(c => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">XYZ Class</span>
          <Select value={xyzFilter} onValueChange={(v) => setXyzFilter(v === "all" ? "" : v)}>
            <SelectTrigger className="w-[100px] h-8 text-xs">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {(['X', 'Y', 'Z'] as XyzClass[]).map(c => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <span className="text-xs text-muted-foreground ml-auto">{data.length} SKUs</span>
      </div>

      <div className="bg-card border rounded-lg overflow-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>SKU</th>
              <th>Name</th>
              <th>Supplier</th>
              <th>Category</th>
              <th>ABC</th>
              <th>XYZ</th>
              <th className="text-right">Revenue</th>
              <th className="text-right">CV</th>
              <th className="text-right">Avg Daily Demand</th>
              <th className="text-right">Stock Qty</th>
              <th className="text-right">Days of Stock</th>
            </tr>
          </thead>
          <tbody>
            {data.map(s => (
              <tr key={s.sku}>
                <td className="font-mono font-medium">{s.sku}</td>
                <td>{s.sku_name}</td>
                <td>{s.supplier}</td>
                <td>{s.category}</td>
                <td>
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${
                    s.abc_class === 'A' ? 'bg-primary/10 text-primary' :
                    s.abc_class === 'B' ? 'bg-warning/10 text-warning-foreground' :
                    'bg-muted text-muted-foreground'
                  }`}>
                    {s.abc_class}
                  </span>
                </td>
                <td>
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${
                    s.xyz_class === 'X' ? 'bg-success/10 text-success' :
                    s.xyz_class === 'Y' ? 'bg-warning/10 text-warning-foreground' :
                    'bg-destructive/10 text-destructive'
                  }`}>
                    {s.xyz_class}
                  </span>
                </td>
                <td className="text-right">${s.total_revenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                <td className="text-right">{s.cv.toFixed(3)}</td>
                <td className="text-right">{s.avg_daily_demand.toFixed(2)}</td>
                <td className="text-right">{s.stock_qty.toLocaleString()}</td>
                <td className="text-right">
                  {s.days_of_stock === Infinity ? '∞' : Math.round(s.days_of_stock).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
