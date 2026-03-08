import { useInventory } from "@/context/InventoryContext";
import { EmptyState } from "@/components/EmptyState";
import { ExportButton } from "@/components/ExportButton";
import { getUrgency } from "@/lib/calculations";
import { computeReorder, STRATEGY_OPTIONS, ReorderStrategy } from "@/lib/reorderStrategies";
import { SortableHeader, useSortableTable } from "@/components/SortableHeader";
import { TablePagination, usePagination } from "@/components/TablePagination";
import { HighlightText } from "@/components/HighlightText";
import { DemandSparkline } from "@/components/DemandSparkline";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useMemo, useState } from "react";

export default function ReorderList() {
  const { filtered, hasData } = useInventory();
  const [strategy, setStrategy] = useState<ReorderStrategy>('rop');

  const reorder = useMemo(() =>
    filtered
      .filter(s => s.effective_stock <= s.reorder_point && s.avg_daily_demand > 0)
      .map(s => {
        const result = computeReorder(s, strategy);
        return {
          ...s,
          suggested_order_qty: result.suggested_order_qty,
          urgency: getUrgency(s.days_of_stock, s.lead_time_days),
          strategyLabel: result.strategyLabel,
          reorder_trigger: result.reorder_trigger,
        };
      }),
    [filtered, strategy]
  );

  const { sorted, sort, toggleSort } = useSortableTable(reorder);
  const { paginatedData, currentPage, pageSize, setCurrentPage, setPageSize, totalItems } = usePagination(sorted);

  if (!hasData) return <EmptyState />;

  const exportData = sorted.map(s => ({
    sku: s.sku, name: s.sku_name, supplier: s.supplier,
    suggested_order_qty: s.suggested_order_qty, urgency: s.urgency,
    strategy: s.strategyLabel, trigger: s.reorder_trigger,
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

      <div className="filter-bar mb-4">
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground whitespace-nowrap">Reorder Strategy</Label>
          <Select value={strategy} onValueChange={(v) => setStrategy(v as ReorderStrategy)}>
            <SelectTrigger className="w-[220px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STRATEGY_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  <div className="flex flex-col">
                    <span>{opt.label}</span>
                    <span className="text-[10px] text-muted-foreground">{opt.description}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <span className="text-xs text-muted-foreground ml-auto">{totalItems} items need reordering</span>
      </div>

      {sorted.length === 0 ? (
        <div className="bg-card border rounded-lg p-12 text-center text-muted-foreground">
          No items need reordering with current filters.
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
                  <th className="px-4 py-3 font-semibold text-muted-foreground uppercase text-xs tracking-wider bg-muted/50">Trend</th>
                  <SortableHeader column="suggested_order_qty" label="Suggested Order Qty" sort={sort} onSort={toggleSort} align="right" />
                  <th className="px-4 py-3 font-semibold text-muted-foreground uppercase text-xs tracking-wider bg-muted/50">Trigger</th>
                  <SortableHeader column="urgency" label="Urgency" sort={sort} onSort={toggleSort} />
                </tr>
              </thead>
              <tbody>
                {paginatedData.map(s => (
                  <tr key={s.sku}>
                    <td className="font-mono font-medium"><HighlightText text={s.sku} /></td>
                    <td><HighlightText text={s.sku_name} /></td>
                    <td><HighlightText text={s.supplier} /></td>
                    <td><DemandSparkline sku={s} /></td>
                    <td className="text-right font-semibold">{s.suggested_order_qty.toLocaleString()}</td>
                    <td className="text-xs text-muted-foreground max-w-[180px]">{s.reorder_trigger}</td>
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
          <TablePagination totalItems={totalItems} pageSize={pageSize} currentPage={currentPage} onPageChange={setCurrentPage} onPageSizeChange={setPageSize} />
        </div>
      )}
    </div>
  );
}
