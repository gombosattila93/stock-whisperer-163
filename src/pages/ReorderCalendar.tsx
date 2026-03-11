import { useInventory } from "@/context/InventoryContext";
import { EmptyState } from "@/components/EmptyState";
import { getUrgency } from "@/lib/calculations";
import { computeReorder, ReorderStrategy, DEFAULT_EOQ_SETTINGS } from "@/lib/reorderStrategies";
import { loadSkuOverrides, loadEoqSettings } from "@/lib/persistence";
import { HelpTooltip } from "@/components/HelpTooltip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { useMemo, useState, useEffect, useCallback } from "react";
import { addDays, startOfMonth, endOfMonth, eachDayOfInterval, format, isSameMonth, isToday, getDay, subMonths, addMonths } from "date-fns";
import type { SkuStrategyOverrides } from "@/lib/skuStrategyOverrides";
import type { EoqSettings } from "@/lib/reorderStrategies";
import { useLanguage } from "@/lib/i18n";

interface CalendarOrder {
  sku: string;
  sku_name: string;
  supplier: string;
  orderDate: Date;
  deliveryDate: Date;
  suggested_order_qty: number;
  urgency: string;
  lead_time_days: number;
}

export default function ReorderCalendar() {
  const { filtered, hasData, skuSupplierOptions, costSettings } = useInventory();
  const { t } = useLanguage();
  const [currentMonth, setCurrentMonth] = useState(startOfMonth(new Date()));
  const [skuOverrides, setSkuOverrides] = useState<SkuStrategyOverrides>({});
  const [eoqSettings, setEoqSettings] = useState<EoqSettings>(DEFAULT_EOQ_SETTINGS);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  useEffect(() => {
    loadSkuOverrides().then(setSkuOverrides);
    loadEoqSettings().then(setEoqSettings);
  }, []);

  const calendarOrders = useMemo(() => {
    const calculable = filtered.filter(s =>
      s.reorder_point !== null && s.capability.hasStockData && s.capability.hasLeadTime && s.capability.hasDemandHistory
    );
    const needsReorder = calculable.filter(s => s.effective_stock <= s.reorder_point! && s.avg_daily_demand > 0);

    return needsReorder.map(s => {
      const strategy = (skuOverrides[s.sku] || 'rop') as ReorderStrategy;
      const result = computeReorder(s, strategy, eoqSettings);
      const urgency = getUrgency(s.days_of_stock, s.lead_time_days);

      // Calculate when order needs to be placed
      // If days_of_stock < lead_time → order TODAY
      // Otherwise: order by (today + days_of_stock - lead_time)
      const daysUntilStockout = s.days_of_stock ?? 0;
      const orderByDays = Math.max(0, daysUntilStockout - s.lead_time_days);
      const orderDate = addDays(new Date(), orderByDays);
      const deliveryDate = addDays(orderDate, s.lead_time_days);

      return {
        sku: s.sku,
        sku_name: s.sku_name,
        supplier: s.supplier,
        orderDate,
        deliveryDate,
        suggested_order_qty: result.suggested_order_qty,
        urgency,
        lead_time_days: s.lead_time_days,
      } as CalendarOrder;
    });
  }, [filtered, skuOverrides, eoqSettings]);

  // Group orders by date key
  const ordersByDate = useMemo(() => {
    const map = new Map<string, CalendarOrder[]>();
    for (const order of calendarOrders) {
      const key = format(order.orderDate, 'yyyy-MM-dd');
      const existing = map.get(key) || [];
      existing.push(order);
      map.set(key, existing);
    }
    return map;
  }, [calendarOrders]);

  // Calendar grid
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarDays = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Pad start to Monday (1)
  const startDow = getDay(monthStart); // 0=Sun
  const paddingBefore = startDow === 0 ? 6 : startDow - 1;

  const prevMonth = useCallback(() => setCurrentMonth(prev => subMonths(prev, 1)), []);
  const nextMonth = useCallback(() => setCurrentMonth(prev => addMonths(prev, 1)), []);
  const goToday = useCallback(() => setCurrentMonth(startOfMonth(new Date())), []);

  const urgencyColor: Record<string, string> = {
    Critical: 'bg-destructive text-destructive-foreground',
    Warning: 'bg-warning/20 text-warning-foreground border border-warning/30',
    Watch: 'bg-primary/10 text-primary border border-primary/20',
  };

  const selectedOrders = selectedDay ? ordersByDate.get(selectedDay) || [] : [];

  if (!hasData) return <EmptyState />;

  return (
    <div>
      <div className="page-header flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="page-title">{t('calendar.title')}</h1>
            <HelpTooltip
              text={t('calendar.helpText')}
              tip={t('calendar.helpTip')}
            />
          </div>
          <p className="page-subtitle">{t('calendar.subtitle')}</p>
        </div>
      </div>

      {/* Month navigation */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={prevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-lg font-semibold min-w-[180px] text-center">
            {format(currentMonth, 'MMMM yyyy')}
          </h2>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={nextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" className="text-xs ml-2" onClick={goToday}>
            {t('common.today')}
          </Button>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-destructive inline-block" /> {t('common.critical')}</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-warning/50 inline-block" /> {t('common.warning')}</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-primary/30 inline-block" /> {t('common.watch')}</span>
        </div>
      </div>

      {/* Calendar grid */}
      <div className="bg-card border rounded-lg overflow-hidden">
        {/* Day headers */}
        <div className="grid grid-cols-7 border-b border-border">
          {[t('calendar.mon'), t('calendar.tue'), t('calendar.wed'), t('calendar.thu'), t('calendar.fri'), t('calendar.sat'), t('calendar.sun')].map(d => (
            <div key={d} className="px-2 py-2 text-xs font-semibold text-muted-foreground text-center bg-muted/50">
              {d}
            </div>
          ))}
        </div>

        {/* Calendar cells */}
        <div className="grid grid-cols-7">
          {/* Padding cells */}
          {Array.from({ length: paddingBefore }).map((_, i) => (
            <div key={`pad-${i}`} className="min-h-[100px] border-b border-r border-border bg-muted/10" />
          ))}

          {calendarDays.map(day => {
            const dateKey = format(day, 'yyyy-MM-dd');
            const dayOrders = ordersByDate.get(dateKey) || [];
            const isSelected = selectedDay === dateKey;
            const today = isToday(day);
            const hasCritical = dayOrders.some(o => o.urgency === 'Critical');
            const hasWarning = dayOrders.some(o => o.urgency === 'Warning');

            return (
              <div
                key={dateKey}
                onClick={() => setSelectedDay(isSelected ? null : dateKey)}
                className={`min-h-[100px] border-b border-r border-border p-1.5 cursor-pointer transition-colors
                  ${isSelected ? 'bg-primary/5 ring-1 ring-primary/30' : 'hover:bg-muted/30'}
                  ${today ? 'bg-primary/3' : ''}
                `}
              >
                <div className={`text-xs font-medium mb-1 ${today ? 'text-primary font-bold' : 'text-muted-foreground'}`}>
                  {format(day, 'd')}
                  {today && <span className="ml-1 text-[10px]">today</span>}
                </div>

                {dayOrders.length > 0 && (
                  <div className="space-y-0.5">
                    {dayOrders.slice(0, 3).map(order => (
                      <TooltipProvider key={order.sku} delayDuration={200}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className={`text-[10px] px-1 py-0.5 rounded truncate ${urgencyColor[order.urgency]}`}>
                              {order.sku}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <div className="text-xs">
                              <p className="font-semibold">{order.sku} — {order.sku_name}</p>
                              <p>Supplier: {order.supplier}</p>
                              <p>Order qty: {order.suggested_order_qty}</p>
                              <p>Lead time: {order.lead_time_days}d → delivery {format(order.deliveryDate, 'MMM d')}</p>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ))}
                    {dayOrders.length > 3 && (
                      <div className="text-[10px] text-muted-foreground pl-1">+{dayOrders.length - 3} more</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Detail panel */}
      {selectedDay && selectedOrders.length > 0 && (
        <div className="mt-4 bg-card border rounded-lg overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-primary" />
            <span className="font-semibold text-sm">
              Orders for {format(new Date(selectedDay), 'EEEE, MMMM d, yyyy')}
            </span>
            <Badge variant="secondary" className="ml-2">{selectedOrders.length} items</Badge>
          </div>
          <div className="overflow-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="px-4 py-2 font-semibold text-muted-foreground uppercase text-xs tracking-wider bg-muted/50 text-left">SKU</th>
                  <th className="px-4 py-2 font-semibold text-muted-foreground uppercase text-xs tracking-wider bg-muted/50 text-left">Name</th>
                  <th className="px-4 py-2 font-semibold text-muted-foreground uppercase text-xs tracking-wider bg-muted/50 text-left">Supplier</th>
                  <th className="px-4 py-2 font-semibold text-muted-foreground uppercase text-xs tracking-wider bg-muted/50 text-right">Order Qty</th>
                  <th className="px-4 py-2 font-semibold text-muted-foreground uppercase text-xs tracking-wider bg-muted/50 text-right">Lead Time</th>
                  <th className="px-4 py-2 font-semibold text-muted-foreground uppercase text-xs tracking-wider bg-muted/50 text-left">Est. Delivery</th>
                  <th className="px-4 py-2 font-semibold text-muted-foreground uppercase text-xs tracking-wider bg-muted/50">Urgency</th>
                </tr>
              </thead>
              <tbody>
                {selectedOrders.map(order => (
                  <tr key={order.sku}>
                    <td className="font-mono font-medium text-sm">{order.sku}</td>
                    <td className="text-sm">{order.sku_name}</td>
                    <td className="text-sm">{order.supplier}</td>
                    <td className="text-right font-semibold">{order.suggested_order_qty.toLocaleString()}</td>
                    <td className="text-right text-sm">{order.lead_time_days}d</td>
                    <td className="text-sm">{format(order.deliveryDate, 'MMM d, yyyy')}</td>
                    <td>
                      <span className={`inline-block px-2.5 py-1 rounded-md text-xs ${
                        order.urgency === 'Critical' ? 'urgency-critical' :
                        order.urgency === 'Warning' ? 'urgency-warning' : 'urgency-watch'
                      }`}>
                        {order.urgency}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {calendarOrders.length === 0 && (
        <div className="bg-card border rounded-lg p-12 text-center text-muted-foreground mt-4">
          No items need reordering with current filters.
        </div>
      )}
    </div>
  );
}
