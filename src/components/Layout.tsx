import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { GlobalFilters } from "@/components/GlobalFilters";
import { DataActions } from "@/components/EmptyState";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ColumnMapper } from "@/components/ColumnMapper";
import { DuplicateDetectionModal } from "@/components/DuplicateDetectionModal";
import { useInventory } from "@/context/InventoryContext";
import { Progress } from "@/components/ui/progress";

export function Layout({ children }: { children: React.ReactNode }) {
  const {
    pendingFile, pendingHeaders, pendingRawData, setPendingFile, loadFileWithMapping,
    isCalculating, calculationProgress,
    pendingAppend, confirmAppend, cancelAppend,
  } = useInventory();

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center gap-4 border-b bg-card px-4 shrink-0">
            <SidebarTrigger />
            <DataActions />
            <GlobalFilters />
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
    </SidebarProvider>
  );
}
