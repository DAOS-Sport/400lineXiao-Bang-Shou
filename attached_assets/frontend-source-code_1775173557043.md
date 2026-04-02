# DAOS 管理後台 — 前端完整原始碼

> 自動產生於 2026-04-02
> 總計：9 頁面 + 1 側邊欄 + 1 型別定義 + 2 hooks + 2 lib + 1 CSS + 47 shadcn 元件

---

## 目錄結構

```
client/
├── index.html
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── index.css
│   ├── pages/
│   │   ├── dashboard.tsx          (1389 行)
│   │   ├── anomaly-reports.tsx    (979 行)
│   │   ├── announcements.tsx      (742 行)
│   │   ├── analytics.tsx          (573 行)
│   │   ├── system-health.tsx      (395 行)
│   │   ├── announcement-summary.tsx (338 行)
│   │   ├── hr-audit.tsx           (309 行)
│   │   ├── operations.tsx         (194 行)
│   │   └── not-found.tsx          (21 行)
│   ├── components/
│   │   ├── app-sidebar.tsx        (136 行)
│   │   └── ui/                    (47 個 shadcn 元件)
│   ├── types/
│   │   └── announcement.ts        (120 行)
│   ├── hooks/
│   │   ├── use-toast.ts           (191 行)
│   │   └── use-mobile.tsx         (19 行)
│   └── lib/
│       ├── queryClient.ts         (57 行)
│       └── utils.ts               (6 行)
```

---

## 1. client/index.html

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1" />
    <title>群組功能戰情室 | Dashboard</title>
    <meta name="description" content="即時監控各群組的功能啟用狀態與系統健康度" />
    <link rel="icon" type="image/png" href="/favicon.png" />
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&family=JetBrains+Mono:ital,wght@0,100..800;1,100..800&display=swap" rel="stylesheet">
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

---

## 2. client/src/main.tsx

```tsx
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);
```

---

## 3. client/src/App.tsx

```tsx
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
      <Route component={NotFound} />
    </Switch>
  );
}

const sidebarStyle = {
  "--sidebar-width": "16rem",
  "--sidebar-width-icon": "3rem",
};

function HeaderTitle() {
  const [location] = useLocation();
  const title = PAGE_TITLES[location] || "DAOS 管理後台";
  return <span className="text-sm font-medium text-muted-foreground" data-testid="text-page-title">{title}</span>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <SidebarProvider style={sidebarStyle as React.CSSProperties}>
          <div className="flex h-screen w-full">
            <AppSidebar />
            <div className="flex flex-col flex-1 min-w-0">
              <header className="flex items-center gap-2 px-4 py-3 border-b bg-card/50 backdrop-blur-sm">
                <SidebarTrigger data-testid="button-sidebar-toggle" />
                <div className="h-4 w-px bg-border" />
                <HeaderTitle />
              </header>
              <main className="flex-1 overflow-hidden">
                <AppRouter />
              </main>
            </div>
          </div>
        </SidebarProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
```

---

## 4. client/src/components/app-sidebar.tsx

```tsx
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
  const [dark, setDark] = useState(() => {
    if (typeof window !== "undefined") {
      return document.documentElement.classList.contains("dark");
    }
    return false;
  });

  useEffect(() => {
    if (dark) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  }, [dark]);

  useEffect(() => {
    const saved = localStorage.getItem("theme");
    if (saved === "dark") setDark(true);
    else if (saved === "light") setDark(false);
    else if (window.matchMedia("(prefers-color-scheme: dark)").matches) setDark(true);
  }, []);

  return (
    <button
      onClick={() => setDark(!dark)}
      className="flex items-center gap-2 w-full rounded-lg px-3 py-2 text-xs font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
      data-testid="button-theme-toggle"
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
            <p className="text-sm font-semibold text-sidebar-foreground" data-testid="text-app-title">DAOS 管理後台</p>
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
                  const isActive = location === item.url;
                  return (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        asChild
                        data-active={isActive || undefined}
                        className={isActive ? "data-[active=true]:bg-sidebar-accent" : ""}
                      >
                        <Link href={item.url} data-testid={`link-nav-${item.title}`}>
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
```

---

## 5. client/src/types/announcement.ts

