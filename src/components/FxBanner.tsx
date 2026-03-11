import { useState } from "react";
import { useInventory } from "@/context/InventoryContext";
import { isRateStale } from "@/lib/fxRates";
import { X, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchEcbRates } from "@/lib/fxRates";
import { toast } from "sonner";
import { useLanguage } from "@/lib/i18n";

export function FxBanner() {
  const { fxRates, setFxRates } = useInventory();
  const { t } = useLanguage();
  const [dismissed, setDismissed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  if (dismissed) return null;

  const stale = isRateStale(fxRates);

  if (fxRates.source === 'ecb' && !stale && !fxRates.manualOverride) return null;

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const rates = await fetchEcbRates();
      setFxRates(rates);
      toast.success(t('fx.rateUpdated'));
    } catch {
      toast.error(t('fx.fetchFailed'));
    } finally {
      setRefreshing(false);
    }
  };

  if (fxRates.manualOverride) {
    return (
      <div className="bg-blue-500/10 border-b border-blue-500/20 px-4 py-1.5 flex items-center gap-2 text-xs text-blue-700 dark:text-blue-300 shrink-0">
        <span className="font-medium">{t('fx.manualRate')}</span>
        <span className="font-mono">1 USD = {fxRates.usdEur.toFixed(3)} EUR</span>
        <span className="text-blue-400">|</span>
        <span className="font-mono">1 EUR = {fxRates.eurHuf.toFixed(1)} HUF</span>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-5 px-1.5 text-[10px] text-blue-600" onClick={() => setDismissed(true)}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>
    );
  }

  if (stale) {
    const hours = Math.floor((Date.now() - new Date(fxRates.lastUpdated).getTime()) / 3600000);
    return (
      <div className="bg-warning/10 border-b border-warning/20 px-4 py-1.5 flex items-center gap-2 text-xs text-warning-foreground shrink-0">
        <span>{t('fx.rateNotRefreshed')} {hours > 0 ? `${hours} ${t('fx.hoursAgo')}` : ''}</span>
        <Button variant="ghost" size="sm" className="h-5 px-2 text-[10px] gap-1" onClick={handleRefresh} disabled={refreshing}>
          <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} />
          {t('fx.refresh')}
        </Button>
        <Button variant="ghost" size="sm" className="h-5 px-1.5 text-[10px] ml-auto" onClick={() => setDismissed(true)}>
          <X className="h-3 w-3" />
        </Button>
      </div>
    );
  }

  if (fxRates.source === 'fallback') {
    return (
      <div className="bg-destructive/10 border-b border-destructive/20 px-4 py-1.5 flex items-center gap-2 text-xs text-destructive shrink-0">
        <span>{t('fx.fallbackRate')}</span>
        <Button variant="ghost" size="sm" className="h-5 px-2 text-[10px] gap-1" onClick={handleRefresh} disabled={refreshing}>
          <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} />
          {t('fx.refresh')}
        </Button>
        <Button variant="ghost" size="sm" className="h-5 px-1.5 text-[10px] ml-auto" onClick={() => setDismissed(true)}>
          <X className="h-3 w-3" />
        </Button>
      </div>
    );
  }

  return null;
}
