import { useState, useEffect } from "react";
import { useInventory } from "@/context/InventoryContext";
import { fetchEcbRates, createManualRates, isRateDeviant, isRateStale, FALLBACK_RATES, FxRateConfig } from "@/lib/fxRates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, AlertTriangle, Info } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { useLanguage } from "@/lib/i18n";

function sourceBadge(source: FxRateConfig['source'], t: (key: any) => string) {
  switch (source) {
    case 'ecb': return <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">ECB</Badge>;
    case 'manual': return <Badge variant="outline" className="text-[10px] border-blue-500/30 text-blue-600">{t('fxPanel.manual')}</Badge>;
    case 'fallback': return <Badge variant="destructive" className="text-[10px]">{t('fxPanel.fallback')}</Badge>;
  }
}

function timeAgo(iso: string, t: (key: any) => string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (isNaN(ms)) return t('fxPanel.unknown');
  const hours = Math.floor(ms / 3600000);
  if (hours < 1) return t('fxPanel.now');
  if (hours < 24) return `${hours} ${t('fxPanel.hoursAgo')}`;
  const days = Math.floor(hours / 24);
  return `${days} ${t('fxPanel.daysAgo')}`;
}

export function FxSettingsPanel() {
  const { t } = useLanguage();
  const { fxRates, setFxRates } = useInventory();
  const [manualMode, setManualMode] = useState(fxRates.manualOverride);
  const [manualUsdEur, setManualUsdEur] = useState(String(fxRates.usdEur));
  const [manualEurHuf, setManualEurHuf] = useState(String(fxRates.eurHuf));
  const [isFetching, setIsFetching] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setManualMode(fxRates.manualOverride);
    setManualUsdEur(String(fxRates.usdEur));
    setManualEurHuf(String(fxRates.eurHuf));
  }, [fxRates]);

  const derivedUsdHuf = (() => {
    const u = parseFloat(manualUsdEur);
    const h = parseFloat(manualEurHuf);
    if (isFinite(u) && isFinite(h) && u > 0 && h > 0) return (u * h).toFixed(2);
    return '—';
  })();

  const handleFetchEcb = async () => {
    setIsFetching(true);
    try {
      const rates = await fetchEcbRates();
      if (isRateDeviant(rates)) {
        const confirmed = window.confirm(
          `${t('fxPanel.unusualRate')}:\n1 USD = ${rates.usdEur.toFixed(4)} EUR\n1 EUR = ${rates.eurHuf.toFixed(1)} HUF\n\n${t('fxPanel.areYouSure')}`
        );
        if (!confirmed) {
          setIsFetching(false);
          return;
        }
      }
      setFxRates(rates);
      toast.success(t('fxPanel.ecbUpdated'));
    } catch (err) {
      toast.error(t('fxPanel.ecbFailed'), { description: String(err) });
    } finally {
      setIsFetching(false);
    }
  };

  const handleApplyManual = () => {
    const u = parseFloat(manualUsdEur);
    const h = parseFloat(manualEurHuf);
    if (!isFinite(u) || u <= 0 || !isFinite(h) || h <= 0) {
      toast.error(t('fxPanel.invalidRate'));
      return;
    }
    const rates = createManualRates(u, h);
    if (isRateDeviant(rates)) {
      const confirmed = window.confirm(t('fxPanel.unusualDeviation'));
      if (!confirmed) return;
    }
    setFxRates(rates);
    toast.success(t('fxPanel.manualApplied'));
  };

  const handleClearOverride = () => {
    setManualMode(false);
    setFxRates(FALLBACK_RATES);
    toast.info(t('fxPanel.overrideCleared'));
  };

  const stale = isRateStale(fxRates);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5 text-xs h-8">
          <span className="font-mono">
            {fxRates.source === 'fallback' ? '⚠' : '€'}
          </span>
          <span className="hidden sm:inline">FX</span>
          {fxRates.manualOverride && <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />}
          {stale && !fxRates.manualOverride && <span className="w-1.5 h-1.5 rounded-full bg-warning" />}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {t('fxPanel.title')}
            {sourceBadge(fxRates.source, t)}
          </DialogTitle>
          <DialogDescription>
            {t('fxPanel.description')}
          </DialogDescription>
        </DialogHeader>

        {/* Current rates display */}
        <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">1 USD =</span>
            <span className="font-mono font-semibold">{fxRates.usdEur.toFixed(4)} EUR</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">1 EUR =</span>
            <span className="font-mono font-semibold">{fxRates.eurHuf.toFixed(1)} HUF</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">1 USD =</span>
            <span className="font-mono text-muted-foreground">{fxRates.usdHuf.toFixed(1)} HUF</span>
          </div>
          <Separator />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{t('fxPanel.updated')} {timeAgo(fxRates.lastUpdated, t)}</span>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={handleFetchEcb}
              disabled={isFetching}
            >
              <RefreshCw className={`h-3 w-3 ${isFetching ? 'animate-spin' : ''}`} />
              {t('fxPanel.refresh')}
            </Button>
          </div>
          {stale && !fxRates.manualOverride && (
            <div className="flex items-center gap-1.5 text-xs text-warning-foreground">
              <AlertTriangle className="h-3 w-3" />
              {t('fxPanel.staleRate')}
            </div>
          )}
        </div>

        {/* Manual override toggle */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label htmlFor="manual-toggle" className="text-sm font-medium">
              {t('fxPanel.manualRate')}
            </Label>
            <Switch
              id="manual-toggle"
              checked={manualMode}
              onCheckedChange={setManualMode}
            />
          </div>

          {manualMode && (
            <div className="space-y-3 rounded-lg border border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/20 p-3">
              <div className="flex items-start gap-1.5 text-xs text-blue-600 dark:text-blue-400">
                <Info className="h-3 w-3 mt-0.5 shrink-0" />
                {t('fxPanel.manualActive')}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">1 USD = ? EUR</Label>
                  <Input
                    type="number"
                    step="0.001"
                    min="0.01"
                    value={manualUsdEur}
                    onChange={(e) => setManualUsdEur(e.target.value)}
                    className="h-8 font-mono text-sm mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">1 EUR = ? HUF</Label>
                  <Input
                    type="number"
                    step="0.1"
                    min="1"
                    value={manualEurHuf}
                    onChange={(e) => setManualEurHuf(e.target.value)}
                    className="h-8 font-mono text-sm mt-1"
                  />
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                1 USD = <span className="font-mono">{derivedUsdHuf}</span> HUF {t('fxPanel.calculated')}
              </div>
              <div className="flex gap-2">
                <Button size="sm" className="h-7 text-xs" onClick={handleApplyManual}>
                  {t('fxPanel.applyBtn')}
                </Button>
                {fxRates.manualOverride && (
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleClearOverride}>
                    {t('fxPanel.clearOverride')}
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