```tsx
export interface AnnouncementSummaryResponse {
  totalMessagesToday: number;
  analyzedMessagesToday: number;
  pendingReviewCount: number;
  approvedCount: number;
  rejectedCount: number;
  byType?: Record<string, number>;
  byFacility?: Record<string, number>;
}

export interface AnnouncementCandidate {
  id: number;
  title: string;
  candidateType: string;
  status: string;
  facilityName: string;
  groupName?: string;
  groupId?: string;
  confidence: number | string;
  summary?: string;
  detectedAt: string;
  scopeType?: string;
  recommendedAction?: string;
  badExample?: string;
  recommendedReply?: string;
  extractedJson?: unknown;
  originalText?: string;
  displayName?: string;
  userId?: string;
  isFromSupervisor?: string | boolean;
  appliesToRoles?: string[];
  reasoningTags?: string[];
  startAt?: string | null;
  endAt?: string | null;
  sourceMessage?: {
    text: string;
    sentAt: string;
    isFromSupervisor?: boolean;
    groupName?: string;
    facilityName?: string;
  };
}

export interface AnnouncementCandidateDetail extends AnnouncementCandidate {
  reviews?: AnnouncementReview[];
}

export interface AnnouncementReview {
  id: number;
  candidateId: number;
  action: string;
  comment?: string;
  reviewedBy?: string;
  reviewedAt: string;
}

export interface AnnouncementWeeklyDay {
  date: string;
  totalMessages?: number;
  analyzedMessages?: number;
  candidatesCreated?: number;
  approved?: number;
  rejected?: number;
  highConfidenceCount?: number;
}

export interface AnnouncementWeeklyReportResponse {
  days: AnnouncementWeeklyDay[];
  summary?: {
    totalAnalyzed?: number;
    totalCandidates?: number;
    totalApproved?: number;
    totalRejected?: number;
  };
}

export interface AnnouncementCandidatesResponse {
  candidates: AnnouncementCandidate[];
  items?: AnnouncementCandidate[];
  total: number;
  page: number;
  pageSize: number;
  totalPages?: number;
}

export interface AnnouncementFilters {
  keyword?: string;
  status?: string;
  candidateType?: string;
  facilityName?: string;
  groupId?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
  vipFocus?: boolean;
}

export const CANDIDATE_TYPES = ["rule", "notice", "campaign", "discount", "script", "ignore"] as const;
export type CandidateType = (typeof CANDIDATE_TYPES)[number];

export const CANDIDATE_STATUSES = ["pending_review", "approved", "rejected", "ignored", "vip_chat"] as const;
export type CandidateStatus = (typeof CANDIDATE_STATUSES)[number];

export const TYPE_LABELS: Record<string, string> = {
  rule: "規則/SOP",
  notice: "通知公告",
  campaign: "活動",
  discount: "優惠折扣",
  script: "標準說詞",
  ignore: "閒聊",
};

export const STATUS_LABELS: Record<string, string> = {
  pending_review: "待審核",
  approved: "已核准",
  rejected: "已退回",
  ignored: "已忽略",
  vip_chat: "\u2B50 VIP閒聊",
};
```

---

## 6. client/src/lib/queryClient.ts

```tsx
import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });
  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
    });
    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }
    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
```

---

## 7. client/src/lib/utils.ts

```tsx
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

---

## 8. client/src/hooks/use-mobile.tsx

```tsx
import * as React from "react"

const MOBILE_BREAKPOINT = 768

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    mql.addEventListener("change", onChange)
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return !!isMobile
}
```

---

## 9. client/src/hooks/use-toast.ts

```tsx
import * as React from "react"
import type { ToastActionElement, ToastProps } from "@/components/ui/toast"

const TOAST_LIMIT = 1
const TOAST_REMOVE_DELAY = 1000000

type ToasterToast = ToastProps & {
  id: string
  title?: React.ReactNode
  description?: React.ReactNode
  action?: ToastActionElement
}

const actionTypes = {
  ADD_TOAST: "ADD_TOAST",
  UPDATE_TOAST: "UPDATE_TOAST",
  DISMISS_TOAST: "DISMISS_TOAST",
  REMOVE_TOAST: "REMOVE_TOAST",
} as const

let count = 0
function genId() {
  count = (count + 1) % Number.MAX_SAFE_INTEGER
  return count.toString()
}

type ActionType = typeof actionTypes
type Action =
  | { type: ActionType["ADD_TOAST"]; toast: ToasterToast }
  | { type: ActionType["UPDATE_TOAST"]; toast: Partial<ToasterToast> }
  | { type: ActionType["DISMISS_TOAST"]; toastId?: ToasterToast["id"] }
  | { type: ActionType["REMOVE_TOAST"]; toastId?: ToasterToast["id"] }

