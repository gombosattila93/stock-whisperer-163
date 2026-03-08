import { useCallback, useRef } from "react";
import { Upload, FileSpreadsheet, Sparkles, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useInventory } from "@/context/InventoryContext";

export function EmptyState() {
  const { loadFile, loadSample } = useInventory();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) await loadFile(file);
    },
    [loadFile]
  );

  return (
    <div className="empty-state">
      <div className="rounded-full bg-primary/10 p-6 mb-6">
        <FileSpreadsheet className="h-12 w-12 text-primary" />
      </div>
      <h2 className="text-xl font-semibold mb-2">No inventory data loaded</h2>
      <p className="text-muted-foreground mb-8 max-w-md">
        Upload a CSV file with your inventory and sales data, or load sample data to explore the dashboard.
      </p>
      <div className="flex gap-3">
        <Button onClick={() => inputRef.current?.click()} size="lg">
          <Upload className="h-4 w-4 mr-2" />
          Upload CSV
        </Button>
        <Button variant="outline" size="lg" onClick={loadSample}>
          <Sparkles className="h-4 w-4 mr-2" />
          Load Sample Data
        </Button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        onChange={handleFile}
        className="hidden"
      />
      <div className="mt-8 text-xs text-muted-foreground max-w-lg">
        <p className="font-medium mb-1">Expected CSV columns:</p>
        <code className="font-mono text-xs">
          sku, sku_name, supplier, category, date, partner_id, sold_qty, unit_price, stock_qty, lead_time_days, ordered_qty, expected_delivery_date
        </code>
      </div>
    </div>
  );
}

export function DataActions() {
  const { hasData, loadFile, appendFile, clearData } = useInventory();
  const replaceRef = useRef<HTMLInputElement>(null);
  const appendRef = useRef<HTMLInputElement>(null);

  if (!hasData) return null;

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={() => appendRef.current?.click()}>
        <Plus className="h-3.5 w-3.5 mr-1.5" />
        Append CSV
      </Button>
      <Button variant="outline" size="sm" onClick={() => replaceRef.current?.click()}>
        <Upload className="h-3.5 w-3.5 mr-1.5" />
        Replace
      </Button>
      <Button variant="ghost" size="sm" onClick={clearData} className="text-muted-foreground">
        Clear
      </Button>
      <input
        ref={replaceRef}
        type="file"
        accept=".csv"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (file) await loadFile(file);
          e.target.value = '';
        }}
        className="hidden"
      />
      <input
        ref={appendRef}
        type="file"
        accept=".csv"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (file) await appendFile(file);
          e.target.value = '';
        }}
        className="hidden"
      />
    </div>
  );
}
