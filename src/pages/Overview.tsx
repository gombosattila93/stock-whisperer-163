import { useInventory } from "@/context/InventoryContext";
import { EmptyState } from "@/components/EmptyState";
import { ExportButton } from "@/components/ExportButton";
import { DashboardAlerts } from "@/components/DashboardAlerts";
import { TrendBadge } from "@/components/TrendBadge";
import { Package, AlertTriangle, ShoppingCart, PackageX, TrendingUp, TrendingDown, Minus, Flame, Target, Lock, Info, BarChart3, DollarSign, Euro, Percent, Coins } from "lucide-react";
import {
  Tooltip as UiTooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { HelpTooltip } from "@/components/HelpTooltip";
import { AbcClass, XyzClass, SkuCapability } from "@/lib/types";
import { loadSkuOverrides } from "@/lib/persistence";
import { STRATEGY_OPTIONS, ReorderStrategy } from "@/lib/reorderStrategies";
import { Badge } from "@/components/ui/badge";
import { useMemo, useState, useEffect } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { useLanguage } from "@/lib/i18n";

function KpiCard({ icon: Icon, label, value, accent, subLabel }: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  accent?: string;
  subLabel?: string;
}) {
  return (
    <div className="kpi-card">
      <div className="flex items-center gap-3">
        <div className={`rounded-lg p-2.5 ${accent || 'bg-primary/10'}`}>
          <Icon className={`h-5 w-5 ${accent ? 'text-card' : 'text-primary'}`} />
        </div>
        <div>
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
          <p className="text-2xl font-bold mt-0.5">{value}</p>
          {subLabel && <p className="text-[10px] text-muted-foreground mt-0.5">{subLabel}</p>}
        </div>
      </div>
    </div>
  );
}

const abcLabels: AbcClass[] = ['A', 'B', 'C'];
const xyzLabels: XyzClass[] = ['X', 'Y', 'Z'];
const cellColors: Record<string, string> = {
  AX: 'bg-primary/20 text-primary',
  AY: 'bg-primary/15 text-primary',
  AZ: 'bg-warning/20 text-warning-foreground',
  BX: 'bg-primary/10 text-primary',
  BY: 'bg-muted text-foreground',
  BZ: 'bg-warning/15 text-warning-foreground',
  CX: 'bg-muted text-muted-foreground',
  CY: 'bg-muted text-muted-foreground',
  CZ: 'bg-destructive/10 text-destructive',
};

const STRATEGY_COLORS: Record<ReorderStrategy, string> = {
  rop: 'hsl(217, 91%, 60%)',
  eoq: 'hsl(142, 71%, 45%)',
  minmax: 'hsl(38, 92%, 50%)',
  periodic: 'hsl(280, 67%, 55%)',
};

const STRATEGY_LABEL_MAP: Record<ReorderStrategy, string> = Object.fromEntries(
  STRATEGY_OPTIONS.map(o => [o.value, o.label])
) as Record<ReorderStrategy, string>;