interface State { toasts: ToasterToast[] }

const toastTimeouts = new Map<string, ReturnType<typeof setTimeout>>()

const addToRemoveQueue = (toastId: string) => {
  if (toastTimeouts.has(toastId)) return
  const timeout = setTimeout(() => {
    toastTimeouts.delete(toastId)
    dispatch({ type: "REMOVE_TOAST", toastId })
  }, TOAST_REMOVE_DELAY)
  toastTimeouts.set(toastId, timeout)
}

export const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    case "ADD_TOAST":
      return { ...state, toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT) }
    case "UPDATE_TOAST":
      return { ...state, toasts: state.toasts.map((t) => t.id === action.toast.id ? { ...t, ...action.toast } : t) }
    case "DISMISS_TOAST": {
      const { toastId } = action
      if (toastId) addToRemoveQueue(toastId)
      else state.toasts.forEach((toast) => addToRemoveQueue(toast.id))
      return { ...state, toasts: state.toasts.map((t) => t.id === toastId || toastId === undefined ? { ...t, open: false } : t) }
    }
    case "REMOVE_TOAST":
      if (action.toastId === undefined) return { ...state, toasts: [] }
      return { ...state, toasts: state.toasts.filter((t) => t.id !== action.toastId) }
  }
}

const listeners: Array<(state: State) => void> = []
let memoryState: State = { toasts: [] }

function dispatch(action: Action) {
  memoryState = reducer(memoryState, action)
  listeners.forEach((listener) => listener(memoryState))
}

type Toast = Omit<ToasterToast, "id">

function toast({ ...props }: Toast) {
  const id = genId()
  const update = (props: ToasterToast) => dispatch({ type: "UPDATE_TOAST", toast: { ...props, id } })
  const dismiss = () => dispatch({ type: "DISMISS_TOAST", toastId: id })
  dispatch({
    type: "ADD_TOAST",
    toast: { ...props, id, open: true, onOpenChange: (open) => { if (!open) dismiss() } },
  })
  return { id, dismiss, update }
}

function useToast() {
  const [state, setState] = React.useState<State>(memoryState)
  React.useEffect(() => {
    listeners.push(setState)
    return () => {
      const index = listeners.indexOf(setState)
      if (index > -1) listeners.splice(index, 1)
    }
  }, [state])
  return { ...state, toast, dismiss: (toastId?: string) => dispatch({ type: "DISMISS_TOAST", toastId }) }
}

