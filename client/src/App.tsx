import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import Dashboard from "@/pages/dashboard";
import Analytics from "@/pages/analytics";
import Operations from "@/pages/operations";
import HrAudit from "@/pages/hr-audit";
import SystemHealth from "@/pages/system-health";
import AnomalyReports from "@/pages/anomaly-reports";
import Announcements from "@/pages/announcements";
import AnnouncementSummary from "@/pages/announcement-summary";
import AdminPage from "@/pages/admin";
import NotFound from "@/pages/not-found";

const PAGE_TITLES: Record<string, string> = {
  "/": "營運戰情總覽",
  "/analytics": "決策與數據洞察",
  "/operations": "跨館資源監控",
  "/hr-audit": "HR 與權限稽核",
  "/system-health": "微服務健康監控",
  "/anomaly-reports": "打卡異常管理",
  "/announcements": "公告審核中心",
  "/announcements/summary": "公告分析總覽",
  "/admin": "管理後台",
};

function HeaderTitle() {
  const [location] = useLocation();
  const title = PAGE_TITLES[location] || "DAOS 管理後台";
  return <span className="text-sm font-medium text-muted-foreground">{title}</span>;
}

const sidebarStyle = {
  "--sidebar-width": "16rem",
  "--sidebar-width-icon": "3rem",
};

function AppRouter() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/analytics" component={Analytics} />
      <Route path="/operations" component={Operations} />
      <Route path="/hr-audit" component={HrAudit} />
      <Route path="/system-health" component={SystemHealth} />
      <Route path="/anomaly-reports" component={AnomalyReports} />
      <Route path="/announcements/summary" component={AnnouncementSummary} />
      <Route path="/announcements" component={Announcements} />
      <Route path="/admin" component={AdminPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AppLayout() {
  const [location] = useLocation();
  const isAdmin = location === "/admin";

  if (isAdmin) {
    return <AppRouter />;
  }

  return (
    <SidebarProvider style={sidebarStyle as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          <header className="flex items-center gap-2 px-4 py-3 border-b bg-card/50 backdrop-blur-sm shrink-0">
            <SidebarTrigger />
            <div className="h-4 w-px bg-border" />
            <HeaderTitle />
          </header>
          <main className="flex-1 overflow-y-auto">
            <AppRouter />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AppLayout />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
