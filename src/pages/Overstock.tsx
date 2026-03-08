import { useInventory } from "@/context/InventoryContext";
import { EmptyState } from "@/components/EmptyState";
import { ExportButton } from "@/components/ExportButton";
import { SortableHeader, useSortableTable } from "@/components/SortableHeader";
import { TablePagination, usePagination } from "@/components/TablePagination";
import { HighlightText } from "@/components/HighlightText";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useMemo } from "react";
import { PackageX } from "lucide-react";
import { HelpTooltip } from "@/components/HelpTooltip";

function CurrencyBadge({ currency }: { currency: 'USD' | 'EUR' }) {
  return (
    <Badge
      variant="outline"
      className={`text-[9px] px-1.5 py-0 ${currency === 'USD' ? 'border-blue-500/40 text-blue-600 dark:text-blue-400' : 'border-emerald-500/40 text-emerald-600 dark:text-emerald-400'}`}
    >
      {currency}
    </Badge>
  );
}

export default function Overstock() {
  const { filtered, hasData, costSettings } = useInventory();

  // 2c) Separate dead stock from overstock
  const deadStock = useMemo(() =>
    filtered.filter(s => s.dead_stock),
    [filtered]
  );

  const overstock = useMemo(() =>
    filtered
      .filter(s => s.days_of_stock !== null && s.days_of_stock > 180 && !s.dead_stock)
      .map(s => {
        const idealStock = s.avg_daily_demand * 180;
        const excess_qty = Math.max(0, s.effective_stock - idealStock);
        // Use EUR purchase price if available, fall back to unit_price
        const pricePerUnit = s.priceData?.effectivePurchasePriceEur ?? s.unit_price;
        const tied_up_capital = excess_qty * pricePerUnit;
        return { ...s, excess_qty: Math.round(excess_qty), tied_up_capital };
      })
      .sort((a, b) => {
        if (a.shelfLifeRisk === 'critical' && b.shelfLifeRisk !== 'critical') return -1;
        if (b.shelfLifeRisk === 'critical' && a.shelfLifeRisk !== 'critical') return 1;
        return b.tied_up_capital - a.tied_up_capital;
      }),
    [filtered]
  );

  // Stock-only SKUs: have stock but no demand data — unknown if overstock
  const stockOnlySkus = useMemo(() =>
    filtered.filter(s => s.capability.tier === 'stock-only' && s.stock_qty > 0 && !s.dead_stock),
    [filtered]
  );

  const hasPricingData = overstock.some(s => s.priceData?.hasMarginData);

  const { sorted, sort, toggleSort } = useSortableTable(overstock, { column: "tied_up_capital", direction: "desc" });
  const { paginatedData, currentPage, pageSize, setCurrentPage, setPageSize, totalItems } = usePagination(sorted);

  if (!hasData) return <EmptyState />;

  const totalTiedUp = overstock.reduce((s, o) => s + o.tied_up_capital, 0);
  const deadStockValue = deadStock.reduce((s, d) => s + (d.priceData?.effectivePurchasePriceEur ?? d.unit_price) * d.stock_qty, 0);
  const showHolding = costSettings.holdingCostEnabled;
  const showStorage = costSettings.storageCostEnabled;
  const showShelfLife = costSettings.shelfLifeEnabled;

  const exportData = sorted.map(s => ({
    sku: s.sku, name: s.sku_name, supplier: s.supplier,
    days_of_stock: s.days_of_stock === Infinity ? 'N/A' : Math.round(s.days_of_stock),
    excess_qty: s.excess_qty, tied_up_capital: s.tied_up_capital.toFixed(2),
    ...(hasPricingData ? {
      purchase_currency: s.priceData?.purchaseCurrency ?? '',
      margin_pct: s.priceData?.marginPct?.toFixed(1) ?? '',
    } : {}),
    ...(showHolding ? { annual_holding_cost: s.holdingCost.toFixed(2) } : {}),
    ...(showStorage ? { monthly_storage_cost: s.storageCost.toFixed(2) } : {}),
    ...(showShelfLife ? { shelf_life_days: s.shelfLifeDays, shelf_life_risk: s.shelfLifeRisk } : {}),
  }));

  return (
    <div>
      <div className="page-header flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="page-title">Overstock Analysis</h1>
            <HelpTooltip
              text="Items with >180 days of stock coverage, plus dead stock (zero sales)."
              tip="Tied-up capital = excess qty × purchase price. Dead stock items are the best candidates for liquidation or returns. Review this page monthly."
            />
          </div>
          <p className="page-subtitle">
            Items with &gt;180 days of stock — Total tied-up capital:{' '}
            <span className="font-semibold text-foreground">€{totalTiedUp.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
          </p>
        </div>
        <ExportButton data={exportData} filename="overstock.csv" />
      </div>

      {/* 2c) Dead stock section */}
      {deadStock.length > 0 && (
        <div className="bg-card border border-muted-foreground/20 rounded-lg p-5 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <PackageX className="h-5 w-5 text-muted-foreground" />
            <h2 className="font-semibold">Dead Stock</h2>
            <Badge variant="secondary" className="text-xs">{deadStock.length} SKUs</Badge>
            <span className="text-sm text-muted-foreground ml-auto">
              Value: €{deadStockValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            Items with zero demand but positive stock — consider liquidation or write-off.
          </p>
          <div className="overflow-auto max-h-[300px]">
            <table className="data-table text-xs">
              <thead>
                <tr>
                  <th className="px-3 py-2 bg-muted/50 text-left text-muted-foreground uppercase tracking-wider font-semibold">SKU</th>
                  <th className="px-3 py-2 bg-muted/50 text-left text-muted-foreground uppercase tracking-wider font-semibold">Name</th>
                  <th className="px-3 py-2 bg-muted/50 text-left text-muted-foreground uppercase tracking-wider font-semibold">Supplier</th>
                  {hasPricingData && <th className="px-3 py-2 bg-muted/50 text-center text-muted-foreground uppercase tracking-wider font-semibold">Cur.</th>}
                  <th className="px-3 py-2 bg-muted/50 text-right text-muted-foreground uppercase tracking-wider font-semibold">Stock</th>
                  <th className="px-3 py-2 bg-muted/50 text-right text-muted-foreground uppercase tracking-wider font-semibold">Value (€)</th>
                </tr>
              </thead>
              <tbody>
                {deadStock.map(s => {
                  const pricePerUnit = s.priceData?.effectivePurchasePriceEur ?? s.unit_price;
                  return (
                    <tr key={s.sku}>
                      <td className="px-3 py-1.5 font-mono"><HighlightText text={s.sku} /></td>
                      <td className="px-3 py-1.5"><HighlightText text={s.sku_name} /></td>
                      <td className="px-3 py-1.5">{s.supplier}</td>
                      {hasPricingData && (
                        <td className="px-3 py-1.5 text-center">
                          {s.priceData?.hasPurchasePrice ? <CurrencyBadge currency={s.priceData.purchaseCurrency} /> : '—'}
                        </td>
                      )}
                      <td className="px-3 py-1.5 text-right">{s.stock_qty.toLocaleString()}</td>
                      <td className="px-3 py-1.5 text-right">€{(s.stock_qty * pricePerUnit).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Stock-only: no demand data section */}
      {stockOnlySkus.length > 0 && (
        <div className="bg-card border border-muted-foreground/20 rounded-lg p-5 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <h2 className="font-semibold">No Demand Data</h2>
            <Badge variant="secondary" className="text-xs">{stockOnlySkus.length} SKUs</Badge>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            These SKUs have stock but no sales history — unable to determine if overstock. Consider verifying demand data.
          </p>
          <div className="overflow-auto max-h-[300px]">
            <table className="data-table text-xs">
              <thead>
                <tr>
                  <th className="px-3 py-2 bg-muted/50 text-left text-muted-foreground uppercase tracking-wider font-semibold">SKU</th>
                  <th className="px-3 py-2 bg-muted/50 text-left text-muted-foreground uppercase tracking-wider font-semibold">Name</th>
                  <th className="px-3 py-2 bg-muted/50 text-left text-muted-foreground uppercase tracking-wider font-semibold">Supplier</th>
                  <th className="px-3 py-2 bg-muted/50 text-right text-muted-foreground uppercase tracking-wider font-semibold">Stock</th>
                  <th className="px-3 py-2 bg-muted/50 text-right text-muted-foreground uppercase tracking-wider font-semibold">Value (€)</th>
                </tr>
              </thead>
              <tbody>
                {stockOnlySkus.map(s => {
                  const pricePerUnit = s.priceData?.effectivePurchasePriceEur ?? s.unit_price;
                  return (
                    <tr key={s.sku}>
                      <td className="px-3 py-1.5 font-mono"><HighlightText text={s.sku} /></td>
                      <td className="px-3 py-1.5"><HighlightText text={s.sku_name} /></td>
                      <td className="px-3 py-1.5">{s.supplier}</td>
                      <td className="px-3 py-1.5 text-right">{s.stock_qty.toLocaleString()}</td>
                      <td className="px-3 py-1.5 text-right">€{(s.stock_qty * pricePerUnit).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {sorted.length === 0 ? (
        <div className="bg-card border rounded-lg p-12 text-center text-muted-foreground">
          No overstock items found with current filters.
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
                  {hasPricingData && <th className="px-4 py-3 font-semibold text-muted-foreground uppercase text-xs tracking-wider bg-muted/50 text-center">Cur.</th>}
                  <SortableHeader column="days_of_stock" label="Days of Stock" sort={sort} onSort={toggleSort} align="right" />
                  <SortableHeader column="excess_qty" label="Excess Qty" sort={sort} onSort={toggleSort} align="right" />
                  <SortableHeader column="tied_up_capital" label="Tied-up Capital (€)" sort={sort} onSort={toggleSort} align="right" />
                  {hasPricingData && <SortableHeader column="marginPct" label="Margin %" sort={sort} onSort={toggleSort} align="right" />}
                  {showHolding && <SortableHeader column="holdingCost" label="Annual Holding €" sort={sort} onSort={toggleSort} align="right" />}
                  {showStorage && <SortableHeader column="storageCost" label="Storage €/mo" sort={sort} onSort={toggleSort} align="right" />}
                  {showShelfLife && <SortableHeader column="shelfLifeRisk" label="Shelf Life Risk" sort={sort} onSort={toggleSort} />}
                </tr>
              </thead>
              <tbody>
                {paginatedData.map(s => (
                  <tr key={s.sku}>
                    <td className="font-mono font-medium"><HighlightText text={s.sku} /></td>
                    <td><HighlightText text={s.sku_name} /></td>
                    <td><HighlightText text={s.supplier} /></td>
                    {hasPricingData && (
                      <td className="text-center">
                        {s.priceData?.hasPurchasePrice ? <CurrencyBadge currency={s.priceData.purchaseCurrency} /> : '—'}
                      </td>
                    )}
                    <td className="text-right">
                      {s.days_of_stock === Infinity ? '∞' : Math.round(s.days_of_stock).toLocaleString()}
                    </td>
                    <td className="text-right">{s.excess_qty.toLocaleString()}</td>
                    <td className="text-right font-semibold">
                      €{s.tied_up_capital.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    {hasPricingData && (
                      <td className="text-right">
                        {s.priceData?.marginPct !== null && s.priceData?.marginPct !== undefined ? (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className={s.priceData.marginPct < 0 ? 'text-destructive font-semibold' : s.priceData.marginPct < 15 ? 'text-warning-foreground' : ''}>
                                  {s.priceData.marginPct.toFixed(1)}%
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="text-xs">€{s.priceData.marginEur?.toFixed(2) ?? '—'}/unit margin</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                    )}
                    {showHolding && (
                      <td className="text-right text-sm">€{s.holdingCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    )}
                    {showStorage && (
                      <td className="text-right text-sm">€{s.storageCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    )}
                    {showShelfLife && (
                      <td>
                        {s.shelfLifeRisk === 'critical' ? (
                          <Badge variant="destructive" className="text-[10px]">Critical — {s.shelfLifeDays}d</Badge>
                        ) : s.shelfLifeRisk === 'warning' ? (
                          <Badge variant="secondary" className="text-[10px] bg-warning/15 text-warning-foreground border-warning/30">Warning — {s.shelfLifeDays}d</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">OK</span>
                        )}
                      </td>
                    )}
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