export { useToast, toast }
```

---

## 10. client/src/index.css

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --button-outline: rgba(0,0,0, .10);
  --badge-outline: rgba(0,0,0, .05);
  --opaque-button-border-intensity: -8;
  --elevate-1: rgba(0,0,0, .03);
  --elevate-2: rgba(0,0,0, .08);
  --background: 0 0% 100%;
  --foreground: 0 0% 9%;
  --border: 0 0% 90%;
  --card: 0 0% 98%;
  --card-foreground: 0 0% 9%;
  --card-border: 0 0% 94%;
  --sidebar: 220 3% 96%;
  --sidebar-foreground: 220 3% 12%;
  --sidebar-border: 220 3% 92%;
  --sidebar-primary: 217 91% 60%;
  --sidebar-primary-foreground: 0 0% 98%;
  --sidebar-accent: 220 4% 88%;
  --sidebar-accent-foreground: 220 4% 15%;
  --sidebar-ring: 217 91% 60%;
  --popover: 0 0% 96%;
  --popover-foreground: 0 0% 9%;
  --popover-border: 0 0% 92%;
  --primary: 217 91% 60%;
  --primary-foreground: 0 0% 98%;
  --secondary: 220 4% 88%;
  --secondary-foreground: 220 4% 15%;
  --muted: 220 4% 90%;
  --muted-foreground: 220 4% 35%;
  --accent: 217 15% 92%;
  --accent-foreground: 217 15% 18%;
  --destructive: 0 84% 60%;
  --destructive-foreground: 0 0% 98%;
  --input: 0 0% 75%;
  --ring: 217 91% 60%;
  --chart-1: 217 91% 45%;
  --chart-2: 173 80% 40%;
  --chart-3: 197 37% 45%;
  --chart-4: 43 74% 50%;
  --chart-5: 27 87% 55%;
  --font-sans: Inter, system-ui, -apple-system, sans-serif;
  --font-serif: Georgia, serif;
  --font-mono: "JetBrains Mono", Menlo, monospace;
  --radius: .5rem;
  --shadow-2xs: 0px 2px 0px 0px hsl(0 0% 0% / 0.00);
  --shadow-xs: 0px 2px 0px 0px hsl(0 0% 0% / 0.00);
  --shadow-sm: 0px 2px 0px 0px hsl(0 0% 0% / 0.00), 0px 1px 2px -1px hsl(0 0% 0% / 0.00);
  --shadow: 0px 2px 0px 0px hsl(0 0% 0% / 0.00), 0px 1px 2px -1px hsl(0 0% 0% / 0.00);
  --shadow-md: 0px 2px 0px 0px hsl(0 0% 0% / 0.00), 0px 2px 4px -1px hsl(0 0% 0% / 0.00);
  --shadow-lg: 0px 2px 0px 0px hsl(0 0% 0% / 0.00), 0px 4px 6px -1px hsl(0 0% 0% / 0.00);
  --shadow-xl: 0px 2px 0px 0px hsl(0 0% 0% / 0.00), 0px 8px 10px -1px hsl(0 0% 0% / 0.00);
  --shadow-2xl: 0px 2px 0px 0px hsl(0 0% 0% / 0.00);
  --tracking-normal: 0em;
  --spacing: 0.25rem;

  --sidebar-primary-border: hsl(var(--sidebar-primary));
  --sidebar-primary-border: hsl(from hsl(var(--sidebar-primary)) h s calc(l + var(--opaque-button-border-intensity)) / alpha);
  --sidebar-accent-border: hsl(var(--sidebar-accent));
  --sidebar-accent-border: hsl(from hsl(var(--sidebar-accent)) h s calc(l + var(--opaque-button-border-intensity)) / alpha);
  --primary-border: hsl(var(--primary));
  --primary-border: hsl(from hsl(var(--primary)) h s calc(l + var(--opaque-button-border-intensity)) / alpha);
  --secondary-border: hsl(var(--secondary));
  --secondary-border: hsl(from hsl(var(--secondary)) h s calc(l + var(--opaque-button-border-intensity)) / alpha);
  --muted-border: hsl(var(--muted));
  --muted-border: hsl(from hsl(var(--muted)) h s calc(l + var(--opaque-button-border-intensity)) / alpha);
  --accent-border: hsl(var(--accent));
  --accent-border: hsl(from hsl(var(--accent)) h s calc(l + var(--opaque-button-border-intensity)) / alpha);
  --destructive-border: hsl(var(--destructive));
  --destructive-border: hsl(from hsl(var(--destructive)) h s calc(l + var(--opaque-button-border-intensity)) / alpha);
}

.dark {
  --button-outline: rgba(255,255,255, .10);
  --badge-outline: rgba(255,255,255, .05);
  --opaque-button-border-intensity: 9;
  --elevate-1: rgba(255,255,255, .04);
  --elevate-2: rgba(255,255,255, .09);
  --background: 220 5% 8%;
  --foreground: 220 5% 96%;
  --border: 220 5% 18%;
  --card: 220 5% 10%;
  --card-foreground: 220 5% 96%;
  --card-border: 220 5% 14%;
  --sidebar: 220 6% 14%;
  --sidebar-foreground: 220 6% 92%;
  --sidebar-border: 220 6% 18%;
  --sidebar-primary: 217 91% 60%;
  --sidebar-primary-foreground: 0 0% 98%;
  --sidebar-accent: 220 6% 20%;
  --sidebar-accent-foreground: 220 6% 90%;
  --sidebar-ring: 217 91% 60%;
  --popover: 220 5% 16%;
  --popover-foreground: 220 5% 96%;
  --popover-border: 220 5% 20%;
  --primary: 217 91% 60%;
  --primary-foreground: 0 0% 98%;
  --secondary: 220 6% 22%;
  --secondary-foreground: 220 6% 90%;
  --muted: 220 6% 20%;
  --muted-foreground: 220 6% 70%;
  --accent: 217 10% 18%;
  --accent-foreground: 217 10% 88%;
  --destructive: 0 62% 50%;
  --destructive-foreground: 0 0% 98%;
  --input: 220 5% 30%;
  --ring: 217 91% 60%;
  --chart-1: 217 91% 75%;
  --chart-2: 173 80% 70%;
  --chart-3: 197 37% 75%;
  --chart-4: 43 74% 65%;
  --chart-5: 27 87% 70%;
  --shadow-2xs: 0px 2px 0px 0px hsl(0 0% 0% / 0.00);
  --shadow-xs: 0px 2px 0px 0px hsl(0 0% 0% / 0.00);
  --shadow-sm: 0px 2px 0px 0px hsl(0 0% 0% / 0.00), 0px 1px 2px -1px hsl(0 0% 0% / 0.00);
  --shadow: 0px 2px 0px 0px hsl(0 0% 0% / 0.00), 0px 1px 2px -1px hsl(0 0% 0% / 0.00);
  --shadow-md: 0px 2px 0px 0px hsl(0 0% 0% / 0.00), 0px 2px 4px -1px hsl(0 0% 0% / 0.00);
  --shadow-lg: 0px 2px 0px 0px hsl(0 0% 0% / 0.00), 0px 4px 6px -1px hsl(0 0% 0% / 0.00);
  --shadow-xl: 0px 2px 0px 0px hsl(0 0% 0% / 0.00), 0px 8px 10px -1px hsl(0 0% 0% / 0.00);
  --shadow-2xl: 0px 2px 0px 0px hsl(0 0% 0% / 0.00);

  --sidebar-primary-border: hsl(var(--sidebar-primary));
  --sidebar-primary-border: hsl(from hsl(var(--sidebar-primary)) h s calc(l + var(--opaque-button-border-intensity)) / alpha);
  --sidebar-accent-border: hsl(var(--sidebar-accent));
  --sidebar-accent-border: hsl(from hsl(var(--sidebar-accent)) h s calc(l + var(--opaque-button-border-intensity)) / alpha);
  --primary-border: hsl(var(--primary));
  --primary-border: hsl(from hsl(var(--primary)) h s calc(l + var(--opaque-button-border-intensity)) / alpha);
  --secondary-border: hsl(var(--secondary));
  --secondary-border: hsl(from hsl(var(--secondary)) h s calc(l + var(--opaque-button-border-intensity)) / alpha);
  --muted-border: hsl(var(--muted));
  --muted-border: hsl(from hsl(var(--muted)) h s calc(l + var(--opaque-button-border-intensity)) / alpha);
  --accent-border: hsl(var(--accent));
  --accent-border: hsl(from hsl(var(--accent)) h s calc(l + var(--opaque-button-border-intensity)) / alpha);
  --destructive-border: hsl(var(--destructive));
  --destructive-border: hsl(from hsl(var(--destructive)) h s calc(l + var(--opaque-button-border-intensity)) / alpha);
}

@layer base {
  * { @apply border-border; }
  body { @apply font-sans antialiased bg-background text-foreground; }
}

@layer utilities {
  input[type="search"]::-webkit-search-cancel-button { @apply hidden; }
  [contenteditable][data-placeholder]:empty::before {
    content: attr(data-placeholder);
    color: hsl(var(--muted-foreground));
    pointer-events: none;
  }
  .no-default-hover-elevate {}
  .no-default-active-elevate {}
  .toggle-elevate::before, .toggle-elevate-2::before {
    content: ""; pointer-events: none; position: absolute; inset: 0px;
    border-radius: inherit; z-index: -1;
  }
  .toggle-elevate.toggle-elevated::before { background-color: var(--elevate-2); }
  .border.toggle-elevate::before { inset: -1px; }
  .hover-elevate:not(.no-default-hover-elevate),
  .active-elevate:not(.no-default-active-elevate),
  .hover-elevate-2:not(.no-default-hover-elevate),
  .active-elevate-2:not(.no-default-active-elevate) { position: relative; z-index: 0; }
  .hover-elevate:not(.no-default-hover-elevate)::after,
  .active-elevate:not(.no-default-active-elevate)::after,
  .hover-elevate-2:not(.no-default-hover-elevate)::after,
  .active-elevate-2:not(.no-default-active-elevate)::after {
    content: ""; pointer-events: none; position: absolute; inset: 0px;
    border-radius: inherit; z-index: 999;
  }
  .hover-elevate:hover:not(.no-default-hover-elevate)::after,
  .active-elevate:active:not(.no-default-active-elevate)::after { background-color: var(--elevate-1); }
  .hover-elevate-2:hover:not(.no-default-hover-elevate)::after,
  .active-elevate-2:active:not(.no-default-active-elevate)::after { background-color: var(--elevate-2); }
  .border.hover-elevate:not(.no-hover-interaction-elevate)::after,
  .border.active-elevate:not(.no-active-interaction-elevate)::after,
  .border.hover-elevate-2:not(.no-hover-interaction-elevate)::after,
  .border.active-elevate-2:not(.no-active-interaction-elevate)::after { inset: -1px; }
}
```

