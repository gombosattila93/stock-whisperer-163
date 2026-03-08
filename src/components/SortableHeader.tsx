import { useState, useMemo, useCallback } from "react";
import { ArrowUp, ArrowDown, ArrowUpDown, HelpCircle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export type SortDirection = "asc" | "desc" | null;

export interface SortState {
  column: string;
  direction: SortDirection;
}

export function useSortableTable<T>(data: T[], defaultSort?: SortState) {
  const [sort, setSort] = useState<SortState>(defaultSort || { column: "", direction: null });

  const toggleSort = useCallback((column: string) => {
    setSort((prev) => {
      if (prev.column !== column) return { column, direction: "asc" };
      if (prev.direction === "asc") return { column, direction: "desc" };
      return { column: "", direction: null };
    });
  }, []);

  const sorted = useMemo(() => {
    if (!sort.column || !sort.direction) return data;

    return [...data].sort((a, b) => {
      const aVal = (a as Record<string, unknown>)[sort.column];
      const bVal = (b as Record<string, unknown>)[sort.column];

      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;

      // Handle Infinity
      if (aVal === Infinity && bVal === Infinity) return 0;
      if (aVal === Infinity) return 1;
      if (bVal === Infinity) return -1;

      let cmp = 0;
      if (typeof aVal === "number" && typeof bVal === "number") {
        cmp = aVal - bVal;
      } else {
        cmp = String(aVal).localeCompare(String(bVal), undefined, { numeric: true, sensitivity: "base" });
      }

      return sort.direction === "desc" ? -cmp : cmp;
    });
  }, [data, sort]);

  return { sorted, sort, toggleSort };
}

interface SortableHeaderProps {
  column: string;
  label: string;
  sort: SortState;
  onSort: (column: string) => void;
  align?: "left" | "right";
}

export function SortableHeader({ column, label, sort, onSort, align = "left" }: SortableHeaderProps) {
  const isActive = sort.column === column;

  return (
    <th
      className={`px-4 py-3 font-semibold text-muted-foreground uppercase text-xs tracking-wider bg-muted/50 cursor-pointer select-none hover:bg-muted/80 transition-colors ${
        align === "right" ? "text-right" : "text-left"
      }`}
      onClick={() => onSort(column)}
    >
      <span className={`inline-flex items-center gap-1 ${align === "right" ? "justify-end" : ""}`}>
        {label}
        {isActive && sort.direction === "asc" && <ArrowUp className="h-3 w-3 text-primary" />}
        {isActive && sort.direction === "desc" && <ArrowDown className="h-3 w-3 text-primary" />}
        {!isActive && <ArrowUpDown className="h-3 w-3 opacity-30" />}
      </span>
    </th>
  );
}
