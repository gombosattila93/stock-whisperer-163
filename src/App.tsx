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
import CostModel from "./pages/CostModel";
import Projects from "./pages/Projects";
import ReorderPlan from "./pages/ReorderPlan";
import ReorderCalendar from "./pages/ReorderCalendar";
import Guide from "./pages/Guide";
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
              <Route path="/" element={<Index />} />
              <Route path="/overview" element={<Overview />} />
              <Route path="/critical" element={<CriticalSkus />} />
              <Route path="/reorder" element={<ReorderList />} />
              <Route path="/reorder-plan" element={<ReorderPlan />} />
              <Route path="/overstock" element={<Overstock />} />
              <Route path="/abc-xyz" element={<AbcXyzDetail />} />
              <Route path="/projects" element={<Projects />} />
              <Route path="/suppliers" element={<Suppliers />} />
              <Route path="/cost-model" element={<CostModel />} />
              <Route path="/guide" element={<Guide />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Layout>
        </InventoryProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
