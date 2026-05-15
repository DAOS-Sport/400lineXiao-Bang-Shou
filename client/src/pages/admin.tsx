import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  LayoutDashboard, Webhook, ClipboardList, Megaphone,
  ScrollText, Users, Activity, CheckCircle2, AlertCircle,
  XCircle, RefreshCw, Zap, Server, Database, Clock,
  ArrowRight, TrendingUp, ChevronRight, Wifi, WifiOff,
  Bell, Shield, BarChart3, Menu, X,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ServiceHealth {
  overall: string; healthyCount: number; totalCount: number; checkedAt: string;
  services: Array<{ service: string; status: string; note: string }>;
}
interface TaskStats {
  total: number; completed: number; pending: number; completionRate: string;
  recentTasks: Array<{ id: string; text: string; status: string; groupId: string; createdAt: string }>;
}
interface AnnSummary {
  pendingReviewCount: number; approvedCount: number; rejectedCount: number; totalCandidates: number;
  byType: Record<string, number>;
  pipeline: { totalReceived: number; dropped: number; ruleMatched: number; needsAiReview: number; aiCalls: number; estimatedTokens: number };
}
interface AuditLog { id: string; level: string; category: string; message: string; timestamp: string; }
interface InterviewUser {
  id: string; userId: string; userName: string; isActive: boolean;
  canInterviewCheck: boolean; canInternalQuery: boolean; createdAt: string;
}
interface WebhookStats {
  recent: Array<{ ts: string; type: string; latencyMs: number; status: string }>;
  avgLatency: number; errorCount: number; successRate: string; total: number;
}
interface Overview {
  tasks: { total: number; pending: number };
  groups: { total: number; list: Array<{ id: string; name: string }> };
}

// ── Navigation ────────────────────────────────────────────────────────────────

type Section = 'overview' | 'webhook' | 'tasks' | 'announcements' | 'logs' | 'users';

const NAV_ITEMS: Array<{ id: Section; label: string; icon: any }> = [
  { id: 'overview',      label: '系統總覽',    icon: LayoutDashboard },
  { id: 'webhook',       label: 'Webhook 監控', icon: Webhook },
  { id: 'tasks',         label: '任務管理',    icon: ClipboardList },
  { id: 'announcements', label: '公告系統',    icon: Megaphone },
  { id: 'logs',          label: '系統日誌',    icon: ScrollText },
  { id: 'users',         label: '授權用戶',    icon: Users },
];

// ── Helper Components ─────────────────────────────────────────────────────────

function StatusDot({ status }: { status: string }) {
  const color = status === 'healthy' || status === 'ok'
    ? 'bg-emerald-400' : status === 'degraded' ? 'bg-amber-400' : 'bg-red-500';
  return <span className={`inline-block w-2 h-2 rounded-full ${color} animate-pulse`} />;
}