---

## 11. 設定檔

### vite.config.ts

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
});
```

### tailwind.config.ts

```ts
import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./client/index.html", "./client/src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      borderRadius: { lg: ".5625rem", md: ".375rem", sm: ".1875rem" },
      colors: {
        background: "hsl(var(--background) / <alpha-value>)",
        foreground: "hsl(var(--foreground) / <alpha-value>)",
        border: "hsl(var(--border) / <alpha-value>)",
        input: "hsl(var(--input) / <alpha-value>)",
        card: { DEFAULT: "hsl(var(--card) / <alpha-value>)", foreground: "hsl(var(--card-foreground) / <alpha-value>)", border: "hsl(var(--card-border) / <alpha-value>)" },
        popover: { DEFAULT: "hsl(var(--popover) / <alpha-value>)", foreground: "hsl(var(--popover-foreground) / <alpha-value>)", border: "hsl(var(--popover-border) / <alpha-value>)" },
        primary: { DEFAULT: "hsl(var(--primary) / <alpha-value>)", foreground: "hsl(var(--primary-foreground) / <alpha-value>)", border: "var(--primary-border)" },
        secondary: { DEFAULT: "hsl(var(--secondary) / <alpha-value>)", foreground: "hsl(var(--secondary-foreground) / <alpha-value>)", border: "var(--secondary-border)" },
        muted: { DEFAULT: "hsl(var(--muted) / <alpha-value>)", foreground: "hsl(var(--muted-foreground) / <alpha-value>)", border: "var(--muted-border)" },
        accent: { DEFAULT: "hsl(var(--accent) / <alpha-value>)", foreground: "hsl(var(--accent-foreground) / <alpha-value>)", border: "var(--accent-border)" },
        destructive: { DEFAULT: "hsl(var(--destructive) / <alpha-value>)", foreground: "hsl(var(--destructive-foreground) / <alpha-value>)", border: "var(--destructive-border)" },
        ring: "hsl(var(--ring) / <alpha-value>)",
        chart: { "1": "hsl(var(--chart-1) / <alpha-value>)", "2": "hsl(var(--chart-2) / <alpha-value>)", "3": "hsl(var(--chart-3) / <alpha-value>)", "4": "hsl(var(--chart-4) / <alpha-value>)", "5": "hsl(var(--chart-5) / <alpha-value>)" },
        sidebar: { ring: "hsl(var(--sidebar-ring) / <alpha-value>)", DEFAULT: "hsl(var(--sidebar) / <alpha-value>)", foreground: "hsl(var(--sidebar-foreground) / <alpha-value>)", border: "hsl(var(--sidebar-border) / <alpha-value>)" },
        "sidebar-primary": { DEFAULT: "hsl(var(--sidebar-primary) / <alpha-value>)", foreground: "hsl(var(--sidebar-primary-foreground) / <alpha-value>)", border: "var(--sidebar-primary-border)" },
        "sidebar-accent": { DEFAULT: "hsl(var(--sidebar-accent) / <alpha-value>)", foreground: "hsl(var(--sidebar-accent-foreground) / <alpha-value>)", border: "var(--sidebar-accent-border)" },
        status: { online: "rgb(34 197 94)", away: "rgb(245 158 11)", busy: "rgb(239 68 68)", offline: "rgb(156 163 175)" },
      },
      fontFamily: { sans: ["var(--font-sans)"], serif: ["var(--font-serif)"], mono: ["var(--font-mono)"] },
      keyframes: {
        "accordion-down": { from: { height: "0" }, to: { height: "var(--radix-accordion-content-height)" } },
        "accordion-up": { from: { height: "var(--radix-accordion-content-height)" }, to: { height: "0" } },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate"), require("@tailwindcss/typography")],
} satisfies Config;
```

### tsconfig.json

```json
{
  "include": ["client/src/**/*", "shared/**/*", "server/**/*"],
  "exclude": ["node_modules", "build", "dist", "**/*.test.ts"],
  "compilerOptions": {
    "incremental": true,
    "noEmit": true,
    "module": "ESNext",
    "strict": true,
    "lib": ["esnext", "dom", "dom.iterable"],
    "jsx": "preserve",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "allowImportingTsExtensions": true,
    "moduleResolution": "bundler",
    "baseUrl": ".",
    "types": ["node", "vite/client"],
    "paths": {
      "@/*": ["./client/src/*"],
      "@shared/*": ["./shared/*"]
    }
  }
}
```

### components.json

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.ts",
    "css": "client/src/index.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  }
}
```