export default function Overview() {
  const { filtered, hasData, costSettings, reservedQtyMap, fxRates } = useInventory();
  const { t } = useLanguage();

  const [overridesLoaded, setOverridesLoaded] = useState<Record<string, ReorderStrategy>>({});

  useEffect(() => {
    loadSkuOverrides().then(setOverridesLoaded);
  }, [filtered]);

  const strategyDistribution = useMemo(() => {
    if (filtered.length === 0) return [];
    const counts: Record<ReorderStrategy, number> = { rop: 0, eoq: 0, minmax: 0, periodic: 0 };
    for (const s of filtered) {
      const strategy = overridesLoaded[s.sku] || 'rop';
      counts[strategy as ReorderStrategy]++;
    }
    return Object.entries(counts)
      .filter(([, count]) => count > 0)
      .map(([key, count]) => ({
        name: STRATEGY_LABEL_MAP[key as ReorderStrategy],
        value: count,
        color: STRATEGY_COLORS[key as ReorderStrategy],
      }));
  }, [filtered, overridesLoaded]);

  const hasReservations = Object.keys(reservedQtyMap).length > 0;
  const reservedStockValue = useMemo(() =>
    filtered.reduce((sum, s) => sum + s.reserved_qty * s.unit_price, 0),
    [filtered]
  );

  const deadStockCount = filtered.filter(s => s.dead_stock).length;
  const insufficientDataCount = filtered.filter(s => s.insufficientData).length;
  const overdueCount = filtered.filter(s => s.overdueDelivery).length;
  const abcInfo = filtered.find(s => s.abcInfo)?.abcInfo;
  const xyzInfo = filtered.find(s => s.xyzInfo)?.xyzInfo;
  const allZeroRevenue = filtered.length > 0 && filtered.every(s => s.total_revenue === 0);

  const dataQuality = useMemo(() => {
    if (filtered.length === 0) return null;
    const tiers: Record<SkuCapability['tier'], number> = { full: 0, partial: 0, 'stock-only': 0, 'sales-only': 0, minimal: 0 };
    let missingLeadTime = 0, missingPrice = 0, noSales = 0, noStock = 0;
    for (const s of filtered) {
      tiers[s.capability.tier]++;
      if (!s.capability.hasLeadTime) missingLeadTime++;
      if (!s.capability.hasPrice) missingPrice++;
      if (!s.capability.hasDemandHistory) noSales++;
      if (!s.capability.hasStockData) noStock++;
    }
    const completePct = Math.round((tiers.full / filtered.length) * 100);
    return { tiers, missingLeadTime, missingPrice, noSales, noStock, completePct };
  }, [filtered]);

  const financialKpis = useMemo(() => {
    if (filtered.length === 0) return null;
    let purchaseValueEur = 0;
    let sellingValueHuf = 0;
    let sellingValueEur = 0;
    let marginWeightedSum = 0;
    let marginWeightedDenom = 0;
    let usdExposureEur = 0;
    let usdExposureUsd = 0;
    let eurExposureEur = 0;
    let skusWithPurchase = 0;
    let skusWithoutPurchase = 0;
    let skusWithMargin = 0;
    let skusWithoutMargin = 0;
    let skusUsd = 0;
    let skusEur = 0;

    for (const s of filtered) {
      const pd = s.priceData;
      if (!pd) continue;

      if (pd.hasPurchasePrice && pd.basePurchasePriceEur !== null) {
        purchaseValueEur += pd.basePurchasePriceEur * s.stock_qty;
        skusWithPurchase++;
      } else {
        skusWithoutPurchase++;
      }

      if (pd.hasSellingPrice) {
        if (pd.sellingPriceHuf !== null) sellingValueHuf += pd.sellingPriceHuf * s.stock_qty;
        if (pd.sellingPriceEur !== null) sellingValueEur += pd.sellingPriceEur * s.stock_qty;
      }

      if (pd.hasMarginData && pd.marginPct !== null && pd.sellingPriceEur !== null) {
        const rev = pd.sellingPriceEur * s.stock_qty;
        marginWeightedSum += pd.marginPct * rev;
        marginWeightedDenom += rev;
        skusWithMargin++;
      } else {
        skusWithoutMargin++;
      }

      if (pd.purchaseCurrency === 'USD' && pd.hasPurchasePrice && pd.basePurchasePriceEur !== null) {
        usdExposureEur += pd.basePurchasePriceEur * s.stock_qty;
        const baseUsd = pd.priceBreaks[0]?.price ?? 0;
        usdExposureUsd += baseUsd * s.stock_qty;
        skusUsd++;
      }

      if (pd.purchaseCurrency === 'EUR' && pd.hasPurchasePrice && pd.basePurchasePriceEur !== null) {
        eurExposureEur += pd.basePurchasePriceEur * s.stock_qty;
        skusEur++;
      }
    }

    const avgMarginPct = marginWeightedDenom > 0 ? marginWeightedSum / marginWeightedDenom : null;
    const hasAnyFinancialData = skusWithPurchase > 0 || skusWithMargin > 0;

    const usdStrengthImpactEur = usdExposureUsd * (fxRates?.usdEur ?? 0.924) * 0.01;
    const totalFxExposure = eurExposureEur + usdExposureEur;
    const eurPct = totalFxExposure > 0 ? (eurExposureEur / totalFxExposure) * 100 : 0;
    const usdPct = totalFxExposure > 0 ? (usdExposureEur / totalFxExposure) * 100 : 0;
    const hufImpactEur = totalFxExposure * 0.01;
    const eurExposureHuf = eurExposureEur * (fxRates?.eurHuf ?? 392.5);

    return {
      purchaseValueEur, sellingValueHuf, sellingValueEur,
      avgMarginPct, usdExposureEur, usdExposureUsd,
      eurExposureEur, eurExposureHuf,
      skusWithPurchase, skusWithoutPurchase,
      skusWithMargin, skusWithoutMargin,
      skusUsd, skusEur, hasAnyFinancialData,
      usdStrengthImpactEur, totalFxExposure, eurPct, usdPct, hufImpactEur,
    };
  }, [filtered, fxRates]);

  if (!hasData) return <EmptyState />;

  const totalSkus = filtered.length;
  const criticalSkus = filtered.filter(s => s.days_of_stock !== null && s.days_of_stock < s.lead_time_days).length;
  const reorderNeeded = filtered.filter(s => s.reorder_point !== null && s.effective_stock <= s.reorder_point).length;
  const overstockItems = filtered.filter(s => s.days_of_stock !== null && s.days_of_stock > 180 && !s.dead_stock).length;

  const risingCount = filtered.filter(s => s.trend === 'rising').length;
  const fallingCount = filtered.filter(s => s.trend === 'falling').length;
  const stableCount = filtered.filter(s => s.trend === 'stable').length;
  const seasonalCount = filtered.filter(s => s.seasonalityFlag).length;
  const top5Rising = [...filtered]
    .filter(s => s.trend === 'rising')
    .sort((a, b) => b.trendPct - a.trendPct)
    .slice(0, 5);

  const totalRev = filtered.reduce((s, a) => s + a.total_revenue, 0);
  const SERVICE_LEVEL_NUM: Record<string, number> = { '90%': 90, '95%': 95, '99%': 99 };
  const weightedAvgSL = totalRev > 0
    ? filtered.reduce((s, a) => s + (SERVICE_LEVEL_NUM[a.effectiveServiceLevel] || 95) * a.total_revenue, 0) / totalRev
    : 95;
  const showPerClassSL = costSettings.serviceLevelSettings?.usePerClassServiceLevel;

  const matrixCounts: Record<string, number> = {};
  for (const abc of abcLabels) {
    for (const xyz of xyzLabels) {
      matrixCounts[`${abc}${xyz}`] = filtered.filter(
        s => s.abc_class === abc && s.xyz_class === xyz
      ).length;
    }
  }

  return (
    <div>
      <div className="page-header flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="page-title">{t('overview.title')}</h1>
            <HelpTooltip
              text={t('overview.helpText')}
              tip={t('overview.helpTip')}
            />
          </div>
          <p className="page-subtitle">{t('overview.subtitle')}</p>
        </div>
        <ExportButton
          data={filtered.map(s => ({
            sku: s.sku, name: s.sku_name, supplier: s.supplier, category: s.category,
            abc_class: s.abc_class, xyz_class: s.xyz_class,
            stock_qty: s.stock_qty, days_of_stock: s.days_of_stock === null ? 'N/A' : s.days_of_stock === Infinity ? 'Infinity' : Math.round(s.days_of_stock),
            dead_stock: s.dead_stock ? 'Yes' : 'No',
            insufficient_data: s.insufficientData ? 'Yes' : 'No',
          }))}
          filename="overview-export.csv"
        />
      </div>

      <DashboardAlerts />

      {allZeroRevenue && (
        <div className="flex items-start gap-2.5 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 mb-6">
          <AlertTriangle className="h-4 w-4 text-warning-foreground mt-0.5 shrink-0" />
          <p className="text-xs text-warning-foreground leading-relaxed">
            <strong>{t('overview.abcDisabled')}</strong> — {t('overview.abcDisabledDesc')}
          </p>
        </div>
      )}

      {(abcInfo || xyzInfo || insufficientDataCount > 0 || deadStockCount > 0 || overdueCount > 0) && (
        <div className="flex flex-wrap gap-2 mb-4">
          {abcInfo && (
            <Badge variant="outline" className="text-[10px] gap-1">
              <Info className="h-3 w-3" /> {abcInfo}
            </Badge>
          )}
          {xyzInfo && (
            <Badge variant="outline" className="text-[10px] gap-1">
              <Info className="h-3 w-3" /> {xyzInfo}
            </Badge>
          )}
          {insufficientDataCount > 0 && (
            <Badge variant="outline" className="text-[10px] gap-1 border-warning/50 text-warning-foreground">
              <AlertTriangle className="h-3 w-3" /> {insufficientDataCount} {t('overview.skusLimitedData')}
            </Badge>
          )}
          {deadStockCount > 0 && (
            <Badge variant="outline" className="text-[10px] gap-1">
              <PackageX className="h-3 w-3" /> {deadStockCount} {t('overview.deadStockSkus')}
            </Badge>
          )}
          {overdueCount > 0 && (
            <Badge variant="outline" className="text-[10px] gap-1 border-warning/50 text-warning-foreground">
              {overdueCount} {t('overview.overdueDeliveries')}
            </Badge>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        <KpiCard icon={Package} label={t('overview.totalSkus')} value={totalSkus} />
        <KpiCard icon={AlertTriangle} label={t('overview.criticalSkus')} value={criticalSkus} accent="bg-destructive" />
        <KpiCard icon={ShoppingCart} label={t('overview.reorderNeeded')} value={reorderNeeded} accent="bg-warning" />
        <KpiCard icon={PackageX} label={t('overview.overstockItems')} value={overstockItems} accent="bg-muted" />
        {showPerClassSL && (
          <KpiCard icon={Target} label={t('overview.wtdAvgServiceLevel')} value={`${weightedAvgSL.toFixed(1)}%`} />
        )}
        {hasReservations && (
          <KpiCard icon={Lock} label={t('overview.reservedStockValue')} value={`€${reservedStockValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
        )}
      </div>

      {financialKpis?.hasAnyFinancialData && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
          <KpiCard
            icon={Coins}
            label={t('overview.purchaseValue')}
            value={`€${financialKpis.purchaseValueEur.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
            subLabel={financialKpis.skusWithoutPurchase > 0 ? `${financialKpis.skusWithoutPurchase} ${t('overview.skusWithoutPrice')}` : undefined}
          />
          <KpiCard
            icon={Euro}
            label={t('overview.sellingValue')}
            value={`${financialKpis.sellingValueHuf.toLocaleString(undefined, { maximumFractionDigits: 0 })} Ft`}
            subLabel={`≈ €${financialKpis.sellingValueEur.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
          />
          <KpiCard
            icon={Percent}
            label={t('overview.avgMargin')}
            value={financialKpis.avgMarginPct !== null ? `${financialKpis.avgMarginPct.toFixed(1)}%` : '—'}
            accent={financialKpis.avgMarginPct !== null && financialKpis.avgMarginPct < 15 ? 'bg-destructive' : undefined}
            subLabel={financialKpis.skusWithoutMargin > 0 ? `${financialKpis.skusWithoutMargin} ${t('overview.skusWithoutMargin')}` : undefined}
          />
        </div>
      )}

      {(() => {
        const totalSkusCount = filtered.length;
        const hasPriceData = financialKpis && financialKpis.skusWithPurchase > 0;
        const noPriceData = !financialKpis || financialKpis.skusWithPurchase === 0;
        const partialData = hasPriceData && financialKpis.skusWithoutPurchase > 0;

        const eurValue = financialKpis?.eurExposureEur ?? 0;
        const eurHuf = financialKpis?.eurExposureHuf ?? 0;
        const eurCount = financialKpis?.skusEur ?? 0;
        const usdValueEur = financialKpis?.usdExposureEur ?? 0;
        const usdValueUsd = financialKpis?.usdExposureUsd ?? 0;
        const usdCount = financialKpis?.skusUsd ?? 0;

        const eurSubLabel = noPriceData
          ? t('overview.uploadCsvWithPurchasePrice')
          : partialData
            ? `${financialKpis!.skusWithPurchase} / ${totalSkusCount} ${t('overview.skusHavePriceData')}`
            : eurCount > 0
              ? `${eurCount} ${t('overview.eurSuppliers')}`
              : t('overview.noEurPurchases');

        const usdSubLabel = noPriceData
          ? t('overview.uploadCsvWithPurchasePrice')
          : partialData
            ? `${financialKpis!.skusWithPurchase} / ${totalSkusCount} ${t('overview.skusHavePriceData')}`
            : usdCount > 0
              ? `≈ $${usdValueUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })} · ${usdCount} SKU`
              : t('overview.noUsdPurchases');

        return (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-2">
              <div className="kpi-card">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg p-2.5 bg-primary/10">
                    <Euro className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{t('overview.eurExposure')}</p>
                    <p className="text-2xl font-bold mt-0.5">
                      €{eurValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </p>
                    {eurCount > 0 && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        ≈ {eurHuf.toLocaleString(undefined, { maximumFractionDigits: 0 })} HUF
                      </p>
                    )}
                    <p className="text-[10px] text-muted-foreground mt-0.5">{eurSubLabel}</p>
                  </div>
                </div>
              </div>

              <div className="kpi-card">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg p-2.5 bg-primary/10">
                    <DollarSign className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{t('overview.usdExposure')}</p>
                      {usdCount > 0 && (
                        <TooltipProvider delayDuration={200}>
                          <UiTooltip>
                            <TooltipTrigger asChild>
                              <button type="button" className="inline-flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors p-0.5" tabIndex={-1}>
                                <Info style={{ width: 12, height: 12 }} />
                              </button>
                            </TooltipTrigger>
                             <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">
                               <p>{t('overview.usdImpactTooltip')} <strong>€{(financialKpis?.usdStrengthImpactEur ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong></p>
                            </TooltipContent>
                          </UiTooltip>
                        </TooltipProvider>
                      )}
                    </div>
                    <p className="text-2xl font-bold mt-0.5">
                      €{usdValueEur.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{usdSubLabel}</p>
                  </div>
                </div>
              </div>
            </div>

            {financialKpis && financialKpis.totalFxExposure > 0 && (
              <p className="text-xs text-muted-foreground mb-8 px-1">
                {t('overview.fxSummary')}: €{financialKpis.totalFxExposure.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                {' '}(EUR: {financialKpis.eurPct.toFixed(0)}% | USD: {financialKpis.usdPct.toFixed(0)}% | HUF impact: ±€{financialKpis.hufImpactEur.toLocaleString(undefined, { maximumFractionDigits: 0 })} {t('overview.hufImpact')})
              </p>
            )}
            {(!financialKpis || financialKpis.totalFxExposure === 0) && <div className="mb-8" />}
          </>
        );
      })()}

      {dataQuality && dataQuality.completePct < 100 && (
        <div className="bg-card border rounded-lg p-5 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 className="h-4 w-4 text-primary" />
            <h2 className="font-semibold text-sm">{t('overview.dataQuality')}</h2>
            <span className="text-xs text-muted-foreground ml-auto">{dataQuality.completePct}% {t('common.complete').toLowerCase()}</span>
          </div>
          <div className="w-full bg-muted rounded-full h-2 mb-3">
            <div
              className="bg-primary rounded-full h-2 transition-all"
              style={{ width: `${dataQuality.completePct}%` }}
            />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 text-xs">
            <div className="rounded-md border border-primary/20 bg-primary/5 px-2.5 py-1.5">
              <span className="font-semibold">{dataQuality.tiers.full}</span>
              <span className="text-muted-foreground ml-1">{t('overview.fullAnalysis')}</span>
            </div>
            {dataQuality.missingLeadTime > 0 && (
              <div className="rounded-md border border-warning/20 bg-warning/5 px-2.5 py-1.5">
                <span className="font-semibold">{dataQuality.missingLeadTime}</span>
                <span className="text-muted-foreground ml-1">{t('overview.missingLeadTime')}</span>
              </div>
            )}
            {dataQuality.missingPrice > 0 && (
              <div className="rounded-md border border-warning/20 bg-warning/5 px-2.5 py-1.5">
                <span className="font-semibold">{dataQuality.missingPrice}</span>
                <span className="text-muted-foreground ml-1">{t('overview.missingPrice')}</span>
              </div>
            )}
            {dataQuality.noSales > 0 && (
              <div className="rounded-md border border-border bg-muted/50 px-2.5 py-1.5">
                <span className="font-semibold">{dataQuality.noSales}</span>
                <span className="text-muted-foreground ml-1">{t('overview.noSalesHistory')}</span>
              </div>
            )}
            {dataQuality.noStock > 0 && (
              <div className="rounded-md border border-border bg-muted/50 px-2.5 py-1.5">
                <span className="font-semibold">{dataQuality.noStock}</span>
                <span className="text-muted-foreground ml-1">{t('overview.noStockData')}</span>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="lg:col-span-2 bg-card border rounded-lg p-6">
          <h2 className="font-semibold mb-4">{t('overview.abcXyzMatrix')}</h2>
          <div className="overflow-auto">
            <div className="grid grid-cols-4 gap-2 min-w-[400px]">
              <div />
              {xyzLabels.map(xyz => (
                <div key={xyz} className="text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider py-2">
                  {xyz} {xyz === 'X' ? t('overview.stableX') : xyz === 'Y' ? t('overview.variableY') : t('overview.erraticZ')}
                </div>
              ))}
              {abcLabels.map(abc => (
                <>
                  <div key={`label-${abc}`} className="flex items-center text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {abc} {abc === 'A' ? t('overview.highRev') : abc === 'B' ? t('overview.midRev') : t('overview.lowRev')}
                  </div>
                  {xyzLabels.map(xyz => {
                    const key = `${abc}${xyz}`;
                    const count = matrixCounts[key] || 0;
                    return (
                      <div key={key} className={`matrix-cell ${cellColors[key]}`}>
                        <span className="text-2xl font-bold">{count}</span>
                        <span className="text-xs opacity-70">SKUs</span>
                      </div>
                    );
                  })}
                </>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-card border rounded-lg p-6">
          <h2 className="font-semibold mb-4">{t('overview.reorderStrategyMix')}</h2>
          {strategyDistribution.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
              {t('overview.noSkuData')}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={strategyDistribution}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={85}
                  paddingAngle={3}
                  dataKey="value"
                  stroke="none"
                >
                  {strategyDistribution.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number, name: string) => [`${value} SKUs`, name]}
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                />
                <Legend
                  verticalAlign="bottom"
                  iconType="circle"
                  iconSize={8}
                  formatter={(value: string) => (
                    <span className="text-xs text-foreground">{value}</span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="bg-card border rounded-lg p-6 mb-8">
        <h2 className="font-semibold mb-4">{t('overview.trendSummary')}</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
          <div className="flex items-center gap-2.5 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
            <TrendingUp className="h-4 w-4 text-emerald-500 shrink-0" />
            <div>
              <p className="text-lg font-bold">{risingCount}</p>
              <p className="text-xs text-muted-foreground">{t('common.rising')}</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
            <Minus className="h-4 w-4 text-muted-foreground shrink-0" />
            <div>
              <p className="text-lg font-bold">{stableCount}</p>
              <p className="text-xs text-muted-foreground">{t('common.stable')}</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
            <TrendingDown className="h-4 w-4 text-destructive shrink-0" />
            <div>
              <p className="text-lg font-bold">{fallingCount}</p>
              <p className="text-xs text-muted-foreground">{t('common.falling')}</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
            <Flame className="h-4 w-4 text-amber-500 shrink-0" />
            <div>
              <p className="text-lg font-bold">{seasonalCount}</p>
              <p className="text-xs text-muted-foreground">{t('common.seasonal')}</p>
            </div>
          </div>
        </div>

        {top5Rising.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground mb-2">{t('overview.top5Rising')}</h3>
            <div className="space-y-1.5">
              {top5Rising.map(s => (
                <div key={s.sku} className="flex items-center gap-3 text-sm px-3 py-1.5 rounded-md bg-muted/30">
                  <span className="font-mono font-medium w-24 shrink-0">{s.sku}</span>
                  <span className="text-muted-foreground truncate flex-1">{s.sku_name}</span>
                  <TrendBadge trend={s.trend} trendPct={s.trendPct} seasonalityFlag={s.seasonalityFlag} seasonalityPct={s.seasonalityPct} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
