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
import { HelpCircle, CheckCircle2, AlertTriangle, Calendar } from "lucide-react";
import { detectDateFormat, getDateFormatLabel } from "@/lib/dateUtils";
import { useLanguage } from "@/lib/i18n";

export interface ColumnMapping {
  [targetField: string]: string;
}

interface ColumnMapperProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceColumns: string[];
  rawData?: Record<string, string>[];
  onConfirm: (mapping: ColumnMapping) => void;
}

interface FieldDef {
  key: string;
  labelKey: string;
  required: boolean;
  tipKey: string;
}

const TARGET_FIELDS: FieldDef[] = [
  { key: "sku", labelKey: "mapper.field.sku", required: true, tipKey: "mapper.tip.sku" },
  { key: "sku_name", labelKey: "mapper.field.skuName", required: false, tipKey: "mapper.tip.skuName" },
  { key: "supplier", labelKey: "mapper.field.supplier", required: false, tipKey: "mapper.tip.supplier" },
  { key: "category", labelKey: "mapper.field.category", required: false, tipKey: "mapper.tip.category" },
  { key: "date", labelKey: "mapper.field.date", required: true, tipKey: "mapper.tip.date" },
  { key: "partner_id", labelKey: "mapper.field.partnerId", required: false, tipKey: "mapper.tip.partnerId" },
  { key: "sold_qty", labelKey: "mapper.field.soldQty", required: false, tipKey: "mapper.tip.soldQty" },
  { key: "unit_price", labelKey: "mapper.field.unitPrice", required: false, tipKey: "mapper.tip.unitPrice" },
  { key: "stock_qty", labelKey: "mapper.field.stockQty", required: false, tipKey: "mapper.tip.stockQty" },
  { key: "lead_time_days", labelKey: "mapper.field.leadTime", required: false, tipKey: "mapper.tip.leadTime" },
  { key: "ordered_qty", labelKey: "mapper.field.orderedQty", required: false, tipKey: "mapper.tip.orderedQty" },
  { key: "expected_delivery_date", labelKey: "mapper.field.expectedDelivery", required: false, tipKey: "mapper.tip.expectedDelivery" },
  { key: "selling_price_huf", labelKey: "mapper.field.sellingPriceHuf", required: false, tipKey: "mapper.tip.sellingPriceHuf" },
  { key: "purchase_currency", labelKey: "mapper.field.purchaseCurrency", required: false, tipKey: "mapper.tip.purchaseCurrency" },
  { key: "purchase_price_1", labelKey: "mapper.field.purchasePrice", required: false, tipKey: "mapper.tip.purchasePrice1" },
  { key: "purchase_qty_1", labelKey: "mapper.field.purchaseQty", required: false, tipKey: "mapper.tip.purchaseQty1" },
  ...([2,3,4,5,6,7].flatMap(n => [
    { key: `purchase_price_${n}`, labelKey: "mapper.field.purchasePrice", required: false, tipKey: "mapper.tip.purchasePriceN" },
    { key: `purchase_qty_${n}`, labelKey: "mapper.field.purchaseQty", required: false, tipKey: "mapper.tip.purchaseQtyN" },
  ])),
  { key: "purchase_price_8", labelKey: "mapper.field.purchasePrice", required: false, tipKey: "mapper.tip.purchasePrice8" },
  { key: "purchase_qty_8", labelKey: "mapper.field.purchaseQty", required: false, tipKey: "mapper.tip.purchaseQtyN" },
];

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
  selling_price_huf: ["sellingpricehuf", "hufprice", "eladar", "arhuf", "sellingprice", "salepricehuf"],
  purchase_currency: ["purchasecurrency", "currency", "ccy", "curr", "deviza"],
  purchase_price_1: ["purchaseprice1", "purchaseprice", "buyprice", "cost", "supplierprice", "beszerzesiar"],
  purchase_qty_1: ["purchaseqty1", "moq", "minqty", "minimumqty"],
  purchase_price_2: ["purchaseprice2", "pricebreak2"],
  purchase_qty_2: ["purchaseqty2", "qtybreak2"],
  purchase_price_3: ["purchaseprice3", "pricebreak3"],
  purchase_qty_3: ["purchaseqty3", "qtybreak3"],
  purchase_price_4: ["purchaseprice4", "pricebreak4"],
  purchase_qty_4: ["purchaseqty4", "qtybreak4"],
  purchase_price_5: ["purchaseprice5", "pricebreak5"],
  purchase_qty_5: ["purchaseqty5", "qtybreak5"],
  purchase_price_6: ["purchaseprice6", "pricebreak6"],
  purchase_qty_6: ["purchaseqty6", "qtybreak6"],
  purchase_price_7: ["purchaseprice7", "pricebreak7"],
  purchase_qty_7: ["purchaseqty7", "qtybreak7"],
  purchase_price_8: ["purchaseprice8", "pricebreak8"],
  purchase_qty_8: ["purchaseqty8", "qtybreak8"],
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