### drizzle.config.ts

```ts
import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL },
});
```

---

## 12. shared/schema.ts (後端共用)

```ts
import { sql } from "drizzle-orm";
import { pgTable, text, varchar, serial, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({ username: true, password: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const anomalyReports = pgTable("anomaly_reports", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id"),
  employeeName: text("employee_name"),
  employeeCode: text("employee_code"),
  role: text("role"),
  lineUserId: text("line_user_id"),
  context: text("context").notNull(),
  clockStatus: text("clock_status"),
  clockType: text("clock_type"),
  clockTime: text("clock_time"),
  venueName: text("venue_name"),
  distance: text("distance"),
  failReason: text("fail_reason"),
  errorMsg: text("error_msg"),
  userNote: text("user_note"),
  imageUrls: text("image_urls").array(),
  reportText: text("report_text"),
  resolution: text("resolution").default("pending"),
  resolvedNote: text("resolved_note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAnomalyReportSchema = createInsertSchema(anomalyReports).omit({ id: true, createdAt: true });
export type InsertAnomalyReport = z.infer<typeof insertAnomalyReportSchema>;
export type AnomalyReport = typeof anomalyReports.$inferSelect;

export const notificationRecipients = pgTable("notification_recipients", {
  id: serial("id").primaryKey(),
  email: text("email").notNull(),
  label: text("label"),
  enabled: boolean("enabled").default(true).notNull(),
  notifyNewReport: boolean("notify_new_report").default(true).notNull(),
  notifyResolution: boolean("notify_resolution").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertNotificationRecipientSchema = createInsertSchema(notificationRecipients).omit({ id: true, createdAt: true });
export type InsertNotificationRecipient = z.infer<typeof insertNotificationRecipientSchema>;
export type NotificationRecipient = typeof notificationRecipients.$inferSelect;
```

