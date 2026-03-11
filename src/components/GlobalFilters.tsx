import { useInventory } from "@/context/InventoryContext";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Search, Settings2, Pencil, RotateCcw } from "lucide-react";
import { SERVICE_LEVELS } from "@/lib/calculations";
import { FilterPresets } from "@/components/FilterPresets";
import { ClassificationSettings } from "@/components/ClassificationSettings";
import { useState } from "react";
import { useLanguage } from "@/lib/i18n";

export function GlobalFilters() {
  const {
    suppliers, categories,
    filterSupplier, setFilterSupplier,
    filterCategory, setFilterCategory,
    demandDays, setDemandDays,
    searchQuery, setSearchQuery,
    serviceLevel, setServiceLevel,
    hasData, filtered, analysis,
    thresholds, setThresholds,
    stockOverrideCount, clearStockOverrides,
  } = useInventory();
  const { t } = useLanguage();

  const [showClassification, setShowClassification] = useState(false);

  if (!hasData) return null;

  return (
    <>
      <div className="flex items-center gap-3 ml-auto flex-wrap">
        <div className="flex items-center gap-1.5 relative">
          <Search className="h-3.5 w-3.5 text-muted-foreground absolute left-2.5 pointer-events-none" />
          <Input
            type="text"
            placeholder={t('header.searchSkus')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-[180px] h-8 text-xs pl-8"
          />
          {searchQuery && (
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {filtered.length}/{analysis.length}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <Label className="text-xs text-muted-foreground whitespace-nowrap">{t('common.supplier')}</Label>
          <Select value={filterSupplier} onValueChange={(v) => setFilterSupplier(v === "all" ? "" : v)}>
            <SelectTrigger className="w-[140px] h-8 text-xs">
              <SelectValue placeholder={t('common.all')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('common.all')}</SelectItem>
              {suppliers.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-1.5">
          <Label className="text-xs text-muted-foreground whitespace-nowrap">{t('common.category')}</Label>
          <Select value={filterCategory} onValueChange={(v) => setFilterCategory(v === "all" ? "" : v)}>
            <SelectTrigger className="w-[140px] h-8 text-xs">
              <SelectValue placeholder={t('common.all')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('common.all')}</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-1.5">
          <Label className="text-xs text-muted-foreground whitespace-nowrap">{t('header.serviceLevel')}</Label>
          <Select value={serviceLevel} onValueChange={setServiceLevel}>
            <SelectTrigger className="w-[80px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.keys(SERVICE_LEVELS).map((level) => (
                <SelectItem key={level} value={level}>{level}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-1.5">
          <Label className="text-xs text-muted-foreground whitespace-nowrap">{t('header.demandWindow')}</Label>
          <Input
            type="number"
            value={demandDays}
            onChange={(e) => setDemandDays(Number(e.target.value) || 90)}
            className="w-[70px] h-8 text-xs"
            min={7}
            max={365}
          />
          <span className="text-xs text-muted-foreground">{t('common.days')}</span>
        </div>

        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs gap-1.5"
          onClick={() => setShowClassification(true)}
        >
          <Settings2 className="h-3.5 w-3.5" />
          ABC/XYZ
        </Button>

        {stockOverrideCount > 0 && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearStockOverrides}
                  className="h-8 text-xs text-muted-foreground gap-1.5"
                >
                  <Pencil className="h-3 w-3 text-primary" />
                  <RotateCcw className="h-3 w-3" />
                  {stockOverrideCount} {stockOverrideCount !== 1 ? t('header.stockOverridesPlural') : t('header.stockOverrides')}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('common.clear')}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        <FilterPresets />
      </div>

      <ClassificationSettings
        open={showClassification}
        onOpenChange={setShowClassification}
        thresholds={thresholds}
        onApply={setThresholds}
      />
    </>
  );
}
