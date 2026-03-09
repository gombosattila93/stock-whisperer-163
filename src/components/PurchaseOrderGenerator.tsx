import { useState, useMemo, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Printer, Download, FileText, Building2, Package } from "lucide-react";
import { exportToCsv } from "@/lib/csvUtils";
import { format } from "date-fns";

interface POItem {
  sku: string;
  sku_name: string;
  supplier: string;
  suggested_order_qty: number;
  unit_price: number;
  lead_time_days: number;
  urgency: string;
  purchaseCurrency?: string;
  purchasePriceOriginal?: number;
}

interface PurchaseOrderGeneratorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: POItem[];
  companyName?: string;
}

interface SupplierGroup {
  supplier: string;
  items: POItem[];
  totalQty: number;
  totalValueEur: number;
  maxLeadTime: number;
}

// Session-scoped monotonic counter for PO numbers (survives re-renders, resets per session)
let _poCounter = 0;

export function PurchaseOrderGenerator({ open, onOpenChange, items, companyName = "InventoryPro" }: PurchaseOrderGeneratorProps) {
  const [buyerName, setBuyerName] = useState("");
  const [notes, setNotes] = useState("");
  const printRef = useRef<HTMLDivElement>(null);

  const poNumber = useMemo(() => {
    const d = new Date();
    // Collision-safe: timestamp (ms precision) + session monotonic counter
    _poCounter++;
    const ts = d.getTime().toString(36).toUpperCase().slice(-4);
    const seq = String(_poCounter).padStart(3, '0');
    return `PO-${format(d, 'yyyyMMdd')}-${ts}${seq}`;
  }, [open]); // regenerate when opened

  const supplierGroups = useMemo(() => {
    const map = new Map<string, POItem[]>();
    for (const item of items) {
      const existing = map.get(item.supplier) || [];
      existing.push(item);
      map.set(item.supplier, existing);
    }
    return Array.from(map.entries()).map(([supplier, groupItems]) => ({
      supplier,
      items: groupItems,
      totalQty: groupItems.reduce((s, i) => s + i.suggested_order_qty, 0),
      totalValueEur: groupItems.reduce((s, i) => s + i.suggested_order_qty * i.unit_price, 0),
      maxLeadTime: Math.max(...groupItems.map(i => i.lead_time_days)),
    } as SupplierGroup));
  }, [items]);

  const grandTotal = useMemo(() => ({
    qty: supplierGroups.reduce((s, g) => s + g.totalQty, 0),
    value: supplierGroups.reduce((s, g) => s + g.totalValueEur, 0),
    items: items.length,
    suppliers: supplierGroups.length,
  }), [supplierGroups, items]);

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>${poNumber}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1a1a1a; padding: 40px; font-size: 12px; }
          .po-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 2px solid #333; }
          .po-title { font-size: 24px; font-weight: 700; color: #1a1a1a; }
          .po-number { font-size: 14px; color: #666; margin-top: 4px; }
          .po-meta { text-align: right; font-size: 11px; color: #666; line-height: 1.6; }
          .supplier-section { margin-bottom: 30px; page-break-inside: avoid; }
          .supplier-name { font-size: 16px; font-weight: 600; margin-bottom: 8px; padding: 8px 12px; background: #f5f5f5; border-left: 4px solid #2563eb; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
          th { background: #f9fafb; font-weight: 600; text-transform: uppercase; font-size: 10px; letter-spacing: 0.5px; padding: 8px 12px; text-align: left; border-bottom: 2px solid #e5e7eb; }
          th.right { text-align: right; }
          td { padding: 8px 12px; border-bottom: 1px solid #f0f0f0; font-size: 11px; }
          td.right { text-align: right; }
          td.mono { font-family: 'SF Mono', 'Cascadia Code', monospace; font-weight: 500; }
          .supplier-total { background: #f9fafb; font-weight: 600; }
          .grand-total { margin-top: 20px; padding: 16px; background: #1a1a1a; color: white; display: flex; justify-content: space-between; }
          .grand-total span { font-size: 14px; font-weight: 600; }
          .notes { margin-top: 20px; padding: 12px; border: 1px dashed #ccc; font-size: 11px; color: #666; }
          .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 10px; color: #999; text-align: center; }
          @media print { body { padding: 20px; } .no-print { display: none; } }
        </style>
      </head>
      <body>
        ${content.innerHTML}
      </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  const handleExportCsv = () => {
    const data = items.map(item => ({
      po_number: poNumber,
      date: format(new Date(), 'yyyy-MM-dd'),
      supplier: item.supplier,
      sku: item.sku,
      sku_name: item.sku_name,
      order_qty: item.suggested_order_qty,
      unit_price_eur: item.unit_price.toFixed(2),
      line_total_eur: (item.suggested_order_qty * item.unit_price).toFixed(2),
      lead_time_days: item.lead_time_days,
      urgency: item.urgency,
      est_delivery: format(new Date(Date.now() + item.lead_time_days * 86400000), 'yyyy-MM-dd'),
      buyer: buyerName || '',
      notes: notes || '',
    }));
    exportToCsv(data, `${poNumber}.csv`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Generate Purchase Order
          </DialogTitle>
          <DialogDescription>
            {grandTotal.items} items from {grandTotal.suppliers} supplier{grandTotal.suppliers !== 1 ? 's' : ''} — Total €{grandTotal.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <Label className="text-xs">Buyer Name (optional)</Label>
            <Input
              value={buyerName}
              onChange={e => setBuyerName(e.target.value)}
              placeholder="Your name"
              className="h-8 text-sm mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Notes (optional)</Label>
            <Input
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Special instructions..."
              className="h-8 text-sm mt-1"
            />
          </div>
        </div>

        <div className="flex gap-2 mb-4">
          <Button onClick={handlePrint} className="gap-1.5">
            <Printer className="h-4 w-4" />
            Print / Save PDF
          </Button>
          <Button variant="outline" onClick={handleExportCsv} className="gap-1.5">
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        </div>

        <Separator />

        {/* Printable content */}
        <div ref={printRef} className="mt-4">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, paddingBottom: 16, borderBottom: '2px solid currentColor' }}>
            <div>
              <div style={{ fontSize: 24, fontWeight: 700 }}>PURCHASE ORDER</div>
              <div style={{ fontSize: 13, color: '#666', marginTop: 4 }}>{poNumber}</div>
            </div>
            <div style={{ textAlign: 'right', fontSize: 11, color: '#666', lineHeight: 1.8 }}>
              <div><strong>Date:</strong> {format(new Date(), 'MMMM d, yyyy')}</div>
              {buyerName && <div><strong>Buyer:</strong> {buyerName}</div>}
              <div><strong>Company:</strong> {companyName}</div>
              <div><strong>Items:</strong> {grandTotal.items} | <strong>Suppliers:</strong> {grandTotal.suppliers}</div>
            </div>
          </div>

          {supplierGroups.map(group => (
            <div key={group.supplier} style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, padding: '8px 12px', background: 'hsl(var(--muted))', borderLeft: '4px solid hsl(var(--primary))' }} className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-primary" />
                {group.supplier}
                <Badge variant="secondary" className="ml-2 text-[10px]">{group.items.length} items</Badge>
              </div>

              <table className="data-table" style={{ marginBottom: 8 }}>
                <thead>
                  <tr>
                    <th className="px-3 py-2 font-semibold text-muted-foreground uppercase text-xs tracking-wider bg-muted/50 text-left">SKU</th>
                    <th className="px-3 py-2 font-semibold text-muted-foreground uppercase text-xs tracking-wider bg-muted/50 text-left">Description</th>
                    <th className="px-3 py-2 font-semibold text-muted-foreground uppercase text-xs tracking-wider bg-muted/50 text-right">Qty</th>
                    <th className="px-3 py-2 font-semibold text-muted-foreground uppercase text-xs tracking-wider bg-muted/50 text-right">Unit Price</th>
                    <th className="px-3 py-2 font-semibold text-muted-foreground uppercase text-xs tracking-wider bg-muted/50 text-right">Line Total</th>
                    <th className="px-3 py-2 font-semibold text-muted-foreground uppercase text-xs tracking-wider bg-muted/50 text-right">Lead Time</th>
                    <th className="px-3 py-2 font-semibold text-muted-foreground uppercase text-xs tracking-wider bg-muted/50">Urgency</th>
                  </tr>
                </thead>
                <tbody>
                  {group.items.map(item => (
                    <tr key={item.sku}>
                      <td className="font-mono text-sm font-medium">{item.sku}</td>
                      <td className="text-sm">{item.sku_name}</td>
                      <td className="text-right font-semibold">{item.suggested_order_qty.toLocaleString()}</td>
                      <td className="text-right text-sm">€{item.unit_price.toFixed(2)}</td>
                      <td className="text-right font-semibold text-sm">€{(item.suggested_order_qty * item.unit_price).toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                      <td className="text-right text-sm">{item.lead_time_days}d</td>
                      <td>
                        <span className={`inline-block px-2 py-0.5 rounded text-[11px] ${
                          item.urgency === 'Critical' ? 'urgency-critical' :
                          item.urgency === 'Warning' ? 'urgency-warning' : 'urgency-watch'
                        }`}>
                          {item.urgency}
                        </span>
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-border font-semibold bg-muted/30">
                    <td colSpan={2} className="text-sm">Subtotal — {group.supplier}</td>
                    <td className="text-right">{group.totalQty.toLocaleString()}</td>
                    <td></td>
                    <td className="text-right">€{group.totalValueEur.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                    <td className="text-right text-sm">max {group.maxLeadTime}d</td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>
          ))}

          {/* Grand total */}
          <div className="flex justify-between items-center px-4 py-3 bg-foreground text-background rounded-lg mt-2">
            <span className="font-bold text-sm">GRAND TOTAL</span>
            <div className="flex items-center gap-6 text-sm font-semibold">
              <span>{grandTotal.items} items</span>
              <span>{grandTotal.qty.toLocaleString()} units</span>
              <span className="text-lg">€{grandTotal.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
            </div>
          </div>

          {notes && (
            <div className="mt-4 p-3 border border-dashed border-border rounded text-sm text-muted-foreground">
              <strong>Notes:</strong> {notes}
            </div>
          )}

          <div className="mt-6 pt-4 border-t border-border text-center text-[10px] text-muted-foreground">
            Generated by {companyName} • {format(new Date(), 'yyyy-MM-dd HH:mm')} • {poNumber}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
