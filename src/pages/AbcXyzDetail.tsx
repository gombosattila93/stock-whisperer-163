import { useState, useMemo, useCallback } from "react";
import { useInventory } from "@/context/InventoryContext";
import { EmptyState } from "@/components/EmptyState";
import { ExportButton } from "@/components/ExportButton";
import { SortableHeader, useSortableTable } from "@/components/SortableHeader";
import { TablePagination, usePagination } from "@/components/TablePagination";
import { HighlightText } from "@/components/HighlightText";
import { DemandSparkline } from "@/components/DemandSparkline";
import { SupplierOptionsEditor } from "@/components/SupplierOptionsEditor";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AbcClass, XyzClass } from "@/lib/types";
import { ChevronDown, ChevronRight } from "lucide-react";

export default function AbcXyzDetail() {
  const { filtered, hasData, costSettings, suppliers, skuSupplierOptions, setSkuSupplierOptions } = useInventory();
  const [abcFilter, setAbcFilter] = useState<string>("");
  const [xyzFilter, setXyzFilter] = useState<string>("");
  const [expandedSkus, setExpandedSkus] = useState<Set<string>>(new Set());

  const toggleExpand = useCallback((sku: string) => {
    setExpandedSkus(prev => {
      const next = new Set(prev);
      if (next.has(sku)) next.delete(sku);
      else next.add(sku);
      return next;
    });
  }, []);

  const data = useMemo(() =>
    filtered.filter(s => {
      if (abcFilter && s.abc_class !== abcFilter) return false;
      if (xyzFilter && s.xyz_class !== xyzFilter) return false;
      return true;
    }),
    [filtered, abcFilter, xyzFilter]
  );

  const { sorted, sort, toggleSort } = useSortableTable(data);
  const { paginatedData, currentPage, pageSize, setCurrentPage, setPageSize, totalItems } = usePagination(sorted);

  if (!hasData) return <EmptyState />;

  const exportData = sorted.map(s => ({
    sku: s.sku, name: s.sku_name, supplier: s.supplier, category: s.category,
    abc_class: s.abc_class, xyz_class: s.xyz_class,
    total_revenue: s.total_revenue.toFixed(2), cv: s.cv.toFixed(3),
    avg_daily_demand: s.avg_daily_demand.toFixed(2),
    stock_qty: s.stock_qty, days_of_stock: Math.round(s.days_of_stock),
  }));

  // Count total columns for colSpan
  let colCount = 12; // base columns
  if (costSettings.holdingCostEnabled) colCount++;
  if (costSettings.obsolescenceCostEnabled) colCount++;

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
          <Select value={abcFilter} onValueChange={(v) => { setAbcFilter(v === "all" ? "" : v); setCurrentPage(1); }}>
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
          <Select value={xyzFilter} onValueChange={(v) => { setXyzFilter(v === "all" ? "" : v); setCurrentPage(1); }}>
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
        <span className="text-xs text-muted-foreground ml-auto">{totalItems} SKUs</span>
      </div>

      <div className="bg-card border rounded-lg overflow-hidden">
        <div className="overflow-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th className="px-2 py-3 bg-muted/50 w-8"></th>
                <SortableHeader column="sku" label="SKU" sort={sort} onSort={toggleSort} />
                <SortableHeader column="sku_name" label="Name" sort={sort} onSort={toggleSort} />
                <SortableHeader column="supplier" label="Supplier" sort={sort} onSort={toggleSort} />
                <SortableHeader column="category" label="Category" sort={sort} onSort={toggleSort} />
                <SortableHeader column="abc_class" label="ABC" sort={sort} onSort={toggleSort} />
                <SortableHeader column="xyz_class" label="XYZ" sort={sort} onSort={toggleSort} />
                <th className="px-4 py-3 font-semibold text-muted-foreground uppercase text-xs tracking-wider bg-muted/50">Trend</th>
                <SortableHeader column="total_revenue" label="Revenue" sort={sort} onSort={toggleSort} align="right" />
                <SortableHeader column="cv" label="CV" sort={sort} onSort={toggleSort} align="right" />
                <SortableHeader column="avg_daily_demand" label="Avg Daily Demand" sort={sort} onSort={toggleSort} align="right" />
                <SortableHeader column="stock_qty" label="Stock Qty" sort={sort} onSort={toggleSort} align="right" />
                <SortableHeader column="days_of_stock" label="Days of Stock" sort={sort} onSort={toggleSort} align="right" />
                {costSettings.holdingCostEnabled && (
                  <SortableHeader column="tco" label="TCO €/yr" sort={sort} onSort={toggleSort} align="right" />
                )}
                {costSettings.obsolescenceCostEnabled && (
                  <SortableHeader column="obsolescenceCost" label="Obsolescence €" sort={sort} onSort={toggleSort} align="right" />
                )}
              </tr>
            </thead>
            <tbody>
              {paginatedData.map(s => {
                const isExpanded = expandedSkus.has(s.sku);
                const opts = skuSupplierOptions[s.sku] || [];
                return (
                  <>
                    <tr key={s.sku} className="cursor-pointer hover:bg-muted/20" onClick={() => toggleExpand(s.sku)}>
                      <td className="px-2 text-center">
                        {isExpanded ? (
                          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                      </td>
                      <td className="font-mono font-medium"><HighlightText text={s.sku} /></td>
                      <td><HighlightText text={s.sku_name} /></td>
                      <td><HighlightText text={s.supplier} /></td>
                      <td><HighlightText text={s.category} /></td>
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
                      <td><DemandSparkline sku={s} /></td>
                      <td className="text-right">€{s.total_revenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                      <td className="text-right">{s.cv.toFixed(3)}</td>
                      <td className="text-right">{s.avg_daily_demand.toFixed(2)}</td>
                      <td className="text-right">{s.stock_qty.toLocaleString()}</td>
                      <td className="text-right">
                        {s.days_of_stock === Infinity ? '∞' : Math.round(s.days_of_stock).toLocaleString()}
                      </td>
                      {costSettings.holdingCostEnabled && (
                        <td className="text-right">€{s.tco.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                      )}
                      {costSettings.obsolescenceCostEnabled && (
                        <td className="text-right">{s.obsolescenceCost > 0 ? `€${s.obsolescenceCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '—'}</td>
                      )}
                    </tr>
                    {isExpanded && (
                      <tr key={`${s.sku}-expand`}>
                        <td colSpan={colCount} className="px-4 py-3 bg-muted/10">
                          <div className="max-w-2xl">
                            <h4 className="text-xs font-semibold mb-2">Supplier Options for {s.sku}</h4>
                            <SupplierOptionsEditor
                              sku={s.sku}
                              options={opts}
                              onChange={setSkuSupplierOptions}
                              knownSuppliers={suppliers}
                            />
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
        <TablePagination totalItems={totalItems} pageSize={pageSize} currentPage={currentPage} onPageChange={setCurrentPage} onPageSizeChange={setPageSize} />
      </div>
    </div>
  );
}