function MetricCard({ label, value, sub, color = 'text-gray-800', icon: Icon }: {
  label: string; value: string | number; sub?: string; color?: string; icon?: any;
}) {
  return (
    <Card className="border-0 shadow-sm bg-white hover:shadow-md transition-shadow">
      <CardContent className="pt-4 pb-4 px-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-1">{label}</p>
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
            {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
          </div>
          {Icon && <Icon className="w-8 h-8 text-gray-200" />}
        </div>
      </CardContent>
    </Card>
  );
}

function SectionHeader({ title, subtitle, onRefresh, refreshing }: {
  title: string; subtitle?: string; onRefresh?: () => void; refreshing?: boolean;
}) {
  return (
    <div className="flex items-center justify-between mb-5">
      <div>
        <h2 className="text-lg font-bold text-gray-900">{title}</h2>
        {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
      </div>
      {onRefresh && (
        <button onClick={onRefresh}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-[#1a3a5c] transition-colors px-3 py-1.5 rounded-lg hover:bg-gray-100">
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />刷新
        </button>
      )}
    </div>
  );
}

// ── Overview Section ──────────────────────────────────────────────────────────

function OverviewSection() {
  const { toast } = useToast();
  const { data: health, refetch, isFetching } = useQuery<ServiceHealth>({
    queryKey: ['/api/admin/dashboard/services-health'], refetchInterval: 30_000,
  });
  const { data: tasks } = useQuery<TaskStats>({ queryKey: ['/api/admin/tasks/stats'], refetchInterval: 30_000 });
  const { data: ann } = useQuery<AnnSummary>({ queryKey: ['/api/announcement-dashboard/summary'], refetchInterval: 30_000 });
  const { data: ov } = useQuery<Overview>({ queryKey: ['/api/admin/overview'], refetchInterval: 60_000 });

  const triggerTasks = useMutation({
    mutationFn: () => apiRequest('POST', '/api/admin/trigger-tasks'),
    onSuccess: () => toast({ title: '✅ 任務提醒已觸發' }),
    onError: () => toast({ title: '❌ 觸發失敗', variant: 'destructive' }),
  });
  const triggerForecast = useMutation({
    mutationFn: () => apiRequest('POST', '/api/admin/trigger-combined-forecast'),
    onSuccess: () => toast({ title: '✅ 天氣預報已觸發' }),
    onError: () => toast({ title: '❌ 觸發失敗', variant: 'destructive' }),
  });

  const overallOk = health?.overall === 'healthy';

  return (
    <div className="space-y-6">
      <SectionHeader title="系統總覽"
        subtitle={`最後更新：${health?.checkedAt ? new Date(health.checkedAt).toLocaleTimeString('zh-TW') : '—'}`}
        onRefresh={() => refetch()} refreshing={isFetching} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label="服務健康" value={`${health?.healthyCount ?? 0}/${health?.totalCount ?? 0}`}
          sub={overallOk ? '全部正常' : '有服務異常'} color={overallOk ? 'text-emerald-600' : 'text-red-500'} icon={Activity} />
        <MetricCard label="任務總數" value={tasks?.total ?? '—'} sub={`${tasks?.pending ?? 0} 個待處理`} color="text-[#1a3a5c]" icon={ClipboardList} />
        <MetricCard label="待審公告" value={ann?.pendingReviewCount ?? '—'} sub={`已核准 ${ann?.approvedCount ?? 0} 則`} color="text-amber-600" icon={Megaphone} />
        <MetricCard label="活躍群組" value={ov?.groups?.total ?? '—'} sub="LINE 群組" color="text-violet-600" icon={Server} />
      </div>

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3 pt-4 px-5">
          <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <Activity className="w-4 h-4 text-[#1a3a5c]" />微服務健康狀態
          </CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {health?.services.map(s => (
              <div key={s.service} className="flex items-start gap-2.5 p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors">
                <StatusDot status={s.status} />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-gray-700 truncate">{s.service}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{s.note}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3 pt-4 px-5">
          <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-500" />快捷操作
          </CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-4">
          <div className="flex flex-wrap gap-3">
            <Button size="sm" onClick={() => triggerTasks.mutate()} disabled={triggerTasks.isPending}
              className="bg-[#1a3a5c] hover:bg-[#15304d] text-white h-9 px-4 text-xs">
              <Bell className="w-3.5 h-3.5 mr-1.5" />
              {triggerTasks.isPending ? '發送中…' : '手動觸發任務提醒'}
            </Button>
            <Button size="sm" variant="outline" onClick={() => triggerForecast.mutate()} disabled={triggerForecast.isPending}
              className="border-sky-300 text-sky-600 hover:bg-sky-50 h-9 px-4 text-xs">
              <Activity className="w-3.5 h-3.5 mr-1.5" />
              {triggerForecast.isPending ? '發送中…' : '觸發天氣預報'}
            </Button>
            <Link href="/admin/announcements">
              <Button size="sm" variant="outline" className="border-violet-300 text-violet-600 hover:bg-violet-50 h-9 px-4 text-xs">
                <Megaphone className="w-3.5 h-3.5 mr-1.5" />公告審核中心
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {ann?.pipeline && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3 pt-4 px-5">
            <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-[#1a3a5c]" />今日公告管線（精準過濾引擎）
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-4 space-y-3">
            {[
              { label: '收到訊息', value: ann.pipeline.totalReceived, color: 'bg-blue-500' },
              { label: '規則直判', value: ann.pipeline.ruleMatched, color: 'bg-emerald-500' },
              { label: 'AI 分析',  value: ann.pipeline.needsAiReview, color: 'bg-violet-500' },
              { label: '已丟棄',  value: ann.pipeline.dropped, color: 'bg-gray-300' },
            ].map(item => (
              <div key={item.label}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-gray-500">{item.label}</span>
                  <span className="font-semibold text-gray-700">{item.value}</span>
                </div>
                <Progress value={ann.pipeline.totalReceived > 0 ? (item.value / ann.pipeline.totalReceived) * 100 : 0} className="h-1.5" />
              </div>
            ))}
            <p className="text-xs text-gray-400 pt-1">估算 token 用量：{ann.pipeline.estimatedTokens?.toLocaleString() ?? 0} tokens</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Webhook 監控 Section ──────────────────────────────────────────────────────

function WebhookSection() {
  const [pingHistory, setPingHistory] = useState<number[]>([]);
  const [isPinging, setIsPinging] = useState(false);
  const [apiLatency, setApiLatency] = useState<number | null>(null);
  const [autoPing, setAutoPing] = useState(false);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: whStats, refetch, isFetching } = useQuery<WebhookStats>({
    queryKey: ['/api/admin/webhook-stats'], refetchInterval: 10_000,
  });

  const doPing = useCallback(async () => {
    if (isPinging) return;
    setIsPinging(true);
    const t0 = Date.now();
    try {
      await fetch('/api/admin/webhook-ping');
      const ms = Date.now() - t0;
      setApiLatency(ms);
      setPingHistory(h => [...h.slice(-29), ms]);
    } catch { setApiLatency(-1); }
    finally { setIsPinging(false); }
  }, [isPinging]);

  useEffect(() => {
    if (autoPing) { pingIntervalRef.current = setInterval(doPing, 3000); }
    else { if (pingIntervalRef.current) clearInterval(pingIntervalRef.current); }
    return () => { if (pingIntervalRef.current) clearInterval(pingIntervalRef.current); };
  }, [autoPing, doPing]);

  const latencyColor = (ms: number | null) => {
    if (ms === null) return 'text-gray-400';
    if (ms < 0) return 'text-red-500';
    if (ms < 100) return 'text-emerald-500';
    if (ms < 300) return 'text-amber-500';
    return 'text-red-500';
  };
  const maxPing = Math.max(...pingHistory, 1);

  return (
    <div className="space-y-6">
      <SectionHeader title="LINE Webhook 監控" subtitle="量測 API round-trip 延遲 + Webhook 事件記錄" onRefresh={refetch} refreshing={isFetching} />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-0 shadow-sm sm:col-span-2">
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Wifi className="w-4 h-4 text-[#1a3a5c]" />API 延遲量測（Ping）
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-4 space-y-4">
            <div className="flex items-center gap-5">
              <div className="text-center">
                <p className={`text-4xl font-bold font-mono ${latencyColor(apiLatency)}`}>
                  {apiLatency === null ? '—' : apiLatency < 0 ? 'ERR' : String(apiLatency)}
                </p>
                <p className="text-xs text-gray-400 mt-1">ms（最新）</p>
              </div>
              <div className="flex-1 space-y-2">
                <div className="flex gap-2">
                  <Button size="sm" onClick={doPing} disabled={isPinging}
                    className="bg-[#1a3a5c] hover:bg-[#15304d] text-white h-8 text-xs px-4">
                    {isPinging ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                    <span className="ml-1.5">{isPinging ? 'Ping…' : 'Ping'}</span>
                  </Button>
                  <Button size="sm" variant={autoPing ? 'default' : 'outline'} onClick={() => setAutoPing(v => !v)}
                    className={`h-8 text-xs px-3 ${autoPing ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'border-emerald-400 text-emerald-600 hover:bg-emerald-50'}`}>
                    {autoPing ? '⏸ 停止' : '▶ 自動 3s'}
                  </Button>
                </div>
                {autoPing && (
                  <p className="text-xs text-gray-400 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse inline-block" />每 3 秒自動量測
                  </p>
                )}
              </div>
            </div>
            {pingHistory.length > 0 && (
              <div>
                <p className="text-xs text-gray-400 mb-2">最近 {pingHistory.length} 次 Ping</p>
                <div className="flex items-end gap-0.5 h-14">
                  {pingHistory.map((ms, i) => (
                    <div key={i} title={`${ms}ms`}
                      className={`flex-1 rounded-sm ${ms < 100 ? 'bg-emerald-400' : ms < 300 ? 'bg-amber-400' : 'bg-red-400'}`}
                      style={{ height: `${Math.max(8, (ms / maxPing) * 100)}%` }} />
                  ))}
                </div>
                <div className="flex justify-between text-xs text-gray-300 mt-1">
                  <span>min {Math.min(...pingHistory)}ms</span>
                  <span>avg {Math.round(pingHistory.reduce((a, b) => a + b, 0) / pingHistory.length)}ms</span>
                  <span>max {Math.max(...pingHistory)}ms</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-sm font-semibold text-gray-700">Webhook 統計</CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-4 space-y-3">
            {[
              { label: '平均處理', value: whStats ? `${whStats.avgLatency}ms` : '—', color: 'text-[#1a3a5c]' },
              { label: '成功率', value: whStats?.successRate ?? '—', color: 'text-emerald-600' },
              { label: '錯誤次數', value: String(whStats?.errorCount ?? 0), color: 'text-red-500' },
              { label: '總事件數', value: String(whStats?.total ?? 0), color: 'text-gray-600' },
            ].map(item => (
              <div key={item.label} className="flex justify-between items-center">
                <span className="text-xs text-gray-400">{item.label}</span>
                <span className={`text-sm font-bold ${item.color}`}>{item.value}</span>
              </div>
            ))}
            <Separator />
            <p className="text-xs text-gray-300">最近 50 筆事件（重啟後重置）</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2 pt-4 px-5">
          <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <ScrollText className="w-4 h-4 text-[#1a3a5c]" />近期 Webhook 事件
            <Badge variant="outline" className="text-xs ml-auto font-mono">{whStats?.recent?.length ?? 0} 筆</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-4">
          {!whStats?.recent?.length ? (
            <div className="text-center py-8 text-gray-300">
              <WifiOff className="w-8 h-8 mx-auto mb-2" />
              <p className="text-sm">尚無 Webhook 事件（LINE 發送訊息後才有記錄）</p>
            </div>
          ) : (
            <ScrollArea className="h-60">
              <div className="space-y-1.5">
                {whStats.recent.map((ev, i) => (
                  <div key={i} className="flex items-center gap-3 py-2 px-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${ev.status === 'ok' ? 'bg-emerald-400' : 'bg-red-400'}`} />
                    <span className="text-xs font-mono text-gray-400 shrink-0 w-20">{new Date(ev.ts).toLocaleTimeString('zh-TW')}</span>
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full shrink-0">{ev.type}</span>
                    <span className={`text-xs font-bold font-mono ml-auto shrink-0 ${ev.latencyMs < 300 ? 'text-emerald-600' : 'text-amber-600'}`}>
                      {ev.latencyMs}ms
                    </span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Tasks Section ─────────────────────────────────────────────────────────────

function TasksSection() {
  const { toast } = useToast();
  const { data, refetch, isFetching } = useQuery<TaskStats>({
    queryKey: ['/api/admin/tasks/stats'], refetchInterval: 30_000,
  });
  const triggerTasks = useMutation({
    mutationFn: () => apiRequest('POST', '/api/admin/trigger-tasks'),
    onSuccess: () => toast({ title: '✅ 任務提醒已觸發' }),
    onError: () => toast({ title: '❌ 觸發失敗', variant: 'destructive' }),
  });

  return (
    <div className="space-y-6">
      <SectionHeader title="任務管理" subtitle="所有群組任務統計與近期記錄" onRefresh={refetch} refreshing={isFetching} />
      <div className="grid grid-cols-3 gap-4">
        <MetricCard label="全部任務" value={data?.total ?? '—'} icon={ClipboardList} />
        <MetricCard label="待處理" value={data?.pending ?? '—'} color="text-amber-600" icon={AlertCircle} />
        <MetricCard label="完成率" value={data?.completionRate ?? '—'} color="text-emerald-600" icon={CheckCircle2} />
      </div>
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2 pt-4 px-5">
          <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-[#1a3a5c]" />近期任務
          </CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-4">
          <ScrollArea className="h-80">
            <div className="space-y-2">
              {data?.recentTasks.map(t => (
                <div key={t.id} className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors">
                  <span className={`mt-1 w-2 h-2 rounded-full shrink-0 ${t.status === 'completed' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-700 line-clamp-2">{t.text}</p>
                    <p className="text-xs text-gray-300 mt-1">{t.groupId.substring(0, 16)}… · {new Date(t.createdAt).toLocaleDateString('zh-TW', { month: '2-digit', day: '2-digit' })}</p>
                  </div>
                  <Badge variant="outline" className={`text-xs shrink-0 ${t.status === 'completed' ? 'border-emerald-300 text-emerald-600' : 'border-amber-300 text-amber-600'}`}>
                    {t.status === 'completed' ? '完成' : '待辦'}
                  </Badge>
                </div>
              ))}
              {(!data?.recentTasks || data.recentTasks.length === 0) && (
                <div className="text-center py-8 text-gray-300"><p className="text-sm">暫無任務記錄</p></div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
      <Button size="sm" onClick={() => triggerTasks.mutate()} disabled={triggerTasks.isPending}
        className="bg-[#1a3a5c] hover:bg-[#15304d] text-white h-9 text-xs">
        <Bell className="w-3.5 h-3.5 mr-1.5" />
        {triggerTasks.isPending ? '發送中…' : '立即發送任務提醒'}
      </Button>
    </div>
  );
}

// ── Announcements Section ─────────────────────────────────────────────────────

function AnnouncementsSection() {
  const { data: ann, refetch, isFetching } = useQuery<AnnSummary>({
    queryKey: ['/api/announcement-dashboard/summary'], refetchInterval: 30_000,
  });
  const TYPE_LABEL: Record<string, string> = {
    rule: '規則/SOP', notice: '通知公告', campaign: '活動', discount: '優惠', script: '說詞',
  };

  return (
    <div className="space-y-6">
      <SectionHeader title="公告系統" subtitle="精準過濾引擎統計 + 審核中心" onRefresh={refetch} refreshing={isFetching} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label="待審" value={ann?.pendingReviewCount ?? '—'} color="text-amber-600" icon={Clock} />
        <MetricCard label="已核准" value={ann?.approvedCount ?? '—'} color="text-emerald-600" icon={CheckCircle2} />
        <MetricCard label="已退回" value={ann?.rejectedCount ?? '—'} color="text-red-500" icon={XCircle} />
        <MetricCard label="總候選" value={ann?.totalCandidates ?? '—'} icon={Database} />
      </div>

      {ann?.byType && Object.keys(ann.byType).length > 0 && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-sm font-semibold text-gray-700">按類型分布</CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-4 space-y-2">
            {Object.entries(ann.byType).map(([type, count]) => {
              const total = Object.values(ann.byType).reduce((a, b) => a + b, 0) || 1;
              return (
                <div key={type}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-500">{TYPE_LABEL[type] ?? type}</span>
                    <span className="font-semibold text-gray-700">{count}</span>
                  </div>
                  <Progress value={(count / total) * 100} className="h-1.5" />
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {ann?.pipeline && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-[#1a3a5c]" />今日管線數據
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                { label: '收到訊息', value: ann.pipeline.totalReceived },
                { label: '規則直判', value: ann.pipeline.ruleMatched },
                { label: 'AI 分析送出', value: ann.pipeline.needsAiReview },
                { label: '已丟棄', value: ann.pipeline.dropped },
                { label: 'AI 呼叫', value: ann.pipeline.aiCalls },
                { label: '估算 tokens', value: (ann.pipeline.estimatedTokens ?? 0).toLocaleString() },
              ].map(item => (
                <div key={item.label} className="bg-gray-50 rounded-lg p-3 text-center">
                  <p className="text-lg font-bold text-gray-800">{item.value ?? '—'}</p>
                  <p className="text-xs text-gray-400">{item.label}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-3 flex-wrap">
        <Link href="/admin/announcements">
          <Button size="sm" className="bg-[#1a3a5c] hover:bg-[#15304d] text-white h-9 text-xs">
            <Megaphone className="w-3.5 h-3.5 mr-1.5" />公告審核中心<ChevronRight className="w-3.5 h-3.5 ml-1" />
          </Button>
        </Link>
        <Link href="/announcements">
          <Button size="sm" variant="outline" className="border-[#1a3a5c] text-[#1a3a5c] hover:bg-blue-50 h-9 text-xs">
            <BarChart3 className="w-3.5 h-3.5 mr-1.5" />候選列表（進階）
          </Button>
        </Link>
        <Link href="/announcements/summary">
          <Button size="sm" variant="outline" className="border-gray-300 text-gray-600 hover:bg-gray-50 h-9 text-xs">
            <BarChart3 className="w-3.5 h-3.5 mr-1.5" />統計總覽
          </Button>
        </Link>
      </div>
    </div>
  );
}

// ── Logs Section ──────────────────────────────────────────────────────────────

function LogsSection() {
  const [levelFilter, setLevelFilter] = useState('');
  const { data, refetch, isFetching } = useQuery<{ success: boolean; logs: AuditLog[] }>({
    queryKey: ['/api/admin/audit-logs'], refetchInterval: 15_000,
  });
  const logs = data?.logs ?? [];
  const filtered = levelFilter ? logs.filter(l => l.level === levelFilter) : logs;
  const levelStyle: Record<string, string> = {
    info: 'bg-blue-100 text-blue-700', warn: 'bg-amber-100 text-amber-700',
    error: 'bg-red-100 text-red-600', debug: 'bg-gray-100 text-gray-500',
  };

  return (
    <div className="space-y-6">
      <SectionHeader title="系統日誌" subtitle="審計日誌 + 事件追蹤" onRefresh={refetch} refreshing={isFetching} />
      <div className="flex gap-2 flex-wrap">
        {['', 'info', 'warn', 'error', 'debug'].map(lv => (
          <button key={lv} onClick={() => setLevelFilter(lv)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-all ${levelFilter === lv ? 'bg-[#1a3a5c] text-white border-[#1a3a5c]' : 'border-gray-200 text-gray-500 hover:border-gray-400'}`}>
            {lv === '' ? '全部' : lv.toUpperCase()}
            {lv !== '' && <span className="ml-1.5 font-bold">{logs.filter(l => l.level === lv).length}</span>}
          </button>
        ))}
      </div>
      <Card className="border-0 shadow-sm">
        <CardContent className="p-0">
          <ScrollArea className="h-[32rem]">
            <div className="divide-y divide-gray-50">
              {filtered.slice(0, 200).map(log => (
                <div key={log.id} className="flex items-start gap-3 px-5 py-3 hover:bg-gray-50 transition-colors">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 mt-0.5 ${levelStyle[log.level] ?? 'bg-gray-100 text-gray-500'}`}>
                    {log.level}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-700 break-words">{log.message}</p>
                    <p className="text-xs text-gray-300 mt-0.5">{log.category} · {log.timestamp ? new Date(log.timestamp).toLocaleString('zh-TW') : '—'}</p>
                  </div>
                </div>
              ))}
              {filtered.length === 0 && (
                <div className="text-center py-12 text-gray-300">
                  <ScrollText className="w-8 h-8 mx-auto mb-2" /><p className="text-sm">沒有符合條件的日誌</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Users Section ─────────────────────────────────────────────────────────────

function UsersSection() {
  const { toast } = useToast();
  const { data, refetch, isFetching } = useQuery<{ success: boolean; users: InterviewUser[] }>({
    queryKey: ['/api/admin/interview-users'], refetchInterval: 60_000,
  });
  const users = data?.users ?? [];

  const [showAdd, setShowAdd] = useState(false);
  const [newUserId, setNewUserId] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [newCanInterview, setNewCanInterview] = useState(true);
  const [newCanInternal, setNewCanInternal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const addMutation = useMutation({
    mutationFn: () => apiRequest('POST', '/api/admin/interview-users', {
      userId: newUserId.trim(), userName: newUserName.trim(),
      canInterviewCheck: newCanInterview, canInternalQuery: newCanInternal,
    }),
    onSuccess: () => {
      toast({ title: '已新增授權用戶' });
      setShowAdd(false); setNewUserId(''); setNewUserName('');
      queryClient.invalidateQueries({ queryKey: ['/api/admin/interview-users'] });
    },
    onError: (e: any) => toast({ title: '新增失敗', description: e?.message, variant: 'destructive' }),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ userId, isActive }: { userId: string; isActive: boolean }) =>
      apiRequest('PATCH', `/api/admin/interview-users/${encodeURIComponent(userId)}`, { isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/admin/interview-users'] }),
    onError: (e: any) => toast({ title: '更新失敗', description: e?.message, variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: (userId: string) =>
      apiRequest('DELETE', `/api/admin/interview-users/${encodeURIComponent(userId)}`),
    onSuccess: () => {
      toast({ title: '已刪除授權用戶' });
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ['/api/admin/interview-users'] });
    },
    onError: (e: any) => toast({ title: '刪除失敗', description: e?.message, variant: 'destructive' }),
  });

  return (
    <div className="space-y-6">
      <SectionHeader title="面試檢核授權用戶" subtitle="可執行面試資格查核的授權名單" onRefresh={refetch} refreshing={isFetching} />
      <div className="grid grid-cols-2 gap-4">
        <MetricCard label="總授權用戶" value={users.length} icon={Users} />
        <MetricCard label="啟用中" value={users.filter(u => u.isActive).length} color="text-emerald-600" icon={CheckCircle2} />
      </div>

      {/* 新增表單 */}
      {showAdd ? (
        <Card className="border-0 shadow-sm bg-blue-50">
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-sm font-semibold text-gray-700">新增授權用戶</CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">LINE User ID *</label>
                <input value={newUserId} onChange={e => setNewUserId(e.target.value)}
                  placeholder="Uxxxxxxxxxx..."
                  className="w-full text-sm border border-gray-200 rounded-md px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-[#1a3a5c]" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">姓名 *</label>
                <input value={newUserName} onChange={e => setNewUserName(e.target.value)}
                  placeholder="例：王小明"
                  className="w-full text-sm border border-gray-200 rounded-md px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-[#1a3a5c]" />
              </div>
            </div>
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={newCanInterview} onChange={e => setNewCanInterview(e.target.checked)}
                  className="w-3.5 h-3.5 accent-[#1a3a5c]" />
                <span className="text-gray-600">面試查核</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={newCanInternal} onChange={e => setNewCanInternal(e.target.checked)}
                  className="w-3.5 h-3.5 accent-[#1a3a5c]" />
                <span className="text-gray-600">內部查詢</span>
              </label>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => addMutation.mutate()} disabled={addMutation.isPending || !newUserId.trim() || !newUserName.trim()}
                className="bg-[#1a3a5c] hover:bg-[#15304d] text-white h-8 text-xs">
                {addMutation.isPending ? '儲存中…' : '確認新增'}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowAdd(false)} className="h-8 text-xs">取消</Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Button size="sm" onClick={() => setShowAdd(true)}
          className="bg-[#1a3a5c] hover:bg-[#15304d] text-white h-9 text-xs">
          <Users className="w-3.5 h-3.5 mr-1.5" />新增授權用戶
        </Button>
      )}

      {/* 刪除確認對話框 */}
      {deleteTarget && (
        <Card className="border border-red-200 shadow-sm bg-red-50">
          <CardContent className="px-5 py-4">
            <p className="text-sm text-red-700 mb-3">確定要刪除 <span className="font-mono font-semibold">{deleteTarget}</span> 的授權嗎？此操作不可復原。</p>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => deleteMutation.mutate(deleteTarget)} disabled={deleteMutation.isPending}
                className="bg-red-600 hover:bg-red-700 text-white h-8 text-xs">
                {deleteMutation.isPending ? '刪除中…' : '確認刪除'}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setDeleteTarget(null)} className="h-8 text-xs">取消</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-0 shadow-sm">
        <CardContent className="p-0">
          <div className="divide-y divide-gray-50">
            {users.map(u => (
              <div key={u.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50 transition-colors">
                <div className="w-8 h-8 rounded-full bg-[#1a3a5c] flex items-center justify-center shrink-0">
                  <span className="text-white text-xs font-bold">{u.userName.charAt(0)}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800">{u.userName}</p>
                  <p className="text-xs text-gray-400 font-mono truncate">{u.userId}</p>
                </div>
                <div className="flex gap-1.5 shrink-0 items-center">
                  {u.canInterviewCheck && <Badge className="text-xs bg-blue-100 text-blue-700 border-0">面試查核</Badge>}
                  {u.canInternalQuery && <Badge className="text-xs bg-violet-100 text-violet-700 border-0">內部查詢</Badge>}
                  <button
                    onClick={() => toggleMutation.mutate({ userId: u.userId, isActive: !u.isActive })}
                    className={`text-xs px-2 py-0.5 rounded-full border transition-all ${u.isActive ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100' : 'bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100'}`}>
                    {u.isActive ? '啟用' : '停用'}
                  </button>
                  <button onClick={() => setDeleteTarget(u.userId)}
                    className="text-gray-300 hover:text-red-500 transition-colors p-1 rounded" title="刪除">
                    <XCircle className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
            {users.length === 0 && (
              <div className="text-center py-12 text-gray-300"><Users className="w-8 h-8 mx-auto mb-2" /><p className="text-sm">暫無授權用戶</p></div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Main Admin Page ───────────────────────────────────────────────────────────

export default function AdminPage() {
  const [section, setSection] = useState<Section>('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const { data: health } = useQuery<ServiceHealth>({
    queryKey: ['/api/admin/dashboard/services-health'], refetchInterval: 30_000,
  });
  const overallOk = health?.overall === 'healthy';

  const SECTION_MAP: Record<Section, JSX.Element> = {
    overview: <OverviewSection />,
    webhook: <WebhookSection />,
    tasks: <TasksSection />,
    announcements: <AnnouncementsSection />,
    logs: <LogsSection />,
    users: <UsersSection />,
  };

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/40 z-20 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`fixed lg:static inset-y-0 left-0 z-30 w-60 bg-[#1a3a5c] flex flex-col transition-transform duration-200 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="px-5 py-5 border-b border-[#243f63]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
              <Shield className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-white text-sm font-bold leading-tight">駿斯小助理</p>
              <p className="text-blue-300 text-xs">管理後台</p>
            </div>
          </div>
        </div>

        <div className="px-5 py-3 border-b border-[#243f63]">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${overallOk ? 'bg-emerald-400 animate-pulse' : 'bg-red-400 animate-pulse'}`} />
            <span className="text-xs text-blue-200">
              {overallOk ? '全部服務正常' : '有服務異常'} · {health?.healthyCount ?? '…'}/{health?.totalCount ?? '…'}
            </span>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map(item => {
            const Icon = item.icon;
            const active = section === item.id;
            return (
              <button key={item.id} onClick={() => { setSection(item.id); setSidebarOpen(false); }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all text-sm ${active ? 'bg-white/15 text-white font-medium' : 'text-blue-200 hover:bg-white/10 hover:text-white'}`}>
                <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-white' : 'text-blue-300'}`} />
                {item.label}
                {active && <ChevronRight className="w-3.5 h-3.5 ml-auto text-blue-300" />}
              </button>
            );
          })}
        </nav>

        <div className="px-5 py-4 border-t border-[#243f63] space-y-3">
          <div className="text-blue-200 text-xs font-mono">
            {now.toLocaleTimeString('zh-TW', { hour12: false })}
            <span className="block text-blue-300 text-xs mt-0.5">{now.toLocaleDateString('zh-TW')}</span>
          </div>
          <div className="flex gap-2 text-xs flex-wrap">
            <Link href="/" className="text-blue-300 hover:text-white transition-colors">首頁</Link>
            <span className="text-blue-400">·</span>
            <Link href="/admin/announcements" className="text-blue-300 hover:text-white transition-colors font-semibold">審核中心</Link>
            <span className="text-blue-400">·</span>
            <Link href="/announcements" className="text-blue-300 hover:text-white transition-colors">公告列表</Link>
            <span className="text-blue-400">·</span>
            <Link href="/duty" className="text-blue-300 hover:text-white transition-colors">值班首頁</Link>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="bg-white border-b border-gray-100 px-5 py-3.5 flex items-center gap-4 shrink-0">
          <button onClick={() => setSidebarOpen(v => !v)} className="lg:hidden text-gray-500 hover:text-gray-700 p-1 rounded-md">
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <div className="flex items-center gap-2 min-w-0">
            <ArrowRight className="w-4 h-4 text-gray-300 shrink-0" />
            <h1 className="text-sm font-semibold text-gray-800 truncate">
              {NAV_ITEMS.find(n => n.id === section)?.label}
            </h1>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-gray-400">
              <span className={`w-2 h-2 rounded-full ${overallOk ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
              {overallOk ? '健康' : '異常'}
            </div>
            <span className="hidden md:block text-xs text-gray-300 font-mono">
              {now.toLocaleTimeString('zh-TW', { hour12: false })}
            </span>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-5 py-6 md:px-8">
          {SECTION_MAP[section]}
        </main>
      </div>
    </div>
  );
}
