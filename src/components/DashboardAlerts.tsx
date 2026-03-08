import { AlertCircle, Bell, X } from "lucide-react";
import { useInventory } from "@/context/InventoryContext";
import { useMemo, useState } from "react";

interface Alert {
  id: string;
  severity: 'critical' | 'warning';
  message: string;
}

export function DashboardAlerts() {
  const { filtered, hasData, costSettings } = useInventory();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const alerts = useMemo<Alert[]>(() => {
    if (!hasData || filtered.length === 0) return [];

    const result: Alert[] = [];

    // Critical: SKUs with < 7 days of stock
    const criticalCount = filtered.filter(s => s.days_of_stock !== null && s.days_of_stock < 7 && s.avg_daily_demand > 0).length;
    if (criticalCount > 0) {
      result.push({
        id: 'critical-stockout',
        severity: 'critical',
        message: `${criticalCount} SKU${criticalCount > 1 ? 's' : ''} with less than 7 days of stock — immediate action required`,
      });
    }

    // Warning: SKUs below reorder point
    const reorderCount = filtered.filter(s => s.reorder_point !== null && s.effective_stock <= s.reorder_point && s.avg_daily_demand > 0).length;
    if (reorderCount > 0) {
      result.push({
        id: 'below-reorder',
        severity: 'warning',
        message: `${reorderCount} SKU${reorderCount > 1 ? 's' : ''} below reorder point — consider placing orders`,
      });
    }

    // Warning: High tied-up capital in overstock
    const overstockItems = filtered.filter(s => s.days_of_stock > 180 && s.avg_daily_demand > 0);
    if (overstockItems.length > 0) {
      const tiedUp = overstockItems.reduce((sum, s) => {
        const idealStock = s.avg_daily_demand * 180;
        const excess = Math.max(0, s.effective_stock - idealStock);
        return sum + excess * s.unit_price;
      }, 0);
      if (tiedUp > 0) {
        result.push({
          id: 'overstock-capital',
          severity: 'warning',
          message: `€${tiedUp.toLocaleString(undefined, { maximumFractionDigits: 0 })} tied up in ${overstockItems.length} overstocked SKUs`,
        });
      }
    }

    // Shelf life critical
    if (costSettings.shelfLifeEnabled) {
      const shelfCriticalCount = filtered.filter(s => s.shelfLifeRisk === 'critical').length;
      if (shelfCriticalCount > 0) {
        result.push({
          id: 'shelf-life-critical',
          severity: 'critical',
          message: `${shelfCriticalCount} SKU${shelfCriticalCount > 1 ? 's' : ''} exceed shelf life threshold — risk of write-off`,
        });
      }
    }

    return result;
  }, [filtered, hasData, costSettings]);

  const visibleAlerts = alerts.filter(a => !dismissed.has(a.id));

  if (visibleAlerts.length === 0) return null;

  return (
    <div className="space-y-2 mb-6">
      {visibleAlerts.map(alert => (
        <div
          key={alert.id}
          className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm ${
            alert.severity === 'critical'
              ? 'bg-destructive/10 text-destructive border border-destructive/20'
              : 'bg-warning/10 text-warning-foreground border border-warning/20'
          }`}
        >
          {alert.severity === 'critical' ? (
            <AlertCircle className="h-4 w-4 shrink-0" />
          ) : (
            <Bell className="h-4 w-4 shrink-0" />
          )}
          <span className="flex-1">{alert.message}</span>
          <button
            onClick={() => setDismissed(prev => new Set(prev).add(alert.id))}
            className="p-1 rounded hover:bg-foreground/10 transition-colors shrink-0"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
