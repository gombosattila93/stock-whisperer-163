import { useState, useEffect } from "react";
import { useInventory } from "@/context/InventoryContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Bookmark, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useLanguage } from "@/lib/i18n";

export interface FilterPreset {
  id: string;
  name: string;
  supplier: string;
  category: string;
  serviceLevel: string;
  demandDays: number;
}

const DB_NAME = 'inventory-dashboard';
const DB_VERSION = 2;
const STORE_NAME = 'settings';
const PRESETS_KEY = 'filterPresets';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('data')) db.createObjectStore('data');
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function loadPresets(): Promise<FilterPreset[]> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(PRESETS_KEY);
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  } catch { return []; }
}

async function savePresets(presets: FilterPreset[]): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(presets, PRESETS_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch { console.warn('Failed to save filter presets to IndexedDB'); }
}

export function FilterPresets() {
  const {
    filterSupplier, setFilterSupplier,
    filterCategory, setFilterCategory,
    serviceLevel, setServiceLevel,
    demandDays, setDemandDays,
    hasData,
  } = useInventory();
  const { t } = useLanguage();

  const [presets, setPresets] = useState<FilterPreset[]>([]);
  const [newName, setNewName] = useState("");
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => { loadPresets().then(p => { setPresets(p); setLoaded(true); }); }, []);
  useEffect(() => { if (loaded) savePresets(presets); }, [presets, loaded]);

  if (!hasData) return null;

  const handleSave = () => {
    const name = newName.trim();
    if (!name) return;
    if (presets.some((p) => p.name === name)) { toast.error("Preset name already exists"); return; }
    const preset: FilterPreset = { id: crypto.randomUUID(), name, supplier: filterSupplier, category: filterCategory, serviceLevel, demandDays };
    setPresets((prev) => [...prev, preset]);
    setNewName("");
    toast.success(`Saved preset "${name}"`);
  };

  const handleApply = (preset: FilterPreset) => {
    setFilterSupplier(preset.supplier);
    setFilterCategory(preset.category);
    setServiceLevel(preset.serviceLevel);
    setDemandDays(preset.demandDays);
    toast.info(`Applied preset "${preset.name}"`);
    setOpen(false);
  };

  const handleDelete = (id: string) => { setPresets((prev) => prev.filter((p) => p.id !== id)); };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
          <Bookmark className="h-3.5 w-3.5" />
          {t('header.presets')}
          {presets.length > 0 && (
            <span className="bg-primary/10 text-primary rounded-full px-1.5 text-[10px] font-semibold">{presets.length}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72" align="end">
        <div className="text-sm font-semibold mb-2">{t('header.filterPresets')}</div>

        {presets.length === 0 && (
          <p className="text-xs text-muted-foreground mb-3">{t('header.noPresets')}</p>
        )}

        <div className="space-y-1 mb-3 max-h-[200px] overflow-y-auto">
          {presets.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-1 rounded-md px-2 py-1.5 hover:bg-muted/50 group">
              <button className="flex-1 text-left text-xs truncate" onClick={() => handleApply(p)}>
                <span className="font-medium">{p.name}</span>
                <span className="text-muted-foreground ml-1.5">
                  {[p.supplier || t('common.all'), p.category || t('common.all'), p.serviceLevel, `${p.demandDays}d`].join(" · ")}
                </span>
              </button>
              <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => handleDelete(p.id)}>
                <Trash2 className="h-3 w-3 text-destructive" />
              </Button>
            </div>
          ))}
        </div>

        <div className="border-t pt-2">
          <p className="text-xs text-muted-foreground mb-1.5">{t('header.saveCurrentFilters')}</p>
          <div className="flex gap-1.5">
            <Input placeholder={t('header.presetName')} value={newName} onChange={(e) => setNewName(e.target.value)} className="h-8 text-xs flex-1" onKeyDown={(e) => e.key === "Enter" && handleSave()} maxLength={40} />
            <Button size="sm" className="h-8" onClick={handleSave} disabled={!newName.trim()}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
