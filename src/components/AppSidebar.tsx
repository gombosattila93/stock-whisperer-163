import {
  LayoutDashboard,
  AlertTriangle,
  ShoppingCart,
  PackageX,
  Grid3X3,
  Upload,
  Truck,
  Calculator,
  ClipboardList,
  Wallet,
  CalendarDays,
  BookOpen,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { useLanguage, TranslationKey } from "@/lib/i18n";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar";

const navItems: { titleKey: TranslationKey; url: string; icon: React.ElementType }[] = [
  { titleKey: "nav.overview", url: "/overview", icon: LayoutDashboard },
  { titleKey: "nav.critical", url: "/critical", icon: AlertTriangle },
  { titleKey: "nav.reorder", url: "/reorder", icon: ShoppingCart },
  { titleKey: "nav.reorderPlan", url: "/reorder-plan", icon: Wallet },
  { titleKey: "nav.reorderCalendar", url: "/reorder-calendar", icon: CalendarDays },
  { titleKey: "nav.overstock", url: "/overstock", icon: PackageX },
  { titleKey: "nav.abcXyz", url: "/abc-xyz", icon: Grid3X3 },
  { titleKey: "nav.projects", url: "/projects", icon: ClipboardList },
  { titleKey: "nav.suppliers", url: "/suppliers", icon: Truck },
  { titleKey: "nav.costModel", url: "/cost-model", icon: Calculator },
  { titleKey: "nav.guide", url: "/guide", icon: BookOpen },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { t } = useLanguage();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-4">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-sidebar-primary" />
            <span className="font-bold text-sm text-sidebar-accent-foreground tracking-wide">
              INVENTORY<span className="text-sidebar-primary">PRO</span>
            </span>
          </div>
        )}
        {collapsed && <Upload className="h-5 w-5 text-sidebar-primary mx-auto" />}
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/50 text-xs uppercase tracking-widest">
            {!collapsed && t("nav.navigation")}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.titleKey}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url === "/overview"}
                      className="hover:bg-sidebar-accent/50 transition-colors"
                      activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                    >
                      <item.icon className="mr-2 h-4 w-4" />
                      {!collapsed && <span>{t(item.titleKey)}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
