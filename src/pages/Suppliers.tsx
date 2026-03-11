import { useMemo, useState } from "react";
import { useInventory } from "@/context/InventoryContext";
import { EmptyState } from "@/components/EmptyState";
import { ExportButton } from "@/components/ExportButton";
import { SortableHeader, useSortableTable } from "@/components/SortableHeader";
import { TablePagination, usePagination } from "@/components/TablePagination";
import { getSuggestedOrderQty } from "@/lib/calculations";
import { ReorderEmailModal } from "@/components/ReorderEmailModal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { HelpTooltip } from "@/components/HelpTooltip";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ChevronDown, ChevronRight, Mail } from "lucide-react";
import { useLanguage } from "@/lib/i18n";

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

interface SupplierRow {
  supplier: string;
  totalSkus: number;
  criticalSkus: number;
  reorderSkus: number;
  tiedUpCapital: number;
  suggestedOrderValueEur: number;
  suggestedOrderValueUsd: number;
  avgLeadTime: number;
  overdueCount: number;
  avgMarginPct: number | null;
}

export default function Suppliers() {
  const { filtered, hasData } = useInventory();
  const { t } = useLanguage();
  const [expandedSupplier, setExpandedSupplier] = useState<string | null>(null);
  const [emailSupplier, setEmailSupplier] = useState<string | null>(null);

  const hasPricingData = filtered.some(s => s.priceData?.hasMarginData);

  const supplierData = useMemo(() => {
    const map = new Map<string, SupplierRow & { _marginSum: number; _marginCount: number }>();
    for (const s of filtered) {
      const existing = map.get(s.supplier);
      const isCritical = s.days_of_stock !== null && s.days_of_stock < s.lead_time_days && s.avg_daily_demand > 0;
      const needsReorder = s.reorder_point !== null && s.effective_stock <= s.reorder_point && s.avg_daily_demand > 0;
      const excessQty = s.days_of_stock !== null && s.days_of_stock > 180 && s.avg_daily_demand > 0
        ? s.effective_stock - s.avg_daily_demand * 180
        : 0;
      const pricePerUnit = s.priceData?.effectivePurchasePriceEur ?? s.unit_price;
      const tiedUp = excessQty > 0 ? excessQty * pricePerUnit : 0;
      const orderQty = needsReorder ? getSuggestedOrderQty(s.reorder_point ?? 0, s.effective_stock) : 0;
      const orderEur = orderQty * (s.priceData?.effectivePurchasePriceEur ?? s.unit_price);
      const orderUsd = s.priceData?.purchaseCurrency === 'USD' ? orderQty * (s.priceData?.effectivePurchasePriceEur ?? s.unit_price) : 0;
      const margin = s.priceData?.marginPct;

      if (existing) {
        existing.totalSkus += 1;
        existing.criticalSkus += isCritical ? 1 : 0;
        existing.reorderSkus += needsReorder ? 1 : 0;
        existing.tiedUpCapital += tiedUp;
        existing.suggestedOrderValueEur += orderEur;
        existing.suggestedOrderValueUsd += orderUsd;
        existing.avgLeadTime += s.lead_time_days;
        existing.overdueCount += s.overdueDelivery ? 1 : 0;
        if (margin !== null && margin !== undefined) {
          existing._marginSum += margin;
          existing._marginCount += 1;
        }
      } else {
        map.set(s.supplier, {
          supplier: s.supplier,
          totalSkus: 1,
          criticalSkus: isCritical ? 1 : 0,
          reorderSkus: needsReorder ? 1 : 0,
          tiedUpCapital: tiedUp,
          suggestedOrderValueEur: orderEur,
          suggestedOrderValueUsd: orderUsd,
          avgLeadTime: s.lead_time_days,
          overdueCount: s.overdueDelivery ? 1 : 0,
          avgMarginPct: null,
          _marginSum: margin ?? 0,
          _marginCount: margin !== null && margin !== undefined ? 1 : 0,
        });
      }
    }
    const result: SupplierRow[] = [];
    for (const row of map.values()) {
      row.avgLeadTime = Math.round(row.avgLeadTime / row.totalSkus);
      row.avgMarginPct = row._marginCount > 0 ? row._marginSum / row._marginCount : null;
      result.push(row);
    }
    return result;
  }, [filtered]);

  const { sorted, sort, toggleSort } = useSortableTable(supplierData);
  const { paginatedData, currentPage, pageSize, setCurrentPage, setPageSize, totalItems } = usePagination(sorted);

  const expandedSkus = useMemo(() => {
    if (!expandedSupplier) return [];
    return filtered
      .filter(s => s.supplier === expandedSupplier && s.reorder_point !== null && s.effective_stock <= s.reorder_point && s.avg_daily_demand > 0)
      .map(s => {
        const orderQty = getSuggestedOrderQty(s.reorder_point ?? 0, s.effective_stock);
        const effPrice = s.priceData?.effectivePurchasePriceEur ?? s.unit_price;
        return {
          sku: s.sku,
          sku_name: s.sku_name,
          category: s.category,
          stock_qty: s.stock_qty,
          ordered_qty: s.ordered_qty,
          days_of_stock: s.days_of_stock,
          unit_price: s.unit_price,
          suggested_order_qty: orderQty,
          order_value: orderQty * effPrice,
          overdueDelivery: s.overdueDelivery,
          expected_delivery_date: s.expected_delivery_date,
          purchaseCurrency: s.priceData?.purchaseCurrency ?? 'EUR' as const,
          marginPct: s.priceData?.marginPct ?? null,
          marginEur: s.priceData?.marginEur ?? null,
          hasPriceData: s.priceData?.hasPurchasePrice ?? false,
        };
      });
  }, [expandedSupplier, filtered]);

  const emailSkus = useMemo(() => {
    if (!emailSupplier) return [];
    return filtered
      .filter(s => s.supplier === emailSupplier && s.reorder_point !== null && s.effective_stock <= s.reorder_point && s.avg_daily_demand > 0)
      .map(s => ({
        sku: s.sku,
        sku_name: s.sku_name,
        suggested_order_qty: getSuggestedOrderQty(s.reorder_point ?? 0, s.effective_stock),
        unit_price: s.unit_price,
      }));
  }, [emailSupplier, filtered]);

  if (!hasData) return <EmptyState />;

  const exportData = sorted.map(s => ({
    supplier: s.supplier,
    total_skus: s.totalSkus,
    critical_skus: s.criticalSkus,
    skus_to_reorder: s.reorderSkus,
    tied_up_capital_eur: s.tiedUpCapital.toFixed(2),
    suggested_order_value_eur: s.suggestedOrderValueEur.toFixed(2),
    avg_lead_time_days: s.avgLeadTime,
    overdue_deliveries: s.overdueCount,
    ...(hasPricingData ? { avg_margin_pct: s.avgMarginPct?.toFixed(1) ?? '' } : {}),
  }));

  const colSpan = 9 + (hasPricingData ? 1 : 0);

  return (
    <div>
      <div className="page-header flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="page-title">Supplier Summary</h1>
            <HelpTooltip
              text="Aggregated view of inventory and purchasing metrics per supplier."
              tip="Click a row to expand the detailed SKU list. Use this to prepare supplier-specific POs and compare lead times across vendors."
            />
          </div>
          <p className="page-subtitle">Aggregated metrics per supplier — click a row to see its reorder list</p>
        </div>
        <ExportButton data={exportData} filename="supplier-summary.csv" />
      </div>

      {sorted.length === 0 ? (
        <div className="bg-card border rounded-lg p-12 text-center text-muted-foreground">
          No suppliers found with current filters.
        </div>
      ) : (
        <div className="bg-card border rounded-lg overflow-hidden">
          <div className="overflow-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="px-4 py-3 w-8 bg-muted/50"></th>
                  <SortableHeader column="supplier" label="Supplier" sort={sort} onSort={toggleSort} />
                  <SortableHeader column="totalSkus" label="Total SKUs" sort={sort} onSort={toggleSort} align="right" />
                  <SortableHeader column="criticalSkus" label="Critical SKUs" sort={sort} onSort={toggleSort} align="right" tooltip="SKUs where days of stock < lead time. Higher count = more urgency from this supplier." />
                  <SortableHeader column="reorderSkus" label="To Reorder" sort={sort} onSort={toggleSort} align="right" tooltip="SKUs where effective stock ≤ reorder point. These need purchase orders." />
                  <SortableHeader column="overdueCount" label="Overdue" sort={sort} onSort={toggleSort} align="right" tooltip="Open orders past their expected delivery date. Flag for supplier performance review." />
                  <SortableHeader column="tiedUpCapital" label="Tied-Up Capital (€)" sort={sort} onSort={toggleSort} align="right" tooltip="Capital locked in overstock (>180 days) from this supplier. Target for reduction." />
                  <SortableHeader column="suggestedOrderValueEur" label="Suggested Order (€)" sort={sort} onSort={toggleSort} align="right" tooltip="Total EUR value of all pending reorder suggestions for this supplier." />
                  {hasPricingData && <SortableHeader column="avgMarginPct" label="Avg Margin" sort={sort} onSort={toggleSort} align="right" tooltip="Revenue-weighted average margin across all SKUs from this supplier." />}
                  <SortableHeader column="avgLeadTime" label="Avg Lead Time" sort={sort} onSort={toggleSort} align="right" tooltip="Average delivery lead time across all SKUs. Compare across suppliers for same category." />
                </tr>
              </thead>
              <tbody>
                {paginatedData.map(row => (
                  <>
                    <tr
                      key={row.supplier}
                      className="cursor-pointer"
                      onClick={() => setExpandedSupplier(expandedSupplier === row.supplier ? null : row.supplier)}
                    >
                      <td className="text-center">
                        {expandedSupplier === row.supplier
                          ? <ChevronDown className="h-4 w-4 text-muted-foreground inline" />
                          : <ChevronRight className="h-4 w-4 text-muted-foreground inline" />}
                      </td>
                      <td className="font-medium">{row.supplier}</td>
                      <td className="text-right">{row.totalSkus}</td>
                      <td className="text-right">
                        {row.criticalSkus > 0 ? (
                          <span className="text-destructive font-semibold">{row.criticalSkus}</span>
                        ) : '0'}
                      </td>
                      <td className="text-right">
                        {row.reorderSkus > 0 ? (
                          <span className="text-warning-foreground font-semibold">{row.reorderSkus}</span>
                        ) : '0'}
                      </td>
                      <td className="text-right">
                        {row.overdueCount > 0 ? (
                          <Badge variant="outline" className="text-[10px] border-warning/50 bg-warning/10 text-warning-foreground">
                            {row.overdueCount}
                          </Badge>
                        ) : '0'}
                      </td>
                      <td className="text-right">€{row.tiedUpCapital.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td className="text-right font-semibold">€{row.suggestedOrderValueEur.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      {hasPricingData && (
                        <td className="text-right">
                          {row.avgMarginPct !== null ? (
                            <span className={row.avgMarginPct < 0 ? 'text-destructive font-semibold' : row.avgMarginPct < 15 ? 'text-warning-foreground' : ''}>
                              {row.avgMarginPct.toFixed(1)}%
                            </span>
                          ) : <span className="text-muted-foreground">—</span>}
                        </td>
                      )}
                      <td className="text-right">{row.avgLeadTime}d</td>
                    </tr>
                    {expandedSupplier === row.supplier && expandedSkus.length > 0 && (
                      <tr key={`${row.supplier}-detail`}>
                        <td colSpan={colSpan} className="p-0">
                          <div className="bg-muted/30 px-8 py-3">
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                Reorder List — {row.supplier}
                              </p>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs gap-1.5"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEmailSupplier(row.supplier);
                                }}
                              >
                                <Mail className="h-3.5 w-3.5" />
                                Draft Email
                              </Button>
                            </div>
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-muted-foreground">
                                  <th className="text-left py-1.5 px-2">SKU</th>
                                  <th className="text-left py-1.5 px-2">Name</th>
                                  <th className="text-left py-1.5 px-2">Category</th>
                                  {hasPricingData && <th className="text-center py-1.5 px-2">Cur.</th>}
                                  <th className="text-right py-1.5 px-2">Stock</th>
                                  <th className="text-right py-1.5 px-2">Ordered</th>
                                  <th className="text-right py-1.5 px-2">Days of Stock</th>
                                  <th className="text-right py-1.5 px-2">Order Qty</th>
                                  <th className="text-right py-1.5 px-2">Order Value (€)</th>
                                  {hasPricingData && <th className="text-right py-1.5 px-2">Margin</th>}
                                  <th className="text-left py-1.5 px-2">Status</th>
                                </tr>
                              </thead>
                              <tbody>
                                {expandedSkus.map(s => (
                                  <tr key={s.sku} className="border-t border-border/50">
                                    <td className="py-1.5 px-2 font-mono">{s.sku}</td>
                                    <td className="py-1.5 px-2">{s.sku_name}</td>
                                    <td className="py-1.5 px-2">{s.category}</td>
                                    {hasPricingData && (
                                      <td className="py-1.5 px-2 text-center">
                                        {s.hasPriceData ? <CurrencyBadge currency={s.purchaseCurrency} /> : '—'}
                                      </td>
                                    )}
                                    <td className="py-1.5 px-2 text-right">{s.stock_qty.toLocaleString()}</td>
                                    <td className="py-1.5 px-2 text-right">{s.ordered_qty.toLocaleString()}</td>
                                    <td className="py-1.5 px-2 text-right">{s.days_of_stock === null ? '—' : s.days_of_stock === Infinity ? '∞' : Math.round(s.days_of_stock)}</td>
                                    <td className="py-1.5 px-2 text-right font-semibold">{s.suggested_order_qty.toLocaleString()}</td>
                                    <td className="py-1.5 px-2 text-right">€{s.order_value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                    {hasPricingData && (
                                      <td className="py-1.5 px-2 text-right">
                                        {s.marginPct !== null ? (
                                          <TooltipProvider>
                                            <Tooltip>
                                              <TooltipTrigger asChild>
                                                <span className={s.marginPct < 0 ? 'text-destructive font-semibold' : s.marginPct < 15 ? 'text-warning-foreground' : ''}>
                                                  {s.marginPct.toFixed(1)}%
                                                </span>
                                              </TooltipTrigger>
                                              <TooltipContent>
                                                <p className="text-xs">€{s.marginEur?.toFixed(2) ?? '—'}/unit</p>
                                              </TooltipContent>
                                            </Tooltip>
                                          </TooltipProvider>
                                        ) : <span className="text-muted-foreground">—</span>}
                                      </td>
                                    )}
                                    <td className="py-1.5 px-2">
                                      {s.overdueDelivery && (
                                        <Badge variant="outline" className="text-[9px] border-warning/50 bg-warning/10 text-warning-foreground">
                                          Overdue delivery
                                        </Badge>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                    {expandedSupplier === row.supplier && expandedSkus.length === 0 && (
                      <tr key={`${row.supplier}-empty`}>
                        <td colSpan={colSpan} className="p-0">
                          <div className="bg-muted/30 px-8 py-4 text-xs text-muted-foreground">
                            No SKUs need reordering for this supplier.
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
          <TablePagination totalItems={totalItems} pageSize={pageSize} currentPage={currentPage} onPageChange={setCurrentPage} onPageSizeChange={setPageSize} />
        </div>
      )}

      {emailSupplier && (
        <ReorderEmailModal
          open={!!emailSupplier}
          onOpenChange={(open) => { if (!open) setEmailSupplier(null); }}
          supplier={emailSupplier}
          skus={emailSkus}
        />
      )}
    </div>
  );
}
