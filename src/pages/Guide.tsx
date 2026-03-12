import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/lib/i18n";
import {
  BookOpen, Upload, LayoutDashboard, AlertTriangle, ShoppingCart,
  PackageX, Grid3X3, Truck, Calculator, Wallet, ChevronDown, ChevronRight,
  Target, TrendingUp, Lightbulb, FileText, Settings, ArrowRight, Zap,
  BarChart3, DollarSign, Shield, Clock, GitMerge, Columns, Activity, FolderOpen, CalendarDays,
} from "lucide-react";

interface SectionProps {
  id: string;
  icon: React.ElementType;
  title: string;
  badge?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

function Section({ id, icon: Icon, title, badge, children, defaultOpen = false }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div id={id} className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-5 py-4 hover:bg-muted/30 transition-colors text-left"
      >
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
        <Icon className="h-5 w-5 text-primary shrink-0" />
        <span className="font-semibold text-sm flex-1">{title}</span>
        {badge && <Badge variant="secondary" className="text-[10px]">{badge}</Badge>}
      </button>
      {open && (
        <div className="px-5 pb-5 pt-1 text-sm text-muted-foreground leading-relaxed space-y-3 border-t border-border">
          {children}
        </div>
      )}
    </div>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 bg-primary/5 border border-primary/20 rounded-md px-3 py-2 text-xs">
      <Lightbulb className="h-4 w-4 text-primary shrink-0 mt-0.5" />
      <span>{children}</span>
    </div>
  );
}

function KeyValue({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-2 text-xs">
      <span className="font-medium text-foreground">{label}</span>
      <span>{children}</span>
    </div>
  );
}

