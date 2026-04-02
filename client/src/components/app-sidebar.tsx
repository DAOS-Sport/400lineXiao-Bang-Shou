import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, TrendingUp, Building2, ShieldCheck, Activity,
  AlertTriangle, Sun, Moon, FileText, BarChart3,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarHeader, SidebarFooter,
} from "@/components/ui/sidebar";

const navItems = [
  { title: "營運戰情總覽", url: "/", icon: LayoutDashboard, group: "營運管理" },
  { title: "打卡異常管理", url: "/anomaly-reports", icon: AlertTriangle, group: "營運管理" },
  { title: "決策與數據洞察", url: "/analytics", icon: TrendingUp, group: "營運管理" },
  { title: "跨館資源監控", url: "/operations", icon: Building2, group: "營運管理" },
  { title: "公告審核中心", url: "/announcements", icon: FileText, group: "公告歸納" },
  { title: "公告分析總覽", url: "/announcements/summary", icon: BarChart3, group: "公告歸納" },
  { title: "HR 與權限稽核", url: "/hr-audit", icon: ShieldCheck, group: "系統管理" },
  { title: "微服務健康監控", url: "/system-health", icon: Activity, group: "系統管理" },
];

function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const isDark = saved === "dark" || (!saved && prefersDark);
    setDark(isDark);
    if (isDark) document.documentElement.classList.add("dark");
    else document.documentElement.classList.remove("dark");
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    if (next) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  };

  return (
    <button
      onClick={toggle}
      className="flex items-center gap-2 w-full rounded-lg px-3 py-2 text-xs font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
    >
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      <span>{dark ? "淺色模式" : "深色模式"}</span>
    </button>
  );
}

export function AppSidebar() {
  const [location] = useLocation();
  return (
    <Sidebar>
      <SidebarHeader className="p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <LayoutDashboard className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-sidebar-foreground">DAOS 管理後台</p>
            <p className="text-xs text-muted-foreground">LINE Bot 監控系統 v2.1</p>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        {["營運管理", "公告歸納", "系統管理"].map((group) => (
          <SidebarGroup key={group}>
            <SidebarGroupLabel>{group}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {navItems.filter((item) => item.group === group).map((item) => {
                  const isActive = location === item.url ||
                    (item.url !== "/" && location.startsWith(item.url));
                  return (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton asChild data-active={isActive || undefined}>
                        <Link href={item.url}>
                          <item.icon className="h-4 w-4" />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter className="p-4 space-y-2">
        <ThemeToggle />
        <div className="rounded-lg bg-sidebar-accent/50 p-3">
          <p className="text-xs text-muted-foreground">駿斯運動事業 LINE Bot 管理平台</p>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
