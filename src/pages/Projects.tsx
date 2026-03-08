import { useInventory } from "@/context/InventoryContext";
import { EmptyState } from "@/components/EmptyState";
import { ExportButton } from "@/components/ExportButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, CheckCircle, XCircle, Search } from "lucide-react";
import { useState, useMemo, useCallback } from "react";
import { toast } from "sonner";
import type { ProjectReservation } from "@/lib/types";

export default function Projects() {
  const { reservations, addReservation, updateReservation, analysis, hasData } = useInventory();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('active');

  // New reservation form state
  const [projectName, setProjectName] = useState('');
  const [customer, setCustomer] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [items, setItems] = useState<{ sku: string; reservedQty: number }[]>([]);
  const [skuSearch, setSkuSearch] = useState('');

  const skuOptions = useMemo(() => {
    if (!skuSearch.trim()) return [];
    const q = skuSearch.toLowerCase();
    return analysis
      .filter(a => a.sku.toLowerCase().includes(q) || a.sku_name.toLowerCase().includes(q))
      .slice(0, 10);
  }, [analysis, skuSearch]);

  const resetForm = useCallback(() => {
    setProjectName('');
    setCustomer('');
    setDueDate('');
    setItems([]);
    setSkuSearch('');
  }, []);

  const handleCreate = useCallback(() => {
    if (!projectName.trim() || items.length === 0) return;
    // Filter out items with invalid qty or stale SKUs
    const validItems = items.filter(i => i.reservedQty > 0 && analysis.some(a => a.sku === i.sku));
    if (validItems.length === 0) {
      toast.error('No valid line items — ensure SKUs exist and quantities are > 0');
      return;
    }
    // Warn about over-reservation
    const overReserved = validItems.filter(i => {
      const skuData = analysis.find(a => a.sku === i.sku);
      return skuData && (skuData.available_qty - i.reservedQty) < 0;
    });
    if (overReserved.length > 0) {
      toast.warning(`${overReserved.length} SKU(s) will have negative available stock after reservation`);
    }
    const reservation: ProjectReservation = {
      id: crypto.randomUUID(),
      projectName: projectName.trim(),
      projectId: `PRJ-${Date.now().toString(36).toUpperCase()}`,
      customer: customer.trim(),
      dueDate,
      status: 'active',
      items: validItems,
      createdAt: new Date().toISOString(),
    };
    addReservation(reservation);
    resetForm();
    setDialogOpen(false);
  }, [projectName, customer, dueDate, items, addReservation, resetForm, analysis]);

  const addLineItem = useCallback((sku: string) => {
    if (items.some(i => i.sku === sku)) return;
    setItems(prev => [...prev, { sku, reservedQty: 1 }]);
    setSkuSearch('');
  }, [items]);

  const updateLineQty = useCallback((sku: string, qty: number) => {
    setItems(prev => prev.map(i => i.sku === sku ? { ...i, reservedQty: Math.max(1, qty) } : i));
  }, []);

  const removeLineItem = useCallback((sku: string) => {
    setItems(prev => prev.filter(i => i.sku !== sku));
  }, []);

  const filteredReservations = useMemo(() =>
    filterStatus === 'all'
      ? reservations
      : reservations.filter(r => r.status === filterStatus),
    [reservations, filterStatus]
  );

  const exportData = filteredReservations.map(r => ({
    project_id: r.projectId,
    project_name: r.projectName,
    customer: r.customer,
    due_date: r.dueDate,
    status: r.status,
    items: r.items.map(i => `${i.sku}×${i.reservedQty}`).join('; '),
    created_at: r.createdAt,
  }));

  if (!hasData) return <EmptyState />;

  return (
    <div>
      <div className="page-header flex items-center justify-between">
        <div>
          <h1 className="page-title">Project Reservations</h1>
          <p className="page-subtitle">Reserve stock for specific projects or customer orders</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="h-8 w-[130px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="fulfilled">Fulfilled</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
          <ExportButton data={exportData} filename="project-reservations.csv" />
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5">
                <Plus className="h-4 w-4" />
                New Reservation
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Create Project Reservation</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Project Name *</Label>
                    <Input value={projectName} onChange={e => setProjectName(e.target.value)} className="h-8 text-sm" placeholder="e.g. Customer Order #1234" />
                  </div>
                  <div>
                    <Label className="text-xs">Customer</Label>
                    <Input value={customer} onChange={e => setCustomer(e.target.value)} className="h-8 text-sm" placeholder="Customer name" />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Due Date</Label>
                  <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">Add SKUs</Label>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      value={skuSearch}
                      onChange={e => setSkuSearch(e.target.value)}
                      className="h-8 text-sm pl-8"
                      placeholder="Search SKU or name…"
                    />
                  </div>
                  {skuOptions.length > 0 && (
                    <div className="border rounded-md mt-1 max-h-32 overflow-auto">
                      {skuOptions.map(s => (
                        <button
                          key={s.sku}
                          className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted flex items-center justify-between"
                          onClick={() => addLineItem(s.sku)}
                        >
                          <span className="font-mono">{s.sku}</span>
                          <span className="text-muted-foreground truncate ml-2">{s.sku_name} (stock: {s.stock_qty})</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {items.length > 0 && (
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Line Items</Label>
                    {items.map(item => (
                      <div key={item.sku} className="flex items-center gap-2 bg-muted/30 rounded px-3 py-1.5">
                        <span className="text-xs font-mono flex-1">{item.sku}</span>
                        <Input
                          type="number"
                          min={1}
                          value={item.reservedQty}
                          onChange={e => updateLineQty(item.sku, Number(e.target.value) || 1)}
                          className="h-7 w-20 text-xs"
                        />
                        <span className="text-[10px] text-muted-foreground">units</span>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive" onClick={() => removeLineItem(item.sku)}>×</Button>
                      </div>
                    ))}
                  </div>
                )}
                <Button onClick={handleCreate} disabled={!projectName.trim() || items.length === 0} className="w-full">
                  Create Reservation
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {filteredReservations.length === 0 ? (
        <div className="bg-card border rounded-lg p-12 text-center text-muted-foreground">
          No {filterStatus !== 'all' ? filterStatus : ''} reservations found.
        </div>
      ) : (
        <div className="space-y-3">
          {filteredReservations.map(r => (
            <div key={r.id} className="bg-card border rounded-lg p-4">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-sm">{r.projectName}</h3>
                    <Badge variant="outline" className="text-[10px]">{r.projectId}</Badge>
                    <Badge
                      variant={r.status === 'active' ? 'default' : r.status === 'fulfilled' ? 'secondary' : 'destructive'}
                      className="text-[10px]"
                    >
                      {r.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {r.customer && `${r.customer} · `}
                    {r.dueDate && `Due: ${r.dueDate} · `}
                    Created: {new Date(r.createdAt).toLocaleDateString()}
                  </p>
                </div>
                {r.status === 'active' && (
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs gap-1"
                      onClick={() => updateReservation(r.id, 'fulfilled')}
                    >
                      <CheckCircle className="h-3.5 w-3.5" />
                      Fulfill
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs gap-1 text-destructive hover:text-destructive"
                      onClick={() => updateReservation(r.id, 'cancelled')}
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      Cancel
                    </Button>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2">
                {r.items.map(item => {
                  const skuData = analysis.find(a => a.sku === item.sku);
                  return (
                    <div key={item.sku} className="bg-muted/30 rounded px-2.5 py-1.5">
                      <span className="text-[11px] font-mono font-medium">{item.sku}</span>
                      <div className="flex items-center justify-between mt-0.5">
                        <span className="text-xs font-semibold">{item.reservedQty} units</span>
                        {skuData && (
                          <span className={`text-[10px] ${skuData.available_qty < 0 ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
                            avail: {skuData.available_qty}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
