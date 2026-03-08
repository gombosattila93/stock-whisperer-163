import { useInventory } from "@/context/InventoryContext";
import { EmptyState } from "@/components/EmptyState";
import { ExportButton } from "@/components/ExportButton";
import { DashboardAlerts } from "@/components/DashboardAlerts";
import { Package, AlertTriangle, ShoppingCart, PackageX } from "lucide-react";
import { AbcClass, XyzClass } from "@/lib/types";

function KpiCard({ icon: Icon, label, value, accent }: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  accent?: string;
}) {
  return (
    <div className="kpi-card">
      <div className="flex items-center gap-3">
        <div className={`rounded-lg p-2.5 ${accent || 'bg-primary/10'}`}>
          <Icon className={`h-5 w-5 ${accent ? 'text-card' : 'text-primary'}`} />
        </div>
        <div>
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
          <p className="text-2xl font-bold mt-0.5">{value}</p>
        </div>
      </div>
    </div>
  );
}

const abcLabels: AbcClass[] = ['A', 'B', 'C'];
const xyzLabels: XyzClass[] = ['X', 'Y', 'Z'];
const cellColors: Record<string, string> = {
  AX: 'bg-primary/20 text-primary',
  AY: 'bg-primary/15 text-primary',
  AZ: 'bg-warning/20 text-warning-foreground',
  BX: 'bg-primary/10 text-primary',
  BY: 'bg-muted text-foreground',
  BZ: 'bg-warning/15 text-warning-foreground',
  CX: 'bg-muted text-muted-foreground',
  CY: 'bg-muted text-muted-foreground',
  CZ: 'bg-destructive/10 text-destructive',
};

export default function Overview() {
  const { filtered, hasData } = useInventory();

  if (!hasData) return <EmptyState />;

  const totalSkus = filtered.length;
  const criticalSkus = filtered.filter(s => s.days_of_stock < s.lead_time_days).length;
  const reorderNeeded = filtered.filter(s => s.effective_stock <= s.reorder_point).length;
  const overstockItems = filtered.filter(s => s.days_of_stock > 180).length;

  // Matrix counts
  const matrixCounts: Record<string, number> = {};
  for (const abc of abcLabels) {
    for (const xyz of xyzLabels) {
      matrixCounts[`${abc}${xyz}`] = filtered.filter(
        s => s.abc_class === abc && s.xyz_class === xyz
      ).length;
    }
  }

  return (
    <div>
      <div className="page-header flex items-center justify-between">
        <div>
          <h1 className="page-title">Inventory Overview</h1>
          <p className="page-subtitle">Real-time inventory health at a glance</p>
        </div>
        <ExportButton
          data={filtered.map(s => ({
            sku: s.sku, name: s.sku_name, supplier: s.supplier, category: s.category,
            abc_class: s.abc_class, xyz_class: s.xyz_class,
            stock_qty: s.stock_qty, days_of_stock: Math.round(s.days_of_stock),
          }))}
          filename="overview-export.csv"
        />
      </div>

      <DashboardAlerts />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <KpiCard icon={Package} label="Total SKUs" value={totalSkus} />
        <KpiCard icon={AlertTriangle} label="Critical SKUs" value={criticalSkus} accent="bg-destructive" />
        <KpiCard icon={ShoppingCart} label="Reorder Needed" value={reorderNeeded} accent="bg-warning" />
        <KpiCard icon={PackageX} label="Overstock Items" value={overstockItems} accent="bg-muted" />
      </div>

      <div className="bg-card border rounded-lg p-6">
        <h2 className="font-semibold mb-4">ABC-XYZ Classification Matrix</h2>
        <div className="overflow-auto">
          <div className="grid grid-cols-4 gap-2 min-w-[400px]">
            <div />
            {xyzLabels.map(xyz => (
              <div key={xyz} className="text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider py-2">
                {xyz} {xyz === 'X' ? '(Stable)' : xyz === 'Y' ? '(Variable)' : '(Erratic)'}
              </div>
            ))}
            {abcLabels.map(abc => (
              <>
                <div key={`label-${abc}`} className="flex items-center text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {abc} {abc === 'A' ? '(High Rev)' : abc === 'B' ? '(Mid Rev)' : '(Low Rev)'}
                </div>
                {xyzLabels.map(xyz => {
                  const key = `${abc}${xyz}`;
                  const count = matrixCounts[key] || 0;
                  return (
                    <div key={key} className={`matrix-cell ${cellColors[key]}`}>
                      <span className="text-2xl font-bold">{count}</span>
                      <span className="text-xs opacity-70">SKUs</span>
                    </div>
                  );
                })}
              </>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