export function ColumnMapper({ open, onOpenChange, sourceColumns, rawData, onConfirm }: ColumnMapperProps) {
  const { t } = useLanguage();
  const [mapping, setMapping] = useState<ColumnMapping>(() => autoMap(sourceColumns));

  const dateFormatInfo = useMemo(() => {
    const dateCol = mapping['date'];
    if (!dateCol || !rawData?.length) return null;
    const samples = rawData.map(r => r[dateCol] || '').filter(Boolean);
    if (samples.length === 0) return null;
    const fmt = detectDateFormat(samples);
    return {
      format: fmt,
      label: getDateFormatLabel(fmt),
      sampleValues: samples.slice(0, 3),
    };
  }, [mapping, rawData]);

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
          <DialogTitle>{t('mapper.title')}</DialogTitle>
          <DialogDescription>
            {t('mapper.description')}
            {' '}{t('mapper.hoverTip')} <HelpCircle className="inline h-3.5 w-3.5" /> {t('mapper.iconForTips')}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 mb-2">
          <Badge variant={unmappedRequired.length === 0 ? "default" : "destructive"} className="text-xs">
            {mappedCount}/{TARGET_FIELDS.length} {t('mapper.mapped')}
          </Badge>
          {unmappedRequired.length > 0 && (
            <span className="text-xs text-destructive flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              {unmappedRequired.map((f) => getFieldLabel(f, t)).join(", ")} {t('mapper.required')}
            </span>
          )}
          {unmappedRequired.length === 0 && (
            <span className="text-xs text-success flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" />
              {t('mapper.allRequiredMapped')}
            </span>
          )}
        </div>

        {dateFormatInfo && (
          <div className="flex items-start gap-2 rounded-md border border-border bg-muted/50 p-3 text-xs">
            <Calendar className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-foreground">
                {t('mapper.dateFormatDetected')} <span className="text-primary">{dateFormatInfo.label}</span>
              </p>
              <p className="text-muted-foreground mt-0.5">
                {t('mapper.samples')} {dateFormatInfo.sampleValues.map((v, i) => (
                  <code key={i} className="mx-0.5 rounded bg-background px-1 py-0.5">{v}</code>
                ))}
              </p>
            </div>
          </div>
        )}

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
                    <SelectValue placeholder={t('mapper.unmapped')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">{t('mapper.unmapped')}</SelectItem>
                    {sourceColumns.map((col) => (
                      <SelectItem
                        key={col}
                        value={col}
                        disabled={usedColumns.has(col) && mapping[field.key] !== col}
                      >
                        {col}
                        {usedColumns.has(col) && mapping[field.key] !== col && ` ${t('mapper.used')}`}
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

        {/* Feature impact preview */}
        <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs space-y-1">
          <p className="font-semibold text-foreground mb-1">{t('mapper.withThisMapping')}</p>
          {mapping['sold_qty'] && mapping['date'] ? (
            <p className="text-primary">✅ {t('mapper.demandAnalysis')} ({t('mapper.demandAnalysisMapped')})</p>
          ) : (
            <p className="text-warning-foreground">⚠️ {t('mapper.demandAnalysisDisabled')}</p>
          )}
          {mapping['unit_price'] ? (
            <p className="text-primary">✅ {t('mapper.abcClassification')} ({t('mapper.abcMapped')})</p>
          ) : (
            <p className="text-warning-foreground">⚠️ {t('mapper.abcDisabled')}</p>
          )}
          {mapping['lead_time_days'] ? (
            <p className="text-primary">✅ {t('mapper.reorderPointCalc')} ({t('mapper.reorderMapped')})</p>
          ) : (
            <p className="text-warning-foreground">⚠️ {t('mapper.reorderDisabled')}</p>
          )}
          {mapping['stock_qty'] ? (
            <p className="text-primary">✅ {t('mapper.stockAnalysis')} ({t('mapper.stockMapped')})</p>
          ) : (
            <p className="text-warning-foreground">⚠️ {t('mapper.stockDisabled')}</p>
          )}
          <p className="text-muted-foreground mt-1">ℹ️ {t('mapper.addMissingLater')}</p>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={() => onConfirm(mapping)}
            disabled={unmappedRequired.length > 0}
          >
            {t('mapper.applyMapping')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