export default function Guide() {
  const { t, language } = useLanguage();
  const isHu = language === 'hu';

  const tocItems = [
    { id: "getting-started", label: t('guide.gettingStarted') },
    { id: "csv-format", label: t('guide.csvFormat') },
    { id: "column-mapping", label: t('guide.columnMapping') },
    { id: "append-dedup", label: t('guide.appendDedup') },
    { id: "extreme-values", label: t('guide.extremeValues') },
    { id: "overview", label: t('guide.overviewDashboard') },
    { id: "critical-skus", label: t('guide.criticalSkus') },
    { id: "reorder-list", label: t('guide.reorderList') },
    { id: "reorder-plan", label: t('guide.reorderPlan') },
    { id: "reorder-calendar", label: t('guide.reorderCalendar') },
    { id: "overstock", label: t('guide.overstockAnalysis') },
    { id: "abc-xyz", label: t('guide.abcXyzClassification') },
    { id: "suppliers", label: t('guide.suppliers') },
    { id: "cost-model", label: t('guide.costModelSettings') },
    { id: "multicurrency", label: t('guide.multicurrency') },
    { id: "projects", label: t('guide.projectReservations') },
    { id: "best-practices", label: t('guide.bestPractices') },
    { id: "glossary", label: t('guide.glossary') },
  ];

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="rounded-lg p-2.5 bg-primary/10">
            <BookOpen className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">{t('guide.title')}</h1>
            <p className="text-sm text-muted-foreground">{t('guide.subtitle')}</p>
          </div>
        </div>
      </div>

      {/* Table of Contents */}
      <div className="bg-muted/30 border border-border rounded-lg p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">{t('guide.toc')}</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
          {tocItems.map((item) => (
            <a key={item.id} href={`#${item.id}`} className="text-xs text-primary hover:underline flex items-center gap-1">
              <ArrowRight className="h-3 w-3" />
              {item.label}
            </a>
          ))}
        </div>
      </div>

      {/* SECTIONS */}
      <div className="space-y-3">
        {/* Getting Started */}
        <Section id="getting-started" icon={Upload} title={t('guide.gettingStarted')} badge={isHu ? "Kezdd itt" : "Start Here"} defaultOpen>
          <p>{isHu ? "Az InventoryPRO egy böngészőalapú készletkezelő eszköz B2B forgalmazók számára. CSV fájlokból elemzi az értékesítési és készletadatokat, keresletvezérelt készletszinteket számol, osztályozza a tételeket, és beszerzési javaslatokat generál." : "InventoryPRO is a browser-based inventory management tool for B2B distributors. It analyzes your sales and stock data from CSV files to calculate demand-driven stocking levels, classify items, and generate purchase recommendations."}</p>
          <div className="space-y-1">
            <p className="font-medium text-foreground">{isHu ? "Gyors indulás (3 lépés):" : "Quick Start (3 steps):"}</p>
            <ol className="list-decimal list-inside space-y-1 ml-2">
              <li><strong>{isHu ? "CSV feltöltése" : "Upload CSV"}</strong> — {isHu ? "Húzd a fájlt a kezdőoldalra. A rendszer automatikusan felismeri az oszlopokat." : "Drop your export file on the home page. The system auto-detects columns."}</li>
              <li><strong>{isHu ? "Áttekintés ellenőrzése" : "Review Overview"}</strong> — {isHu ? "Ellenőrizd a KPI kártyákat és az adatminőségi mutatókat." : "Check KPI cards and data quality indicators."}</li>
              <li><strong>{isHu ? "Rendelések kezelése" : "Act on Reorders"}</strong> — {isHu ? "Menj a Rendelési Listára, hagyd jóvá a javaslatokat, és exportáld a megrendelést." : "Go to Reorder List, approve suggestions, and export your purchase order."}</li>
            </ol>
          </div>
          <Tip>{isHu ? "Az adataid a böngészőben maradnak — semmi sem kerül szerverhez. Az adatok törléséhez töröld az oldal adatait a böngésző beállításaiban (vagy DevTools → Application → IndexedDB → Adatbázis törlése)." : "Your data stays in-browser — nothing is sent to any server. To clear all data, delete site data in your browser settings (or use DevTools → Application → IndexedDB → Delete database)."}</Tip>
          <div className="space-y-1">
            <p className="font-medium text-foreground">{isHu ? "Adattárolás:" : "Data Persistence:"}</p>
            <p>{isHu ? "Az InventoryPRO az utolsó importot az IndexedDB-ben (böngésző tárhely) tárolja. A Költségmodell beállítások, EOQ paraméterek, készlet felülírások és FX árfolyamok szintén megőrződnek munkamenetek között. Használd a Projektek oldalt készlet foglaláshoz." : "InventoryPRO stores your last import in IndexedDB (browser storage). Cost Model settings, EOQ parameters, stock overrides, and FX rates are also persisted across sessions. Use the Projects page to reserve stock for customer orders and track fulfillment status."}</p>
          </div>
        </Section>

        {/* CSV Format */}
        <Section id="csv-format" icon={FileText} title={`${t('guide.csvFormat')} & ${t('guide.columnMapping')}`} badge={isHu ? "Fontos" : "Important"}>
          <p>{isHu ? "A rendszer az alábbi oszlopokat tartalmazó CSV fájlokat fogad el. Az oszlopneveket kis-nagybetű különbség nélkül, kétnyelvű alias támogatással (angol / magyar) illeszti." : "The system accepts CSV files with the following columns. Column names are matched case-insensitively with bilingual alias support (English / Hungarian)."}</p>
          <div className="space-y-1">
            <p className="font-medium text-foreground">{isHu ? "Alaposzlopok (teljes elemzéshez szükséges):" : "Core Columns (required for full analysis):"}</p>
            <div className="bg-muted/50 rounded-md p-3 font-mono text-[11px] space-y-0.5">
              <KeyValue label="sku">{isHu ? "Egyedi termékazonosító" : "Unique product identifier"}</KeyValue>
              <KeyValue label="sku_name">{isHu ? "Olvasható terméknév" : "Human-readable product name"}</KeyValue>
              <KeyValue label="supplier">{isHu ? "Beszállító/szállító neve" : "Supplier/vendor name"}</KeyValue>
              <KeyValue label="category">{isHu ? "Termékkategória" : "Product category"}</KeyValue>
              <KeyValue label="date">{isHu ? "Tranzakció dátuma — automatikusan felismert. Támogatott: YYYY-MM-DD, DD.MM.YYYY, YYYY.MM.DD, DD/MM/YYYY, MM/DD/YYYY" : "Transaction date — auto-detected. Supports: YYYY-MM-DD, DD.MM.YYYY, YYYY.MM.DD, DD/MM/YYYY, and MM/DD/YYYY"}</KeyValue>
              <KeyValue label="partner_id">{isHu ? "Vevő/partner azonosító" : "Customer/partner identifier"}</KeyValue>
              <KeyValue label="sold_qty">{isHu ? "Eladott mennyiség ebben a tranzakcióban" : "Quantity sold in this transaction"}</KeyValue>
              <KeyValue label="unit_price">{isHu ? "Eladási egységár (€)" : "Selling price per unit (€)"}</KeyValue>
              <KeyValue label="stock_qty">{isHu ? "Aktuális készlet" : "Current stock on hand"}</KeyValue>
              <KeyValue label="lead_time_days">{isHu ? "Beszállítói szállítási idő napokban" : "Supplier lead time in days"}</KeyValue>
              <KeyValue label="ordered_qty">{isHu ? "Jelenleg rendelt mennyiség" : "Quantity currently on order"}</KeyValue>
              <KeyValue label="expected_delivery_date">{isHu ? "Várható szállítási dátum" : "Expected delivery date"}</KeyValue>
            </div>
          </div>
          <Tip>{isHu ? 'Nem minden oszlop szükséges. A rendszer "fokozatos degradálás" modellt használ — az elérhető adatok alapján engedélyezi a funkciókat.' : 'Not all columns are required. The system uses a "graceful degradation" model — it enables features based on available data.'}</Tip>
        </Section>

        {/* Column Mapping */}
        <Section id="column-mapping" icon={Columns} title={t('guide.columnMapping')}>
          <p>{isHu ? "Ha a CSV-d nem szabványos oszlopneveket használ (pl. az ERP-d \"Item Code\"-ot exportál \"sku\" helyett), a rendszer automatikusan megnyitja az Oszlop Leképezés párbeszédablakot." : "If your CSV uses non-standard column names (e.g. your ERP exports \"Item Code\" instead of \"sku\"), the system automatically opens the Column Mapping dialog instead of rejecting the file."}</p>
          <Tip>{isHu ? "Kihagyhatsz opcionális mezőket (mint beszállító vagy kategória) a leképezőben — a rendszer alapértelmezett értékeket használ és az importálás sikeres lesz." : "You can skip optional fields (like supplier or category) in the mapper — the system will use default values and still import successfully."}</Tip>
        </Section>

        {/* Append & Deduplication */}
        <Section id="append-dedup" icon={GitMerge} title={t('guide.appendDedup')}>
          <p>{isHu ? "Használd a CSV hozzáfűzés funkciót (az első betöltés után elérhető) egy új export összefésüléséhez a meglévő adatokkal — pl. ez havi eladások hozzáadása az előző havihoz." : "Use Append File (available after initial load) to merge a new export into your existing dataset — for example, adding this month's sales to last month's data."}</p>
        </Section>

        {/* Extreme Value Detection */}
        <Section id="extreme-values" icon={Activity} title={t('guide.extremeValues')}>
          <p>{isHu ? "Importálás során a rendszer automatikusan keres szokatlanul magas sold_qty értékű sorokat — 4 szórásnál nagyobb az átlagtól." : "During import, the system automatically scans for rows with unusually high sold_qty values — more than 4 standard deviations above the mean."}</p>
        </Section>

        {/* Overview Dashboard */}
        <Section id="overview" icon={LayoutDashboard} title={t('guide.overviewDashboard')}>
          <p>{isHu ? "Az irányítópult madártávlatból mutatja a készlet állapotát valós idejű KPI kártyákkal, osztályozási mátrixszal és adatminőségi mutatókkal." : "The dashboard provides a bird's-eye view of your inventory health with real-time KPI cards, classification matrix, and data quality indicators."}</p>
          <Tip>{isHu ? "Használd a globális szűrőket (felső sáv) beszállító, kategória vagy ABC osztály szerinti szeleteléshez, majd ellenőrizd az Áttekintést." : "Use the global filters (top bar) to slice by supplier, category, or ABC class, then check the Overview to see how metrics change for that segment."}</Tip>
        </Section>

        {/* Critical SKUs */}
        <Section id="critical-skus" icon={AlertTriangle} title={t('guide.criticalSkus')}>
          <p>{isHu ? "Felsorolja az összes tételt, ahol effective_stock ≤ reorder_point. Ezeknél a tételeknél kifogyási veszély áll fenn és azonnali intézkedés szükséges." : "Lists all items where effective_stock ≤ reorder_point. These items risk stockouts and need immediate action."}</p>
          <Tip>{isHu ? "Fókuszálj a KRITIKUS sürgősségű + Emelkedő trendű tételekre — ezeknél a legvalószínűbb a kifogyás." : "Focus on items with \"CRITICAL\" urgency and \"Rising\" trend first — these are most likely to cause a stockout."}</Tip>
        </Section>

        {/* Reorder List */}
        <Section id="reorder-list" icon={ShoppingCart} title={t('guide.reorderList')}>
          <p>{isHu ? "A fő beszerzési munkalap. Megmutatja az összes tételt, ahol a kiválasztott rendelési stratégia rendelést javasol, javasolt mennyiségekkel és jóváhagyási munkafolyamattal." : "The main purchasing worksheet. Shows all items where the selected reorder strategy recommends placing an order, with suggested quantities and approval workflow."}</p>
          <div className="space-y-1">
            <p className="font-medium text-foreground">{isHu ? "Rendelési stratégiák:" : "Reorder Strategies:"}</p>
            <div className="space-y-0.5 text-xs">
              <KeyValue label="ROP">{isHu ? "Rendelés, amikor a készlet a biztonsági készlet + szállítási idő kereslet alá csökken." : "Order when stock drops below safety stock + lead time demand."}</KeyValue>
              <KeyValue label="EOQ (Wilson)">{isHu ? "Gazdaságos rendelési mennyiség — minimalizálja a rendelési + tartási költséget." : "Economic Order Quantity — minimizes total cost of ordering + holding."}</KeyValue>
              <KeyValue label="Min/Max">{isHu ? "Készlet fenntartása minimum (ROP) és maximum (2×ROP) szintek között." : "Maintains stock between minimum (ROP) and maximum (2×ROP) levels."}</KeyValue>
              <KeyValue label={isHu ? "Periodikus" : "Periodic Review"}>{isHu ? "Időalapú rendelés. A felülvizsgálati periódus + szállítási idő fedezéséhez szükséges mennyiséget számol." : "Time-based ordering. Calculates quantity to cover review period plus lead time."}</KeyValue>
            </div>
          </div>
          <Tip>{isHu ? "SKU-szintű stratégia felülírás a táblázat legördülő menüjével. A felülírások mentődnek a böngésző tárhelyre." : "You can override the strategy per-SKU using the dropdown in the table. Overrides are saved in browser storage and persist across sessions."}</Tip>
        </Section>

        {/* Reorder Plan */}
        <Section id="reorder-plan" icon={Wallet} title={`${t('guide.reorderPlan')} (${isHu ? "Költségvetési Optimalizáló" : "Budget Optimizer"})`}>
          <p>{isHu ? "Költségvetési korláton belül priorizálja a rendelési javaslatokat. Használd a csúszkát, hogy megtudd, mely tételeket rendeld meg először prioritási pontszám alapján." : "Prioritizes reorder suggestions within a budget constraint. Use the budget slider to see which items to order first based on a priority score."}</p>
          <Tip>{isHu ? "Állítsd a csúszkát a tényleges beszerzési költségvetésedre. A terv automatikusan kiválasztja a legmagasabb prioritású tételeket." : "Set the budget slider to your actual purchasing budget. The plan auto-selects items in priority order until the budget is exhausted."}</Tip>
        </Section>

        {/* Reorder Calendar */}
        <Section id="reorder-calendar" icon={CalendarDays} title={t('guide.reorderCalendar')}>
          <p>{isHu ? "Havi naptár nézet, amely megmutatja, mikor kell leadni a megrendeléseket az aktuális készletszintek, átlagos napi kereslet és szállítási idők alapján." : "A monthly calendar view that shows when purchase orders need to be placed, based on current stock levels, average daily demand, and supplier lead times."}</p>
          <Tip>{isHu ? "Használd a naptárt minden hét elején a Kritikus és Figyelmeztetés rendelések azonosításához." : "Use the calendar at the start of each week to identify Critical and Warning orders that must be placed immediately."}</Tip>
        </Section>

        {/* Overstock */}
        <Section id="overstock" icon={PackageX} title={t('guide.overstockAnalysis')}>
          <p>{isHu ? "Azonosítja a felesleges készletű tételeket (>180 napi készlet) és a holt készletet (nulla eladás). Segít felszabadítani a raktárkapacitást és a forgótőkét." : "Identifies items with excess inventory (>180 days of stock) and dead stock (zero sales). Helps free up warehouse space and working capital."}</p>
          <Tip>{isHu ? "A holt készlet tételek a legerősebb jelöltek felszámolásra, beszállítónak való visszárunak, vagy leírásra." : "Dead stock items are the strongest candidates for liquidation, returns to supplier, or write-offs."}</Tip>
        </Section>

        {/* ABC-XYZ */}
        <Section id="abc-xyz" icon={Grid3X3} title={t('guide.abcXyzClassification')}>
          <p>{isHu ? "Kettős osztályozási rendszer, amely kombinálja a bevételi fontosságot (ABC) a kereslet kiszámíthatósággal (XYZ)." : "Dual classification system that combines revenue importance (ABC) with demand predictability (XYZ)."}</p>
          <div className="space-y-1">
            <p className="font-medium text-foreground">{isHu ? "ABC Osztályozás (Bevétel alapú):" : "ABC Classification (Revenue-based):"}</p>
            <div className="space-y-0.5 text-xs">
              <KeyValue label="A">{isHu ? "Felső 80% bevétel — a létfontosságú kevés" : "Top 80% of cumulative revenue — your vital few items"}</KeyValue>
              <KeyValue label="B">{isHu ? "Következő 15% (80-95%) — közepes fontosság" : "Next 15% of revenue (80-95%) — moderate importance"}</KeyValue>
              <KeyValue label="C">{isHu ? "Maradék 5% — sok tétel kis egyéni hatással" : "Remaining 5% — many items with small individual impact"}</KeyValue>
            </div>
          </div>
          <Tip>{isHu ? "Módosíthatod az ABC/XYZ küszöbértékeket az Osztályozási Beállításokban." : "You can adjust the ABC/XYZ thresholds in the Classification Settings panel."}</Tip>
        </Section>

        {/* Suppliers */}
        <Section id="suppliers" icon={Truck} title={t('guide.suppliers')}>
          <p>{isHu ? "Aggregált nézet a beszállítói bázisról: SKU szám, összesített bevétel, rendelési értékek és teljesítménymutatók beszállítónként." : "Aggregated view of your supplier base showing SKU counts, total revenue, reorder values, and performance metrics per supplier."}</p>
          <Tip>{isHu ? "Kattints egy beszállítói sorra a részletes SKU lista kibontásához. Használd beszállító-specifikus megrendelések készítéséhez." : "Click on a supplier row to expand and see the detailed SKU list. Use this to prepare supplier-specific purchase orders."}</Tip>
        </Section>

        {/* Cost Model */}
        <Section id="cost-model" icon={Calculator} title={t('guide.costModelSettings')}>
          <p>{isHu ? "Konfiguráld az EOQ számításokat, biztonsági készletszinteket és rendelési optimalizálást vezérlő költségparamétereket. Minden szakasz önállóan ki/bekapcsolható." : "Configure the cost parameters that drive EOQ calculations, safety stock levels, and reorder optimization. Each section can be toggled on/off independently."}</p>
          <Tip>{isHu ? "Kezdd az alapértelmezettekkel és fokozatosan finomítsd. A legnagyobb hatást általában a pontos szállítási idők (adatok) adják, nem a költségmodell paraméterek." : "Start with defaults and fine-tune gradually. The biggest impact usually comes from accurate lead times (data) rather than cost model parameters."}</Tip>
        </Section>

        {/* Multi-Currency */}
        <Section id="multicurrency" icon={DollarSign} title={t('guide.multicurrency')}>
          <p>{isHu ? "Az InventoryPRO támogatja a vegyes pénznemű beszerzést (EUR/USD) HUF eladási árakkal. Minden jelentés EUR-ra normalizálva, élő ECB árfolyamokkal." : "InventoryPRO supports mixed-currency purchasing (EUR/USD) with HUF selling prices. All reporting is normalized to EUR using live ECB exchange rates with 24-hour caching."}</p>
          <Tip>{isHu ? "Figyelj a negatív árrésekre (pirossal jelölve) — ezek gyakran elavult árazási adatokat vagy kedvezőtlen FX mozgásokat jeleznek." : "Watch for negative margins (shown in red) — these often indicate stale pricing data or unfavorable FX movements."}</Tip>
        </Section>

        {/* Projects */}
        <Section id="projects" icon={FolderOpen} title={t('guide.projectReservations')}>
          <p>{isHu ? "A Projektek oldal lehetővé teszi készlet foglalását meghatározott vevői rendelésekhez vagy projektekhez szállítás előtt. A foglalt mennyiségek levonódnak az available_qty-ból minden számításban." : "The Projects page lets you reserve stock for specific customer orders or projects before they ship. Reserved quantities are deducted from available_qty in all calculations."}</p>
          <Tip>{isHu ? "Ha egy foglalás negatív elérhető készletet okozna, figyelmeztetés jelenik meg — hasznos, ha a hiányt rendeléssel tervezed fedezni." : "If a reservation would cause negative available stock, a warning is shown — useful when you plan to reorder to cover the shortfall."}</Tip>
        </Section>

        {/* Best Practices */}
        <Section id="best-practices" icon={Shield} title={t('guide.bestPractices')}>
          <div className="space-y-3">
            <div className="space-y-1">
              <p className="font-medium text-foreground flex items-center gap-2"><Zap className="h-3.5 w-3.5 text-primary" /> {isHu ? "Adatminőség" : "Data Quality"}</p>
              <ul className="list-disc list-inside space-y-0.5 ml-2 text-xs">
                <li>{isHu ? "Exportálj legalább 6 havi értékesítési előzményt a megbízható kereslet elemzéshez" : "Export at least 6 months of sales history for reliable demand analysis"}</li>
                <li>{isHu ? "Biztosítsd a konzisztens SKU kódokat az exportok között" : "Ensure consistent SKU codes across exports"}</li>
                <li>{isHu ? "Add meg a lead_time_days-t amikor lehetséges — nélküle a rendelési számítások nem működnek" : "Include lead_time_days whenever possible — without it, reorder calculations are disabled"}</li>
              </ul>
            </div>
            <div className="space-y-1">
              <p className="font-medium text-foreground flex items-center gap-2"><BarChart3 className="h-3.5 w-3.5 text-primary" /> {isHu ? "Munkafolyamat" : "Workflow"}</p>
              <ul className="list-disc list-inside space-y-0.5 ml-2 text-xs">
                <li>{isHu ? "Heti: friss adat feltöltés → Kritikus SKU-k áttekintése → rendelések jóváhagyása → PO exportálás" : "Run weekly: upload fresh data → review Critical SKUs → approve reorders → export PO"}</li>
                <li>{isHu ? "Havi: Túlkészlet áttekintése → Költségmodell módosítása → ABC változások elemzése" : "Run monthly: review Overstock → adjust Cost Model → analyze ABC shifts"}</li>
              </ul>
            </div>
            <div className="space-y-1">
              <p className="font-medium text-foreground flex items-center gap-2"><Target className="h-3.5 w-3.5 text-primary" /> {isHu ? "Stratégia választás" : "Strategy Selection"}</p>
              <ul className="list-disc list-inside space-y-0.5 ml-2 text-xs">
                <li><strong>ROP</strong> — {isHu ? "Legjobb a legtöbb tételhez. Egyszerű, hatékony." : "Best for most items. Simple, effective, low maintenance."}</li>
                <li><strong>EOQ</strong> — {isHu ? "Legjobb A osztályú, stabil keresletű tételekhez jelentős rendelési költséggel." : "Best for Class A items with stable demand and significant ordering costs."}</li>
                <li><strong>Min/Max</strong> — {isHu ? "Legjobb minimum rendelési korláttal vagy változó keresletű tételekhez." : "Best for items with min-order constraints or variable demand."}</li>
                <li><strong>{isHu ? "Periodikus" : "Periodic"}</strong> — {isHu ? "Legjobb fix ütemezésű beszállítói rendelésekhez." : "Best when you order from a supplier on a fixed schedule."}</li>
              </ul>
            </div>
          </div>
        </Section>

        {/* Glossary */}
        <Section id="glossary" icon={BookOpen} title={t('guide.glossary')}>
          <div className="space-y-1 text-xs">
            <KeyValue label={isHu ? "Átl. napi kereslet" : "Avg Daily Demand"}>{isHu ? "Napi átlagos eladott egységek az elemzési periódusban" : "Average units sold per day across the analysis period"}</KeyValue>
            <KeyValue label="CV">{isHu ? "Szórás ÷ átlag havi keresletből — kiszámíthatóságot mér" : "Standard deviation ÷ mean of monthly demand — measures predictability"}</KeyValue>
            <KeyValue label={isHu ? "Készlet napjai" : "Days of Stock"}>{isHu ? "Aktuális készlet ÷ napi átlagos kereslet — hány nap van kifogyásig" : "Current stock ÷ avg daily demand — how many days until stockout"}</KeyValue>
            <KeyValue label={isHu ? "Holt készlet" : "Dead Stock"}>{isHu ? "Tételek nulla eladással az egész adatsorban" : "Items with zero sales in the entire dataset"}</KeyValue>
            <KeyValue label={isHu ? "Effektív készlet" : "Effective Stock"}>{isHu ? "Tényleges készlet + rendelt menny. − foglalt menny." : "Stock on hand + ordered qty − reserved qty"}</KeyValue>
            <KeyValue label="EOQ">{isHu ? "Gazdaságos Rendelési Mennyiség — a teljes készletköltséget minimalizáló rendelési méret" : "Economic Order Quantity — order size that minimizes total inventory cost"}</KeyValue>
            <KeyValue label={isHu ? "Szállítási idő" : "Lead Time"}>{isHu ? "Napok a rendelés leadása és beérkezése között" : "Days between placing and receiving an order from supplier"}</KeyValue>
            <KeyValue label={isHu ? "Rendelési pont" : "Reorder Point"}>{isHu ? "Biztonsági készlet + (napi átl. kereslet × szállítási idő) — rendelési küszöb" : "Safety stock + (avg daily demand × lead time) — trigger level for ordering"}</KeyValue>
            <KeyValue label={isHu ? "Biztonsági készlet" : "Safety Stock"}>{isHu ? "Puffer készlet a kereslet változékonyság ellen a szállítási idő alatt" : "Buffer stock to protect against demand variability during lead time"}</KeyValue>
            <KeyValue label={isHu ? "Szervizszint" : "Service Level"}>{isHu ? "Cél-valószínűség a kifogyás elkerülésére (pl. 95% = 5% kifogyási kockázat)" : "Target probability of not stocking out (e.g., 95% means 5% stockout risk)"}</KeyValue>
            <KeyValue label={isHu ? "Lekötött tőke" : "Tied-up Capital"}>{isHu ? "Felesleges készlet értéke a normál szükségleten felül — alternatív költség" : "Value of excess stock beyond normal needs — opportunity cost"}</KeyValue>
          </div>
        </Section>
      </div>

      {/* Footer */}
      <div className="text-center text-xs text-muted-foreground py-6 border-t border-border">
        <p>InventoryPRO — {isHu ? "Keresletvezérelt készletkezelés B2B forgalmazóknak" : "Demand-driven inventory management for B2B distributors"}</p>
        <p className="mt-1">{isHu ? "Minden adat helyben, a böngészőben kerül feldolgozásra. Semmi nem kerül külső szerverhez." : "All data is processed locally in your browser. No data is sent to external servers."}</p>
      </div>
    </div>
  );
}
