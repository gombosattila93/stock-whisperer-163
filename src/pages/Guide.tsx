import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  BookOpen, Upload, LayoutDashboard, AlertTriangle, ShoppingCart,
  PackageX, Grid3X3, Truck, Calculator, Wallet, ChevronDown, ChevronRight,
  Target, TrendingUp, Lightbulb, FileText, Settings, ArrowRight, Zap,
  BarChart3, DollarSign, Shield, Clock,
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

const tocItems = [
  { id: "getting-started", label: "Getting Started" },
  { id: "csv-format", label: "CSV Format" },
  { id: "overview", label: "Overview Dashboard" },
  { id: "critical-skus", label: "Critical SKUs" },
  { id: "reorder-list", label: "Reorder List" },
  { id: "reorder-plan", label: "Reorder Plan" },
  { id: "overstock", label: "Overstock Analysis" },
  { id: "abc-xyz", label: "ABC-XYZ Classification" },
  { id: "suppliers", label: "Suppliers" },
  { id: "cost-model", label: "Cost Model" },
  { id: "multicurrency", label: "Multi-Currency" },
  { id: "best-practices", label: "Best Practices" },
  { id: "glossary", label: "Glossary" },
];

export default function Guide() {
  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="rounded-lg p-2.5 bg-primary/10">
            <BookOpen className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">InventoryPRO User Guide</h1>
            <p className="text-sm text-muted-foreground">
              Complete reference for managing inventory, reorder points, and demand classification.
            </p>
          </div>
        </div>
      </div>

      {/* Table of Contents */}
      <div className="bg-muted/30 border border-border rounded-lg p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Table of Contents</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
          {tocItems.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              <ArrowRight className="h-3 w-3" />
              {item.label}
            </a>
          ))}
        </div>
      </div>

      {/* SECTIONS */}
      <div className="space-y-3">
        {/* Getting Started */}
        <Section id="getting-started" icon={Upload} title="Getting Started" badge="Start Here" defaultOpen>
          <p>InventoryPRO is a browser-based inventory management tool for B2B distributors. It analyzes your sales and stock data from CSV files to calculate demand-driven stocking levels, classify items, and generate purchase recommendations.</p>
          <div className="space-y-1">
            <p className="font-medium text-foreground">Quick Start (3 steps):</p>
            <ol className="list-decimal list-inside space-y-1 ml-2">
              <li><strong>Upload CSV</strong> — Drop your export file on the home page. The system auto-detects columns.</li>
              <li><strong>Review Overview</strong> — Check KPI cards and data quality indicators.</li>
              <li><strong>Act on Reorders</strong> — Go to Reorder List, approve suggestions, and export your purchase order.</li>
            </ol>
          </div>
          <Tip>Your data stays in-browser — nothing is sent to any server. Refresh the page to clear all data, or use Projects to save/load snapshots.</Tip>
          <div className="space-y-1">
            <p className="font-medium text-foreground">Data Persistence:</p>
            <p>InventoryPRO stores your last import in browser local storage. Cost Model settings, EOQ parameters, and SKU strategy overrides are also persisted across sessions. Use the <strong>Projects</strong> page to save named snapshots for different product lines or time periods.</p>
          </div>
        </Section>

        {/* CSV Format */}
        <Section id="csv-format" icon={FileText} title="CSV Format & Column Mapping" badge="Important">
          <p>The system accepts CSV files with the following columns. Column names are matched case-insensitively with bilingual alias support (English / Hungarian).</p>
          <div className="space-y-1">
            <p className="font-medium text-foreground">Core Columns (required for full analysis):</p>
            <div className="bg-muted/50 rounded-md p-3 font-mono text-[11px] space-y-0.5">
              <KeyValue label="sku">Unique product identifier</KeyValue>
              <KeyValue label="sku_name">Human-readable product name</KeyValue>
              <KeyValue label="supplier">Supplier/vendor name</KeyValue>
              <KeyValue label="category">Product category</KeyValue>
              <KeyValue label="date">Transaction date (YYYY-MM-DD or DD/MM/YYYY)</KeyValue>
              <KeyValue label="partner_id">Customer/partner identifier</KeyValue>
              <KeyValue label="sold_qty">Quantity sold in this transaction</KeyValue>
              <KeyValue label="unit_price">Selling price per unit (€)</KeyValue>
              <KeyValue label="stock_qty">Current stock on hand</KeyValue>
              <KeyValue label="lead_time_days">Supplier lead time in days</KeyValue>
              <KeyValue label="ordered_qty">Quantity currently on order</KeyValue>
              <KeyValue label="expected_delivery_date">Expected delivery date</KeyValue>
            </div>
          </div>
          <Tip>Not all columns are required. The system uses a "graceful degradation" model — it enables features based on available data. For example, stock_qty alone enables basic stock monitoring, while adding sold_qty + date enables demand analysis.</Tip>
          <div className="space-y-1">
            <p className="font-medium text-foreground">Data Quality Tiers:</p>
            <div className="space-y-0.5 text-xs">
              <KeyValue label="Complete">All columns present — full analysis enabled</KeyValue>
              <KeyValue label="Partial">Missing some non-critical columns</KeyValue>
              <KeyValue label="Stock Only">Only stock data — no demand analysis</KeyValue>
              <KeyValue label="Sales Only">Only sales history — no stock monitoring</KeyValue>
              <KeyValue label="Minimal">Very limited data — basic listing only</KeyValue>
            </div>
          </div>
          <div className="space-y-1">
            <p className="font-medium text-foreground">Optional Pricing Columns (for multi-currency):</p>
            <div className="bg-muted/50 rounded-md p-3 font-mono text-[11px] space-y-0.5">
              <KeyValue label="selling_price_huf">Selling price in Hungarian Forints</KeyValue>
              <KeyValue label="purchase_currency">Purchase currency: USD or EUR</KeyValue>
              <KeyValue label="purchase_price_1..8">Tiered purchase prices (up to 8 breaks)</KeyValue>
              <KeyValue label="purchase_qty_1..8">Minimum quantities for each price break</KeyValue>
            </div>
          </div>
          <Tip>If your ERP exports Hungarian column names (e.g., "elad_ar" for selling price, "beszerzesi_ar" for purchase price), the system recognizes these automatically.</Tip>
        </Section>

        {/* Overview Dashboard */}
        <Section id="overview" icon={LayoutDashboard} title="Overview Dashboard">
          <p>The dashboard provides a bird's-eye view of your inventory health with real-time KPI cards, classification matrix, and data quality indicators.</p>
          <div className="space-y-1">
            <p className="font-medium text-foreground">KPI Cards:</p>
            <div className="space-y-0.5 text-xs">
              <KeyValue label="Total SKUs">Number of unique products in the filtered dataset</KeyValue>
              <KeyValue label="Critical Items">SKUs below their reorder point that need immediate attention</KeyValue>
              <KeyValue label="Reorder Suggested">Total items where the system recommends placing an order</KeyValue>
              <KeyValue label="Overstock Items">Items with more than 180 days of stock coverage</KeyValue>
              <KeyValue label="Dead Stock">Items with zero sales in the analysis period</KeyValue>
            </div>
          </div>
          <div className="space-y-1">
            <p className="font-medium text-foreground">ABC-XYZ Matrix:</p>
            <p>The 3×3 matrix shows item distribution across revenue (ABC) and demand stability (XYZ) classes. Cells are color-coded: green = high-value stable items, red = low-value unpredictable items.</p>
          </div>
          <Tip>Use the global filters (top bar) to slice by supplier, category, or ABC class, then check the Overview to see how metrics change for that segment.</Tip>
          <div className="space-y-1">
            <p className="font-medium text-foreground">Financial Summary (when pricing data available):</p>
            <p>Shows total inventory value, weighted average margin, items with negative margins, and currency distribution.</p>
          </div>
        </Section>

        {/* Critical SKUs */}
        <Section id="critical-skus" icon={AlertTriangle} title="Critical SKUs">
          <p>Lists all items where <code className="text-xs bg-muted px-1 rounded">effective_stock ≤ reorder_point</code>. These items risk stockouts and need immediate action.</p>
          <div className="space-y-1">
            <p className="font-medium text-foreground">Key Columns:</p>
            <div className="space-y-0.5 text-xs">
              <KeyValue label="Effective Stock">current stock + ordered qty − reserved qty</KeyValue>
              <KeyValue label="Reorder Point">safety stock + (avg daily demand × lead time)</KeyValue>
              <KeyValue label="Days of Stock">current stock ÷ avg daily demand</KeyValue>
              <KeyValue label="Urgency">CRITICAL (≤3 days), LOW (≤7 days), or MEDIUM</KeyValue>
              <KeyValue label="Trend">↑ Rising, → Stable, or ↓ Declining demand trend</KeyValue>
            </div>
          </div>
          <Tip>Focus on items with "CRITICAL" urgency and "Rising" trend first — these are most likely to cause a stockout. Items with declining trends may self-resolve.</Tip>
          <div className="space-y-1">
            <p className="font-medium text-foreground">Inline Editing:</p>
            <p>Click any editable cell (stock_qty, lead_time_days) to update values in-place. Changes recalculate all derived metrics immediately.</p>
          </div>
        </Section>

        {/* Reorder List */}
        <Section id="reorder-list" icon={ShoppingCart} title="Reorder List">
          <p>The main purchasing worksheet. Shows all items where the selected reorder strategy recommends placing an order, with suggested quantities and approval workflow.</p>
          <div className="space-y-1">
            <p className="font-medium text-foreground">Reorder Strategies:</p>
            <div className="space-y-0.5 text-xs">
              <KeyValue label="Reorder Point (ROP)">Order when stock drops below safety stock + lead time demand. Default strategy. Order qty = 2×ROP − effective stock, rounded to nearest 10.</KeyValue>
              <KeyValue label="EOQ (Wilson)">Economic Order Quantity — minimizes total cost of ordering + holding. Requires ordering cost and holding cost % settings.</KeyValue>
              <KeyValue label="Min/Max">Maintains stock between minimum (ROP) and maximum (3×ROP) levels. Order qty = max level − effective stock.</KeyValue>
              <KeyValue label="Periodic Review">Time-based ordering. Calculates quantity needed to cover the review period plus lead time.</KeyValue>
            </div>
          </div>
          <Tip>You can override the strategy per-SKU using the dropdown in the table. Overrides are saved in browser storage and persist across sessions.</Tip>
          <div className="space-y-1">
            <p className="font-medium text-foreground">Approval Workflow:</p>
            <p>Check items to approve them for ordering. Use "Approve All" for bulk approval. Export only approved items to generate your purchase order CSV.</p>
          </div>
          <div className="space-y-1">
            <p className="font-medium text-foreground">Lead Time Override:</p>
            <p>Use the quick input field to adjust lead times for specific SKUs. This immediately recalculates the reorder point and suggested quantities.</p>
          </div>
        </Section>

        {/* Reorder Plan */}
        <Section id="reorder-plan" icon={Wallet} title="Reorder Plan (Budget Optimizer)">
          <p>Prioritizes reorder suggestions within a budget constraint. Use the budget slider to see which items to order first based on a priority score that weighs urgency, ABC class, demand trend, and stockout risk.</p>
          <div className="space-y-1">
            <p className="font-medium text-foreground">Priority Score Formula:</p>
            <p className="text-xs">
              The score combines: Urgency weight (Critical=100, Low=70, Medium=40) + ABC bonus (A=30, B=15) + Trend bonus (Rising=20, Stable=10) + Stockout proximity (days_of_stock &lt; lead_time = +25).
            </p>
          </div>
          <Tip>Set the budget slider to your actual purchasing budget. The plan auto-selects items in priority order until the budget is exhausted, giving you the highest-impact order list for your money.</Tip>
          <div className="space-y-1">
            <p className="font-medium text-foreground">Key Metrics:</p>
            <div className="space-y-0.5 text-xs">
              <KeyValue label="Budget Fill %">How much of the budget is used by approved items</KeyValue>
              <KeyValue label="Items Covered">Number of reorder items that fit within budget</KeyValue>
              <KeyValue label="Remaining Budget">Available budget after approved items</KeyValue>
            </div>
          </div>
        </Section>

        {/* Overstock */}
        <Section id="overstock" icon={PackageX} title="Overstock Analysis">
          <p>Identifies items with excess inventory (&gt;180 days of stock) and dead stock (zero sales). Helps free up warehouse space and working capital.</p>
          <div className="space-y-1">
            <p className="font-medium text-foreground">Two Categories:</p>
            <div className="space-y-0.5 text-xs">
              <KeyValue label="Overstock">{"Items with >180 days of coverage but some demand exists"}</KeyValue>
              <KeyValue label="Dead Stock">Items with zero sales in the entire dataset period — no demand signal</KeyValue>
            </div>
          </div>
          <div className="space-y-1">
            <p className="font-medium text-foreground">Tied-up Capital:</p>
            <p>Calculated as excess_qty × effective_purchase_price_eur. When multi-currency pricing data is available, this uses the actual purchase prices instead of selling prices.</p>
          </div>
          <Tip>{"Dead stock items are the strongest candidates for liquidation, returns to supplier, or write-offs. Consider offering bundle deals or aggressive discounts for items that have been dead stock for >6 months."}</Tip>
        </Section>

        {/* ABC-XYZ */}
        <Section id="abc-xyz" icon={Grid3X3} title="ABC-XYZ Classification">
          <p>Dual classification system that combines revenue importance (ABC) with demand predictability (XYZ).</p>
          <div className="space-y-1">
            <p className="font-medium text-foreground">ABC Classification (Revenue-based):</p>
            <div className="space-y-0.5 text-xs">
              <KeyValue label="Class A">Top 80% of cumulative revenue — your vital few items</KeyValue>
              <KeyValue label="Class B">Next 15% of revenue (80-95%) — moderate importance</KeyValue>
              <KeyValue label="Class C">Remaining 5% — many items with small individual impact</KeyValue>
            </div>
          </div>
          <div className="space-y-1">
            <p className="font-medium text-foreground">XYZ Classification (Variability-based):</p>
            <div className="space-y-0.5 text-xs">
              <KeyValue label="Class X">Coefficient of Variation (CV) &lt; 0.5 — stable, predictable demand</KeyValue>
              <KeyValue label="Class Y">CV between 0.5 and 1.0 — somewhat variable demand</KeyValue>
              <KeyValue label="Class Z">CV &gt; 1.0 — highly erratic, hard to forecast</KeyValue>
            </div>
          </div>
          <div className="space-y-1">
            <p className="font-medium text-foreground">Recommended Strategies by Cell:</p>
            <div className="space-y-0.5 text-xs">
              <KeyValue label="AX">Continuous review, tight safety stock, automated reordering</KeyValue>
              <KeyValue label="AY">Regular review, moderate safety stock, demand monitoring</KeyValue>
              <KeyValue label="AZ">Close management, higher safety stock, consider VMI agreements</KeyValue>
              <KeyValue label="BX / BY">Standard policies, periodic review sufficient</KeyValue>
              <KeyValue label="BZ / CX / CY">Simplified management, higher review intervals</KeyValue>
              <KeyValue label="CZ">Minimal investment, consider MTO (make-to-order) or drop shipping</KeyValue>
            </div>
          </div>
          <Tip>You can adjust the ABC/XYZ thresholds in the Classification Settings panel. The defaults (A=80%, B=95%, X=0.5 CV, Y=1.0 CV) work well for most distributors.</Tip>
        </Section>

        {/* Suppliers */}
        <Section id="suppliers" icon={Truck} title="Suppliers">
          <p>Aggregated view of your supplier base showing SKU counts, total revenue, reorder values, and performance metrics per supplier.</p>
          <div className="space-y-1">
            <p className="font-medium text-foreground">Supplier Metrics:</p>
            <div className="space-y-0.5 text-xs">
              <KeyValue label="SKU Count">Total unique products from this supplier</KeyValue>
              <KeyValue label="Revenue Share">Percentage of total revenue from this supplier</KeyValue>
              <KeyValue label="Avg Lead Time">Average lead time across all SKUs</KeyValue>
              <KeyValue label="Critical Items">Number of below-reorder-point items</KeyValue>
              <KeyValue label="Reorder Value">Total suggested purchase value (EUR/USD)</KeyValue>
            </div>
          </div>
          <Tip>Click on a supplier row to expand and see the detailed SKU list. Use this to prepare supplier-specific purchase orders and negotiate better terms with high-volume suppliers.</Tip>
        </Section>

        {/* Cost Model */}
        <Section id="cost-model" icon={Calculator} title="Cost Model Settings">
          <p>Configure the cost parameters that drive EOQ calculations, safety stock levels, and reorder optimization. Each section can be toggled on/off independently.</p>
          <div className="space-y-1">
            <p className="font-medium text-foreground">Available Cost Components:</p>
            <div className="space-y-0.5 text-xs">
              <KeyValue label="Holding Cost">Annual interest rate applied to inventory value (capital cost of holding stock)</KeyValue>
              <KeyValue label="Storage Cost">Per-pallet monthly warehouse cost, converted to per-unit</KeyValue>
              <KeyValue label="Ordering Cost">Fixed cost per purchase order (admin, shipping, receiving)</KeyValue>
              <KeyValue label="Stockout Cost">Estimated cost of a stockout based on margin percentage</KeyValue>
              <KeyValue label="Obsolescence">Annual write-off rate by category for aging inventory</KeyValue>
              <KeyValue label="Min Order Value">Minimum PO value per supplier to meet free-shipping thresholds</KeyValue>
            </div>
          </div>
          <div className="space-y-1">
            <p className="font-medium text-foreground">Service Level Settings:</p>
            <p>Controls the safety stock multiplier (z-score). Options: 90% (z=1.28), 95% (z=1.65), 99% (z=2.33). Higher service levels mean more safety stock but lower stockout risk. Can be set per ABC class.</p>
          </div>
          <Tip>Start with defaults and fine-tune gradually. The biggest impact usually comes from accurate lead times (data) rather than cost model parameters. Set Class A items to 99% service level and Class C to 90% for a good balance.</Tip>
        </Section>

        {/* Multi-Currency */}
        <Section id="multicurrency" icon={DollarSign} title="Multi-Currency Support">
          <p>InventoryPRO supports mixed-currency purchasing (EUR/USD) with HUF selling prices. All reporting is normalized to EUR using live ECB exchange rates with 24-hour caching.</p>
          <div className="space-y-1">
            <p className="font-medium text-foreground">How It Works:</p>
            <ol className="list-decimal list-inside space-y-1 ml-2 text-xs">
              <li>Include <code className="bg-muted px-1 rounded">purchase_currency</code>, <code className="bg-muted px-1 rounded">purchase_price_1</code>, and <code className="bg-muted px-1 rounded">selling_price_huf</code> columns in your CSV</li>
              <li>The system fetches USD→EUR and EUR→HUF rates from ECB (with fallback values)</li>
              <li>All prices are converted to EUR for consistent comparison</li>
              <li>Margin is calculated as selling_price_eur − effective_purchase_price_eur</li>
            </ol>
          </div>
          <div className="space-y-1">
            <p className="font-medium text-foreground">Price Breaks:</p>
            <p>Up to 8 quantity-based price tiers per SKU. The system selects the effective purchase price based on the suggested order quantity, so larger orders may trigger better pricing automatically.</p>
          </div>
          <div className="space-y-1">
            <p className="font-medium text-foreground">FX Rate Management:</p>
            <p>Current rates are shown in the FX banner at the top. You can override rates manually if you have contracted rates with your suppliers. The override persists until cleared.</p>
          </div>
          <Tip>Watch for negative margins (shown in red) — these often indicate stale pricing data or unfavorable FX movements. Review these SKUs before placing orders.</Tip>
        </Section>

        {/* Best Practices */}
        <Section id="best-practices" icon={Shield} title="Best Practices">
          <div className="space-y-3">
            <div className="space-y-1">
              <p className="font-medium text-foreground flex items-center gap-2"><Zap className="h-3.5 w-3.5 text-primary" /> Data Quality</p>
              <ul className="list-disc list-inside space-y-0.5 ml-2 text-xs">
                <li>Export at least 6 months of sales history for reliable demand analysis</li>
                <li>Ensure consistent SKU codes across exports — the system groups by exact SKU match</li>
                <li>Include lead_time_days whenever possible — without it, reorder calculations are disabled</li>
                <li>Check the Data Quality section on the Overview for missing column warnings</li>
              </ul>
            </div>
            <div className="space-y-1">
              <p className="font-medium text-foreground flex items-center gap-2"><BarChart3 className="h-3.5 w-3.5 text-primary" /> Workflow</p>
              <ul className="list-disc list-inside space-y-0.5 ml-2 text-xs">
                <li>Run weekly: upload fresh data → review Critical SKUs → approve reorders → export PO</li>
                <li>Run monthly: review Overstock → adjust Cost Model → analyze ABC shifts</li>
                <li>Use Projects to save snapshots before and after major purchasing decisions</li>
                <li>Filter by supplier when preparing individual POs</li>
              </ul>
            </div>
            <div className="space-y-1">
              <p className="font-medium text-foreground flex items-center gap-2"><Target className="h-3.5 w-3.5 text-primary" /> Strategy Selection</p>
              <ul className="list-disc list-inside space-y-0.5 ml-2 text-xs">
                <li><strong>ROP</strong> — Best for most items. Simple, effective, low maintenance.</li>
                <li><strong>EOQ</strong> — Best for Class A items with stable demand and significant ordering costs.</li>
                <li><strong>Min/Max</strong> — Best for items with min-order constraints or variable demand.</li>
                <li><strong>Periodic</strong> — Best when you order from a supplier on a fixed schedule.</li>
              </ul>
            </div>
            <div className="space-y-1">
              <p className="font-medium text-foreground flex items-center gap-2"><Clock className="h-3.5 w-3.5 text-primary" /> Common Pitfalls</p>
              <ul className="list-disc list-inside space-y-0.5 ml-2 text-xs">
                <li>Don't ignore declining trend items — they may become overstock if you keep ordering</li>
                <li>Update lead times regularly — supplier performance changes over time</li>
                <li>Don't set all items to 99% service level — this inflates safety stock excessively</li>
                <li>Review dead stock quarterly and take action (liquidate, return, write-off)</li>
              </ul>
            </div>
          </div>
        </Section>

        {/* Glossary */}
        <Section id="glossary" icon={BookOpen} title="Glossary">
          <div className="space-y-1 text-xs">
            <KeyValue label="Avg Daily Demand">Average units sold per day across the analysis period</KeyValue>
            <KeyValue label="CV (Coeff. of Var.)">Standard deviation ÷ mean of monthly demand — measures predictability</KeyValue>
            <KeyValue label="Days of Stock">Current stock ÷ avg daily demand — how many days until stockout</KeyValue>
            <KeyValue label="Dead Stock">Items with zero sales in the entire dataset — no demand signal</KeyValue>
            <KeyValue label="Effective Stock">Stock on hand + ordered qty − reserved qty</KeyValue>
            <KeyValue label="EOQ">Economic Order Quantity — order size that minimizes total inventory cost</KeyValue>
            <KeyValue label="FX Rate">Foreign exchange rate used to convert between currencies</KeyValue>
            <KeyValue label="Lead Time">Days between placing and receiving an order from supplier</KeyValue>
            <KeyValue label="Margin %">(Selling price − Purchase price) ÷ Selling price × 100</KeyValue>
            <KeyValue label="Price Break">Quantity threshold where the per-unit purchase price decreases</KeyValue>
            <KeyValue label="Reorder Point">Safety stock + (avg daily demand × lead time) — trigger level for ordering</KeyValue>
            <KeyValue label="ROP">Reorder Point strategy — order when stock drops below the reorder point</KeyValue>
            <KeyValue label="Safety Stock">Buffer stock to protect against demand variability during lead time</KeyValue>
            <KeyValue label="Service Level">Target probability of not stocking out (e.g., 95% means 5% stockout risk)</KeyValue>
            <KeyValue label="Tied-up Capital">Value of excess stock beyond normal needs — opportunity cost</KeyValue>
            <KeyValue label="z-score">Statistical multiplier for safety stock based on desired service level</KeyValue>
          </div>
        </Section>
      </div>

      {/* Footer */}
      <div className="text-center text-xs text-muted-foreground py-6 border-t border-border">
        <p>InventoryPRO — Demand-driven inventory management for B2B distributors</p>
        <p className="mt-1">All data is processed locally in your browser. No data is sent to external servers.</p>
      </div>
    </div>
  );
}
