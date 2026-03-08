import { useInventory } from "@/context/InventoryContext";
import { EmptyState } from "@/components/EmptyState";
import { ExportButton } from "@/components/ExportButton";
import { DashboardAlerts } from "@/components/DashboardAlerts";
import { TrendBadge } from "@/components/TrendBadge";
import { Package, AlertTriangle, ShoppingCart, PackageX, TrendingUp, TrendingDown, Minus, Flame, Target, Lock } from "lucide-react";
import { AbcClass, XyzClass } from "@/lib/types";
import { loadSkuOverrides } from "@/lib/persistence";
import { STRATEGY_OPTIONS, ReorderStrategy } from "@/lib/reorderStrategies";
import { useMemo, useState, useEffect } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";

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

const STRATEGY_COLORS: Record<ReorderStrategy, string> = {
  rop: 'hsl(217, 91%, 60%)',
  eoq: 'hsl(142, 71%, 45%)',
  minmax: 'hsl(38, 92%, 50%)',
  periodic: 'hsl(280, 67%, 55%)',
};

const STRATEGY_LABEL_MAP: Record<ReorderStrategy, string> = Object.fromEntries(
  STRATEGY_OPTIONS.map(o => [o.value, o.label])
) as Record<ReorderStrategy, string>;

export default function Overview() {
  const { filtered, hasData, costSettings, reservedQtyMap } = useInventory();

  const [overridesLoaded, setOverridesLoaded] = useState<Record<string, ReorderStrategy>>({});

  useEffect(() => {
    loadSkuOverrides().then(setOverridesLoaded);
  }, [filtered]);

  const strategyDistribution = useMemo(() => {
    if (filtered.length === 0) return [];
    const counts: Record<ReorderStrategy, number> = { rop: 0, eoq: 0, minmax: 0, periodic: 0 };
    for (const s of filtered) {
      const strategy = overridesLoaded[s.sku] || 'rop';
      counts[strategy as ReorderStrategy]++;
    }
    return Object.entries(counts)
      .filter(([, count]) => count > 0)
      .map(([key, count]) => ({
        name: STRATEGY_LABEL_MAP[key as ReorderStrategy],
        value: count,
        color: STRATEGY_COLORS[key as ReorderStrategy],
      }));
  }, [filtered, overridesLoaded]);

  // Reserved stock value
  const hasReservations = Object.keys(reservedQtyMap).length > 0;
  const reservedStockValue = useMemo(() =>
    filtered.reduce((sum, s) => sum + s.reserved_qty * s.unit_price, 0),
    [filtered]
  );

  if (!hasData) return <EmptyState />;

  const totalSkus = filtered.length;
  const criticalSkus = filtered.filter(s => s.days_of_stock < s.lead_time_days).length;
  const reorderNeeded = filtered.filter(s => s.effective_stock <= s.reorder_point).length;
  const overstockItems = filtered.filter(s => s.days_of_stock > 180).length;

  // Trend & seasonality
  const risingCount = filtered.filter(s => s.trend === 'rising').length;
  const fallingCount = filtered.filter(s => s.trend === 'falling').length;
  const stableCount = filtered.filter(s => s.trend === 'stable').length;
  const seasonalCount = filtered.filter(s => s.seasonalityFlag).length;
  const top5Rising = [...filtered]
    .filter(s => s.trend === 'rising')
    .sort((a, b) => b.trendPct - a.trendPct)
    .slice(0, 5);

  // Weighted average service level
  const totalRev = filtered.reduce((s, a) => s + a.total_revenue, 0);
  const SERVICE_LEVEL_NUM: Record<string, number> = { '90%': 90, '95%': 95, '99%': 99 };
  const weightedAvgSL = totalRev > 0
    ? filtered.reduce((s, a) => s + (SERVICE_LEVEL_NUM[a.effectiveServiceLevel] || 95) * a.total_revenue, 0) / totalRev
    : 95;
  const showPerClassSL = costSettings.serviceLevelSettings?.usePerClassServiceLevel;

  // Reserved stock value
  const hasReservations = Object.keys(reservedQtyMap).length > 0;
  const reservedStockValue = useMemo(() =>
    filtered.reduce((sum, s) => sum + s.reserved_qty * s.unit_price, 0),
    [filtered]
  );
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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        <KpiCard icon={Package} label="Total SKUs" value={totalSkus} />
        <KpiCard icon={AlertTriangle} label="Critical SKUs" value={criticalSkus} accent="bg-destructive" />
        <KpiCard icon={ShoppingCart} label="Reorder Needed" value={reorderNeeded} accent="bg-warning" />
        <KpiCard icon={PackageX} label="Overstock Items" value={overstockItems} accent="bg-muted" />
        {showPerClassSL && (
          <KpiCard icon={Target} label="Wtd Avg Service Level" value={`${weightedAvgSL.toFixed(1)}%`} />
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="lg:col-span-2 bg-card border rounded-lg p-6">
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

        <div className="bg-card border rounded-lg p-6">
          <h2 className="font-semibold mb-4">Reorder Strategy Mix</h2>
          {strategyDistribution.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
              No SKU data
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={strategyDistribution}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={85}
                  paddingAngle={3}
                  dataKey="value"
                  stroke="none"
                >
                  {strategyDistribution.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number, name: string) => [`${value} SKUs`, name]}
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                />
                <Legend
                  verticalAlign="bottom"
                  iconType="circle"
                  iconSize={8}
                  formatter={(value: string) => (
                    <span className="text-xs text-foreground">{value}</span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ─── Trend Summary ──────────────────────────────────────── */}
      <div className="bg-card border rounded-lg p-6 mb-8">
        <h2 className="font-semibold mb-4">Trend Summary</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
          <div className="flex items-center gap-2.5 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
            <TrendingUp className="h-4 w-4 text-emerald-500 shrink-0" />
            <div>
              <p className="text-lg font-bold">{risingCount}</p>
              <p className="text-xs text-muted-foreground">Rising</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
            <Minus className="h-4 w-4 text-muted-foreground shrink-0" />
            <div>
              <p className="text-lg font-bold">{stableCount}</p>
              <p className="text-xs text-muted-foreground">Stable</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
            <TrendingDown className="h-4 w-4 text-destructive shrink-0" />
            <div>
              <p className="text-lg font-bold">{fallingCount}</p>
              <p className="text-xs text-muted-foreground">Falling</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
            <Flame className="h-4 w-4 text-amber-500 shrink-0" />
            <div>
              <p className="text-lg font-bold">{seasonalCount}</p>
              <p className="text-xs text-muted-foreground">Seasonal spikes</p>
            </div>
          </div>
        </div>

        {top5Rising.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground mb-2">Top 5 Fastest Rising SKUs</h3>
            <div className="space-y-1.5">
              {top5Rising.map(s => (
                <div key={s.sku} className="flex items-center gap-3 text-sm px-3 py-1.5 rounded-md bg-muted/30">
                  <span className="font-mono font-medium w-24 shrink-0">{s.sku}</span>
                  <span className="text-muted-foreground truncate flex-1">{s.sku_name}</span>
                  <TrendBadge trend={s.trend} trendPct={s.trendPct} seasonalityFlag={s.seasonalityFlag} seasonalityPct={s.seasonalityPct} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
