import { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { HelpCircle, CheckCircle2, AlertTriangle } from "lucide-react";

export interface ColumnMapping {
  [targetField: string]: string; // targetField -> sourceColumn
}

interface ColumnMapperProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceColumns: string[];
  onConfirm: (mapping: ColumnMapping) => void;
}

interface FieldDef {
  key: string;
  label: string;
  required: boolean;
  tip: string;
}

const TARGET_FIELDS: FieldDef[] = [
  {
    key: "sku",
    label: "SKU",
    required: true,
    tip: "Unique product identifier. Best practice: use a consistent format (e.g. alphanumeric, no spaces). This is the primary key for grouping sales records.",
  },
  {
    key: "sku_name",
    label: "SKU Name",
    required: false,
    tip: "Human-readable product name. Keep concise (<80 chars). Falls back to SKU code if unmapped.",
  },
  {
    key: "supplier",
    label: "Supplier",
    required: false,
    tip: "Supplier or vendor name. Standardize spelling across rows (e.g. always 'Acme Corp', not 'acme' or 'ACME'). Defaults to 'Unknown'.",
  },
  {
    key: "category",
    label: "Category",
    required: false,
    tip: "Product category for filtering. Use a flat taxonomy (2–3 levels max). Avoid overly granular categories that fragment analysis.",
  },
  {
    key: "date",
    label: "Date",
    required: true,
    tip: "Transaction/sale date. Best practice: ISO 8601 format (YYYY-MM-DD). Consistent date formats prevent parsing errors and ensure correct demand calculations.",
  },
  {
    key: "partner_id",
    label: "Partner ID",
    required: false,
    tip: "Customer or channel identifier. Useful for multi-channel demand analysis. Leave unmapped if single-channel.",
  },
  {
    key: "sold_qty",
    label: "Sold Qty",
    required: false,
    tip: "Units sold in this transaction. Must be numeric (≥0). Negative values (returns) should be separate rows or netted before import.",
  },
  {
    key: "unit_price",
    label: "Unit Price",
    required: false,
    tip: "Selling price per unit. Used for ABC revenue classification. Ensure currency consistency — don't mix USD and EUR in the same dataset.",
  },
  {
    key: "stock_qty",
    label: "Stock Qty",
    required: false,
    tip: "Current on-hand inventory. Should reflect the latest snapshot. If you have multiple rows per SKU, the most recent date's value is used.",
  },
  {
    key: "lead_time_days",
    label: "Lead Time (days)",
    required: false,
    tip: "Supplier lead time in days. Critical for safety stock calculations. Best practice: use average observed lead time, not quoted lead time, for accuracy.",
  },
  {
    key: "ordered_qty",
    label: "Ordered Qty",
    required: false,
    tip: "Quantity already on order (in-transit). Added to stock for 'effective stock'. Set to 0 if no open POs.",
  },
  {
    key: "expected_delivery_date",
    label: "Expected Delivery",
    required: false,
    tip: "When the ordered quantity is expected. ISO 8601 (YYYY-MM-DD). Used for forward-looking stock projections.",
  },
];

/** Common aliases for each target field to improve auto-mapping accuracy */
const FIELD_ALIASES: Record<string, string[]> = {
  sku: ["sku", "productcode", "productid", "itemcode", "itemid", "itemno", "partnumber", "partno", "materialcode", "articleno", "barcode", "upc", "ean"],
  sku_name: ["skuname", "productname", "itemname", "description", "itemdescription", "productdescription", "title", "materialname", "articlename"],
  supplier: ["supplier", "vendor", "vendorname", "suppliername", "manufacturer", "source"],
  category: ["category", "productcategory", "itemcategory", "group", "productgroup", "type", "producttype", "class", "family", "dept", "department"],
  date: ["date", "saledate", "transactiondate", "orderdate", "invoicedate", "salesdate", "txndate", "transdate"],
  partner_id: ["partnerid", "customerid", "clientid", "buyerid", "accountid", "custid", "customer", "client"],
  sold_qty: ["soldqty", "quantitysold", "qtysold", "salesqty", "quantity", "qty", "units", "unitssold"],
  unit_price: ["unitprice", "price", "sellingprice", "saleprice", "listprice", "costprice", "amount"],
  stock_qty: ["stockqty", "currentstock", "onhand", "qtyonhand", "inventoryqty", "stocklevel", "availableqty", "balance"],
  lead_time_days: ["leadtimedays", "leadtime", "deliverytime", "deliveryleadtime", "lt", "replenishmenttime"],
  ordered_qty: ["orderedqty", "qtyordered", "onorder", "qtyonorder", "openorderqty", "poqty", "intransit"],
  expected_delivery_date: ["expecteddeliverydate", "eta", "expecteddate", "deliverydate", "arrivaldate", "duedate", "podate"],
};

