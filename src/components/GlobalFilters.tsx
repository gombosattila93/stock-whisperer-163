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

export function GlobalFilters() {
  const {
    suppliers,
    categories,
    filterSupplier,
    setFilterSupplier,
    filterCategory,
    setFilterCategory,
    demandDays,
    setDemandDays,
    hasData,
  } = useInventory();

  if (!hasData) return null;

  return (
    <div className="flex items-center gap-3 ml-auto flex-wrap">
      <div className="flex items-center gap-1.5">
        <Label className="text-xs text-muted-foreground whitespace-nowrap">Supplier</Label>
        <Select value={filterSupplier} onValueChange={(v) => setFilterSupplier(v === "all" ? "" : v)}>
          <SelectTrigger className="w-[140px] h-8 text-xs">
            <SelectValue placeholder="All" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            {suppliers.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-1.5">
        <Label className="text-xs text-muted-foreground whitespace-nowrap">Category</Label>
        <Select value={filterCategory} onValueChange={(v) => setFilterCategory(v === "all" ? "" : v)}>
          <SelectTrigger className="w-[140px] h-8 text-xs">
            <SelectValue placeholder="All" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-1.5">
        <Label className="text-xs text-muted-foreground whitespace-nowrap">Demand window</Label>
        <Input
          type="number"
          value={demandDays}
          onChange={(e) => setDemandDays(Number(e.target.value) || 90)}
          className="w-[70px] h-8 text-xs"
          min={7}
          max={365}
        />
        <span className="text-xs text-muted-foreground">days</span>
      </div>
    </div>
  );
}
