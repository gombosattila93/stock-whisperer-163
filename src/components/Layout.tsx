import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { GlobalFilters } from "@/components/GlobalFilters";
import { DataActions } from "@/components/EmptyState";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ColumnMapper } from "@/components/ColumnMapper";
import { DuplicateDetectionModal } from "@/components/DuplicateDetectionModal";
import { ImportSummaryModal } from "@/components/ImportSummaryModal";
import { FxBanner } from "@/components/FxBanner";
import { FxSettingsPanel } from "@/components/FxSettingsPanel";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LanguageToggle } from "@/components/LanguageToggle";
import { useLanguage } from "@/lib/i18n";
import { useInventory } from "@/context/InventoryContext";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

export function Layout({ children }: { children: React.ReactNode }) {
  const {
    pendingFile, pendingHeaders, pendingRawData, setPendingFile, loadFileWithMapping,
    isCalculating, calculationProgress,
    pendingAppend, confirmAppend, cancelAppend,
    pendingImportSummary, confirmImport, cancelImport,
    pendingExtremeValues, confirmExtremeInclude, confirmExtremeExclude,
    indexedDBAvailable,
  } = useInventory();
  const { t } = useLanguage();

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          {/* 4f) IndexedDB unavailable banner */}
          {!indexedDBAvailable && (
            <div className="bg-warning/15 border-b border-warning/30 px-4 py-2 flex items-center gap-2 text-xs text-warning-foreground shrink-0">
              <Info className="h-3.5 w-3.5 shrink-0" />
              {t('header.privateBrowsing')}
            </div>
          )}

          <FxBanner />

          <header className="h-14 flex items-center gap-4 border-b bg-card px-4 shrink-0">
            <SidebarTrigger />
            <DataActions />
            <GlobalFilters />
            <div className="ml-auto flex items-center gap-1">
              <FxSettingsPanel />
              <LanguageToggle />
              <ThemeToggle />
            </div>
          </header>
          {isCalculating && (
            <div className="shrink-0">
              <Progress
                value={calculationProgress}
                className="h-1 rounded-none [&>div]:transition-all [&>div]:duration-300"
              />
            </div>
          )}
          <main className="flex-1 p-6 overflow-auto">
            <ErrorBoundary fallbackTitle="Failed to render this page">
              {children}
            </ErrorBoundary>
            {/* 4h) Mobile horizontal scroll hint */}
            <div className="mt-4 text-center text-xs text-muted-foreground md:hidden">
              ← scroll →
            </div>
          </main>
        </div>
      </div>

      {pendingFile && (
        <ColumnMapper
          open={!!pendingFile}
          onOpenChange={(open) => { if (!open) setPendingFile(null); }}
          sourceColumns={pendingHeaders}
          rawData={pendingRawData}
          onConfirm={(mapping) => {
            if (pendingFile) loadFileWithMapping(pendingFile, mapping);
          }}
        />
      )}

      {pendingAppend && (
        <DuplicateDetectionModal
          open={!!pendingAppend}
          onOpenChange={(open) => { if (!open) cancelAppend(); }}
          analysis={pendingAppend.analysis}
          fileName={pendingAppend.fileName}
          onConfirm={confirmAppend}
        />
      )}

      {/* Import Summary Modal */}
      <ImportSummaryModal
        open={!!pendingImportSummary}
        summary={pendingImportSummary}
        onProceed={confirmImport}
        onCancel={cancelImport}
      />

      {/* Extreme Values Dialog */}
      {pendingExtremeValues && (
        <Dialog open={!!pendingExtremeValues} onOpenChange={(v) => { if (!v) confirmExtremeInclude(); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-warning" />
                Unusual Quantities Detected
              </DialogTitle>
              <DialogDescription>
                {pendingExtremeValues.rows.length} rows have quantities &gt; 4× standard deviation.
                These may be data entry errors.
              </DialogDescription>
            </DialogHeader>
            <div className="bg-muted/50 rounded-lg p-3 text-xs space-y-1">
              <p className="font-medium">Affected SKUs:</p>
              {pendingExtremeValues.skus.slice(0, 10).map(sku => (
                <span key={sku} className="inline-block bg-muted rounded px-2 py-0.5 mr-1.5 mb-1 font-mono">{sku}</span>
              ))}
              {pendingExtremeValues.skus.length > 10 && (
                <span className="text-muted-foreground">+{pendingExtremeValues.skus.length - 10} more</span>
              )}
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={confirmExtremeExclude}>Exclude these rows</Button>
              <Button onClick={confirmExtremeInclude}>Include all</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </SidebarProvider>
  );
}