function autoMap(sourceColumns: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const lowerSource = sourceColumns.map((c) => c.toLowerCase().replace(/[\s_-]+/g, ""));

  for (const field of TARGET_FIELDS) {
    const aliases = FIELD_ALIASES[field.key] || [field.key.replace(/_/g, "")];
    const idx = lowerSource.findIndex(
      (s) => aliases.some((alias) => s === alias || s.includes(alias) || alias.includes(s))
    );
    if (idx !== -1) {
      mapping[field.key] = sourceColumns[idx];
    }
  }
  return mapping;
}

export function ColumnMapper({ open, onOpenChange, sourceColumns, onConfirm }: ColumnMapperProps) {
  const [mapping, setMapping] = useState<ColumnMapping>(() => autoMap(sourceColumns));

  const unmappedRequired = TARGET_FIELDS.filter((f) => f.required && !mapping[f.key]);
  const mappedCount = Object.values(mapping).filter(Boolean).length;

  const usedColumns = useMemo(() => new Set(Object.values(mapping).filter(Boolean)), [mapping]);

  const handleChange = (field: string, value: string) => {
    setMapping((prev) => {
      const next = { ...prev };
      if (value === "__none__") {
        delete next[field];
      } else {
        next[field] = value;
      }
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Map CSV Columns</DialogTitle>
          <DialogDescription>
            Match your CSV headers to the expected fields. Required fields are marked with *.
            Hover the <HelpCircle className="inline h-3.5 w-3.5" /> icon for best-practice tips.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 mb-2">
          <Badge variant={unmappedRequired.length === 0 ? "default" : "destructive"} className="text-xs">
            {mappedCount}/{TARGET_FIELDS.length} mapped
          </Badge>
          {unmappedRequired.length > 0 && (
            <span className="text-xs text-destructive flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              {unmappedRequired.map((f) => f.label).join(", ")} required
            </span>
          )}
          {unmappedRequired.length === 0 && (
            <span className="text-xs text-success flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" />
              All required fields mapped
            </span>
          )}
        </div>

        <TooltipProvider>
          <div className="space-y-2">
            {TARGET_FIELDS.map((field) => (
              <div key={field.key} className="flex items-center gap-2">
                <div className="w-[160px] flex items-center gap-1 shrink-0">
                  <span className="text-sm font-medium">
                    {field.label}
                    {field.required && <span className="text-destructive ml-0.5">*</span>}
                  </span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help shrink-0" />
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-[280px] text-xs">
                      {field.tip}
                    </TooltipContent>
                  </Tooltip>
                </div>
                <Select
                  value={mapping[field.key] || "__none__"}
                  onValueChange={(v) => handleChange(field.key, v)}
                >
                  <SelectTrigger className="h-8 text-xs flex-1">
                    <SelectValue placeholder="— unmapped —" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— unmapped —</SelectItem>
                    {sourceColumns.map((col) => (
                      <SelectItem
                        key={col}
                        value={col}
                        disabled={usedColumns.has(col) && mapping[field.key] !== col}
                      >
                        {col}
                        {usedColumns.has(col) && mapping[field.key] !== col && " (used)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {mapping[field.key] && (
                  <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
                )}
              </div>
            ))}
          </div>
        </TooltipProvider>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => onConfirm(mapping)}
            disabled={unmappedRequired.length > 0}
          >
            Apply Mapping & Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