---

## 13. 頁面程式碼（大型檔案）

以下頁面程式碼因為太大，請直接從專案中複製原始檔案：

| 頁面檔案 | 行數 | 說明 |
|----------|------|------|
| `client/src/pages/dashboard.tsx` | 1389 | 營運戰情總覽 |
| `client/src/pages/anomaly-reports.tsx` | 979 | 打卡異常管理 |
| `client/src/pages/announcements.tsx` | 742 | 公告審核中心 |
| `client/src/pages/analytics.tsx` | 573 | 決策與數據洞察 |
| `client/src/pages/system-health.tsx` | 395 | 微服務健康監控 |
| `client/src/pages/announcement-summary.tsx` | 338 | 公告分析總覽 |
| `client/src/pages/hr-audit.tsx` | 309 | HR 與權限稽核 |
| `client/src/pages/operations.tsx` | 194 | 跨館資源監控 |
| `client/src/pages/not-found.tsx` | 21 | 404 頁面 |

---

## 14. shadcn/ui 元件列表 (47 個)

所有元件位於 `client/src/components/ui/`，使用 shadcn "new-york" style：

```
accordion.tsx    alert-dialog.tsx  alert.tsx       aspect-ratio.tsx
avatar.tsx       badge.tsx         breadcrumb.tsx  button.tsx
calendar.tsx     card.tsx          carousel.tsx    chart.tsx
checkbox.tsx     collapsible.tsx   command.tsx     context-menu.tsx
dialog.tsx       drawer.tsx        dropdown-menu.tsx  form.tsx
hover-card.tsx   input-otp.tsx     input.tsx       label.tsx
menubar.tsx      navigation-menu.tsx  pagination.tsx  popover.tsx
progress.tsx     radio-group.tsx   resizable.tsx   scroll-area.tsx
select.tsx       separator.tsx     sheet.tsx       sidebar.tsx
skeleton.tsx     slider.tsx        switch.tsx      table.tsx
tabs.tsx         textarea.tsx      toaster.tsx     toast.tsx
toggle-group.tsx toggle.tsx        tooltip.tsx
```
