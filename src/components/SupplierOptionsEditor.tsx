import { useState, useCallback } from "react";
import { SupplierOption } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Plus, Trash2, Star, StarOff } from "lucide-react";

interface Props {
  sku: string;
  options: SupplierOption[];
  onChange: (sku: string, options: SupplierOption[]) => void;
  knownSuppliers: string[];
}

const EMPTY_OPTION: SupplierOption = {
  supplier: "",
  unit_price: 0,
  lead_time_days: 0,
  moq: 1,
  price_breaks: [],
  is_primary: false,
};

export function SupplierOptionsEditor({ sku, options, onChange, knownSuppliers }: Props) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<SupplierOption>({ ...EMPTY_OPTION });

  const addOption = useCallback(() => {
    if (!draft.supplier.trim()) return;
    const hasPrimary = options.some(o => o.is_primary);
    const newOpt = { ...draft, is_primary: !hasPrimary ? true : draft.is_primary };
    onChange(sku, [...options, newOpt]);
    setDraft({ ...EMPTY_OPTION });
    setAdding(false);
  }, [draft, options, sku, onChange]);

  const removeOption = useCallback((idx: number) => {
    const next = options.filter((_, i) => i !== idx);
    // Ensure at least one primary if any remain
    if (next.length > 0 && !next.some(o => o.is_primary)) {
      next[0].is_primary = true;
    }
    onChange(sku, next);
  }, [options, sku, onChange]);

  const setPrimary = useCallback((idx: number) => {
    const next = options.map((o, i) => ({ ...o, is_primary: i === idx }));
    onChange(sku, next);
  }, [options, sku, onChange]);

  const addPriceBreak = useCallback(() => {
    if (draft.price_breaks.length >= 5) return;
    setDraft(d => ({ ...d, price_breaks: [...d.price_breaks, { minQty: 0, unitPrice: 0 }] }));
  }, [draft.price_breaks.length]);

  return (
    <div className="space-y-3 p-3 bg-muted/30 rounded-md border border-border">
      {options.length === 0 && !adding && (
        <p className="text-xs text-muted-foreground">No supplier options configured.</p>
      )}

      {options.map((opt, idx) => (
        <div key={idx} className="flex items-center gap-2 text-xs">
          <button
            onClick={() => setPrimary(idx)}
            className="shrink-0"
            title={opt.is_primary ? "Primary supplier" : "Set as primary"}
          >
            {opt.is_primary ? (
              <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
            ) : (
              <StarOff className="h-3.5 w-3.5 text-muted-foreground hover:text-amber-500" />
            )}
          </button>
          <span className="font-medium w-24 truncate" title={opt.supplier}>{opt.supplier}</span>
          <span className="text-muted-foreground">€{opt.unit_price}</span>
          <span className="text-muted-foreground">{opt.lead_time_days}d</span>
          <span className="text-muted-foreground">MOQ: {opt.moq}</span>
          {opt.reliability_score !== undefined && (
            <span className="text-muted-foreground">{Math.round(opt.reliability_score * 100)}% rel.</span>
          )}
          {opt.price_breaks.length > 0 && (
            <span className="text-muted-foreground">{opt.price_breaks.length} breaks</span>
          )}
          <button onClick={() => removeOption(idx)} className="ml-auto text-destructive hover:text-destructive/80">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}

      {adding ? (
        <div className="space-y-2 border-t border-border pt-2">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div>
              <Label className="text-[10px] text-muted-foreground">Supplier</Label>
              <Input
                list={`suppliers-${sku}`}
                value={draft.supplier}
                onChange={e => setDraft(d => ({ ...d, supplier: e.target.value }))}
                className="h-7 text-xs"
                placeholder="Supplier name"
              />
              <datalist id={`suppliers-${sku}`}>
                {knownSuppliers.map(s => <option key={s} value={s} />)}
              </datalist>
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">Unit Price (€)</Label>
              <Input
                type="number"
                min={0}
                step={0.01}
                value={draft.unit_price || ""}
                onChange={e => setDraft(d => ({ ...d, unit_price: Number(e.target.value) || 0 }))}
                className="h-7 text-xs"
              />
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">Lead Time (days)</Label>
              <Input
                type="number"
                min={0}
                value={draft.lead_time_days || ""}
                onChange={e => setDraft(d => ({ ...d, lead_time_days: Number(e.target.value) || 0 }))}
                className="h-7 text-xs"
              />
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">MOQ</Label>
              <Input
                type="number"
                min={1}
                value={draft.moq || ""}
                onChange={e => setDraft(d => ({ ...d, moq: Math.max(1, Number(e.target.value) || 1) }))}
                className="h-7 text-xs"
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <Switch
                checked={draft.is_primary}
                onCheckedChange={v => setDraft(d => ({ ...d, is_primary: v }))}
                className="scale-75"
              />
              <Label className="text-[10px]">Primary</Label>
            </div>
            <div className="flex items-center gap-1.5">
              <Label className="text-[10px] text-muted-foreground">Reliability</Label>
              <Slider
                min={0}
                max={1}
                step={0.05}
                value={[draft.reliability_score ?? 0.8]}
                onValueChange={([v]) => setDraft(d => ({ ...d, reliability_score: v }))}
                className="w-20"
              />
              <span className="text-[10px] font-mono">{Math.round((draft.reliability_score ?? 0.8) * 100)}%</span>
            </div>
          </div>

          {/* Price breaks */}
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Label className="text-[10px] text-muted-foreground">Price Breaks</Label>
              {draft.price_breaks.length < 5 && (
                <button onClick={addPriceBreak} className="text-[10px] text-primary hover:underline">+ Add tier</button>
              )}
            </div>
            {draft.price_breaks.map((pb, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  placeholder="Min qty"
                  value={pb.minQty || ""}
                  onChange={e => {
                    const breaks = [...draft.price_breaks];
                    breaks[i] = { ...breaks[i], minQty: Number(e.target.value) || 0 };
                    setDraft(d => ({ ...d, price_breaks: breaks }));
                  }}
                  className="h-6 w-20 text-[10px]"
                />
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  placeholder="Unit price"
                  value={pb.unitPrice || ""}
                  onChange={e => {
                    const breaks = [...draft.price_breaks];
                    breaks[i] = { ...breaks[i], unitPrice: Number(e.target.value) || 0 };
                    setDraft(d => ({ ...d, price_breaks: breaks }));
                  }}
                  className="h-6 w-20 text-[10px]"
                />
                <button
                  onClick={() => setDraft(d => ({ ...d, price_breaks: d.price_breaks.filter((_, j) => j !== i) }))}
                  className="text-destructive"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <Button size="sm" onClick={addOption} disabled={!draft.supplier.trim()} className="h-7 text-xs">
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setAdding(false); setDraft({ ...EMPTY_OPTION }); }} className="h-7 text-xs">
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setAdding(true)} className="h-7 text-xs gap-1">
          <Plus className="h-3 w-3" />
          Add supplier option
        </Button>
      )}
    </div>
  );
}
