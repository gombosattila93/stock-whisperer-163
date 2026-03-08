import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { InventoryProvider } from "@/context/InventoryContext";
import { Layout } from "@/components/Layout";
import Index from "./pages/Index";
import Overview from "./pages/Overview";
import CriticalSkus from "./pages/CriticalSkus";
import ReorderList from "./pages/ReorderList";
import Overstock from "./pages/Overstock";
import AbcXyzDetail from "./pages/AbcXyzDetail";
import Suppliers from "./pages/Suppliers";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <InventoryProvider>
          <Layout>
            <Routes>
              <Route path="/" element={<Overview />} />
              <Route path="/critical" element={<CriticalSkus />} />
              <Route path="/reorder" element={<ReorderList />} />
              <Route path="/overstock" element={<Overstock />} />
              <Route path="/abc-xyz" element={<AbcXyzDetail />} />
              <Route path="/suppliers" element={<Suppliers />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Layout>
        </InventoryProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
