import { useMemo } from "react";
import { LineChart, Line, Tooltip, ResponsiveContainer } from "recharts";
import { SkuAnalysis } from "@/lib/types";

interface DemandSparklineProps {
  sku: SkuAnalysis;
}

function getWeeklyDemand(sales: { date: string; sold_qty: number }[]): { week: string; demand: number }[] {
  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - 90);

  // Create 13 weekly buckets
  const weeks: { start: Date; end: Date; label: string; total: number }[] = [];
  for (let i = 0; i < 13; i++) {
    const wStart = new Date(start);
    wStart.setDate(wStart.getDate() + i * 7);
    const wEnd = new Date(wStart);
    wEnd.setDate(wEnd.getDate() + 6);
    weeks.push({
      start: wStart,
      end: wEnd,
      label: `W${i + 1}`,
      total: 0,
    });
  }

  for (const sale of sales) {
    const d = new Date(sale.date);
    if (d < start || d > now) continue;
    for (const w of weeks) {
      if (d >= w.start && d <= w.end) {
        w.total += sale.sold_qty;
        break;
      }
    }
  }

  return weeks.map(w => ({
    week: w.label,
    demand: Math.round(w.total / 7 * 10) / 10, // avg daily demand per week
  }));
}

function getTrendColor(data: { demand: number }[]): string {
  if (data.length < 2) return "hsl(var(--success))";
  const firstHalf = data.slice(0, Math.floor(data.length / 2));
  const secondHalf = data.slice(Math.floor(data.length / 2));
  const avgFirst = firstHalf.reduce((s, d) => s + d.demand, 0) / firstHalf.length;
  const avgSecond = secondHalf.reduce((s, d) => s + d.demand, 0) / secondHalf.length;
  return avgSecond < avgFirst * 0.85 ? "hsl(var(--warning))" : "hsl(var(--success))";
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover border rounded px-2 py-1 text-xs shadow-md">
      <span className="text-muted-foreground">{label}</span>
      <span className="ml-2 font-semibold">{payload[0].value}</span>
    </div>
  );
};

export function DemandSparkline({ sku }: DemandSparklineProps) {
  const data = useMemo(() => getWeeklyDemand(sku.sales), [sku.sales]);
  const color = useMemo(() => getTrendColor(data), [data]);

  return (
    <div style={{ width: 120, height: 40 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <Line
            type="monotone"
            dataKey="demand"
            stroke={color}
            strokeWidth={1.5}
            dot={false}
          />
          <Tooltip content={<CustomTooltip />} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
