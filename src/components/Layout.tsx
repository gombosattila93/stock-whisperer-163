import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { GlobalFilters } from "@/components/GlobalFilters";
import { DataActions } from "@/components/EmptyState";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ColumnMapper } from "@/components/ColumnMapper";
import { useInventory } from "@/context/InventoryContext";

export function Layout({ children }: { children: React.ReactNode }) {
  const { pendingFile, pendingHeaders, setPendingFile, loadFileWithMapping } = useInventory();

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
          onConfirm={(mapping) => {
            if (pendingFile) loadFileWithMapping(pendingFile, mapping);
          }}
        />
      )}
    </SidebarProvider>
  );
}
