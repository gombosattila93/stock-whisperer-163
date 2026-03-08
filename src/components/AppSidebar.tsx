import {
  LayoutDashboard,
  AlertTriangle,
  ShoppingCart,
  PackageX,
  Grid3X3,
  Upload,
  Truck,
  Calculator,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
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

const navItems = [
  { title: "Overview", url: "/overview", icon: LayoutDashboard },
  { title: "Critical SKUs", url: "/critical", icon: AlertTriangle },
  { title: "Reorder List", url: "/reorder", icon: ShoppingCart },
  { title: "Overstock", url: "/overstock", icon: PackageX },
  { title: "ABC-XYZ Detail", url: "/abc-xyz", icon: Grid3X3 },
  { title: "Suppliers", url: "/suppliers", icon: Truck },
  { title: "Cost Model", url: "/cost-model", icon: Calculator },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();

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
            {!collapsed && "Navigation"}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url === "/overview"}
                      className="hover:bg-sidebar-accent/50 transition-colors"
                      activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                    >
                      <item.icon className="mr-2 h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
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
