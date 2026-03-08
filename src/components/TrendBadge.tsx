import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { TrendDirection } from "@/lib/types";

interface TrendBadgeProps {
  trend: TrendDirection;
  trendPct: number;
  seasonalityFlag?: boolean;
  seasonalityPct?: number;
  compact?: boolean;
}

export function TrendBadge({ trend, trendPct, seasonalityFlag, seasonalityPct, compact }: TrendBadgeProps) {
  const pct = Math.abs(Math.round(trendPct));

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {trend === 'rising' && (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
          <TrendingUp className="h-3.5 w-3.5" />
          {!compact && `+${pct}%`}
        </span>
      )}
      {trend === 'falling' && (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive">
          <TrendingDown className="h-3.5 w-3.5" />
          {!compact && `-${pct}%`}
        </span>
      )}
      {trend === 'stable' && (
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Minus className="h-3.5 w-3.5" />
          {!compact && 'Stable'}
        </span>
      )}
      {seasonalityFlag && seasonalityPct !== undefined && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-400 cursor-help">
                🔥 +{Math.round(seasonalityPct)}%
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">Seasonal spike — demand is {Math.round(seasonalityPct)}% above 90d average</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
}
