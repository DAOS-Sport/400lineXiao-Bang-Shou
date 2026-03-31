import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// ─── Type definitions ───────────────────────────────────────────────
interface ServicesHealth {
  overall: string;
  healthyCount: number;
  totalCount: number;
  services: Array<{ service: string; status: string; note: string }>;
  checkedAt: string;
}
interface TasksStats {
  total: number;
  completed: number;
  pending: number;
  completionRate: string;
  recentTasks: Array<{ id: string; text: string; status: string; groupId: string; createdAt: string }>;
  byGroup: Record<string, { total: number; completed: number; pending: number }>;
}
interface AnnouncementSummary {
  pendingReviewCount: number;
  approvedCount: number;
  rejectedCount: number;
  totalCandidates: number;
  supervisorCount: number;
  byType: Record<string, number>;
  byFacility: Record<string, number>;
  confidenceDist: { high: number; mid: number; low: number };
}
interface FeatureStats {
  groups: Array<{ name: string; groupId: string; 任務交辦: number; 天氣預報: number; GPS打卡: number; totalEnabled: number }>;
  featurePenetration: Array<{ feature: string; count: number; rate: number }>;
  totalGroups: number;
}
interface AuditLogs {
  logs: Array<{ id: string; level: string; category: string; message: string; timestamp: string }>;
}

// ─── Helpers ────────────────────────────────────────────────────────
const GROUP_NAME: Record<string, string> = {
  C66a4b3bb3fbc3dcf52d42626ec512484: '新北高中',
  C6f6f163895d5b528a6ab044015e1a37b: '三重商工',
  C2dc6991e51074dd47d5d275d568318f7: '三民高中',
  C9b3c5dfe2e005adafd2ed914714a1930: '松山國小',
  C50c2a9623a78cc5f5e9f39557e3abfe6: '竹科游泳池',
  C360be1fe6ea876a4df3ca0497bca4e3b: '竹科高爾夫',
  C2dd9a5fce7c276f2cbfdd02c2342661c: '三民排班群',
  Ce936c6bebb59b8b5683ffbcf97bf20de: '原授權群組',
  Cf7ab973766c258e5b4b4f040d35b2175: '駿斯IT技術群',
};

function groupName(id: string) {
  return GROUP_NAME[id] ?? id.slice(0, 10) + '…';
}

function fmtTime(ts: string) {
  try {
    return new Intl.DateTimeFormat('zh-TW', {
      timeZone: 'Asia/Taipei',
      month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    }).format(new Date(ts));
  } catch {
    return ts;
  }
}

function LiveClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const str = new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).format(now);
  const dateStr = new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei',
    year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
  }).format(now);
  return (
    <div className="text-right leading-tight">
      <div className="text-[10px] text-blue-200">{dateStr}</div>
      <div className="text-lg font-mono font-bold text-white tracking-wider">{str}</div>
    </div>
  );
}

function Dot({ ok }: { ok: boolean }) {
  return <span className={`inline-block w-2 h-2 rounded-full ${ok ? 'bg-green-400' : 'bg-red-400'}`} />;
}

function StatCard({ label, value, sub, color }: { label: string; value: number | string; sub?: string; color: string }) {
  return (
    <div className={`rounded-xl p-3 ${color} flex flex-col gap-0.5`}>
      <div className="text-xs font-medium opacity-75">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
      {sub && <div className="text-[11px] opacity-60">{sub}</div>}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'healthy') return <Badge className="bg-green-100 text-green-700 text-[10px] px-1.5 py-0">正常</Badge>;
  if (status === 'degraded') return <Badge className="bg-yellow-100 text-yellow-700 text-[10px] px-1.5 py-0">降速</Badge>;
  return <Badge className="bg-red-100 text-red-700 text-[10px] px-1.5 py-0">異常</Badge>;
}

function TaskStatusBadge({ status }: { status: string }) {
  if (status === 'completed') return <Badge className="bg-green-100 text-green-700 text-[10px] px-1.5">✓ 完成</Badge>;
  return <Badge className="bg-orange-100 text-orange-700 text-[10px] px-1.5">⏳ 待辦</Badge>;
}

// ─── Main Dashboard ─────────────────────────────────────────────────
export default function DashboardPage() {
  const opts = { refetchInterval: 30_000 };

  const { data: health } = useQuery<ServicesHealth>({
    queryKey: ['/api/admin/dashboard/services-health'],
    ...opts,
  });
  const { data: taskStats } = useQuery<TasksStats>({
    queryKey: ['/api/admin/tasks/stats'],
    ...opts,
  });
  const { data: announce } = useQuery<AnnouncementSummary>({
    queryKey: ['/api/announcement-dashboard/summary'],
    ...opts,
  });
  const { data: feats } = useQuery<FeatureStats>({
    queryKey: ['/api/admin/dashboard/feature-stats'],
    ...opts,
  });
  const { data: logs } = useQuery<AuditLogs>({
    queryKey: ['/api/admin/audit-logs'],
    ...opts,
  });

  const allOk = health?.overall === 'healthy';

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      {/* ── Header ── */}
      <header className="sticky top-0 z-40 bg-gradient-to-r from-[#1a3a5c] to-[#1e4976] shadow-lg px-4 py-3 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl">🤖</span>
            <span className="text-white font-bold text-base tracking-wide">駿斯小助理</span>
            <span className={`inline-block w-2.5 h-2.5 rounded-full border-2 border-white ${allOk ? 'bg-green-400' : 'bg-yellow-400'} animate-pulse`} />
          </div>
          <div className="text-blue-200 text-[10px] mt-0.5">智慧透視儀表板</div>
        </div>
        <LiveClock />
      </header>

      {/* ── Top Stats Row ── */}
      <div className="px-4 pt-4 grid grid-cols-2 gap-3">
        <StatCard
          label="待辦任務"
          value={taskStats?.pending ?? '—'}
          sub={`共 ${taskStats?.total ?? 0} 筆 · 完成率 ${taskStats?.completionRate ?? '—'}`}
          color="bg-orange-50 text-orange-800 border border-orange-200"
        />
        <StatCard
          label="已完成任務"
          value={taskStats?.completed ?? '—'}
          sub="累計完成"
          color="bg-green-50 text-green-800 border border-green-200"
        />
        <StatCard
          label="待審公告"
          value={announce?.pendingReviewCount ?? '—'}
          sub={`已核准 ${announce?.approvedCount ?? 0} · 已駁回 ${announce?.rejectedCount ?? 0}`}
          color="bg-purple-50 text-purple-800 border border-purple-200"
        />
        <StatCard
          label="服務狀態"
          value={`${health?.healthyCount ?? 0}/${health?.totalCount ?? 0}`}
          sub={allOk ? '所有服務正常' : '部分服務異常'}
          color={allOk ? 'bg-blue-50 text-blue-800 border border-blue-200' : 'bg-red-50 text-red-800 border border-red-200'}
        />
      </div>

      {/* ── Tabs ── */}
      <div className="px-4 pt-4 pb-8">
        <Tabs defaultValue="tasks">
          <TabsList className="grid w-full grid-cols-4 mb-4 h-9 text-xs">
            <TabsTrigger value="tasks">任務</TabsTrigger>
            <TabsTrigger value="announce">公告</TabsTrigger>
            <TabsTrigger value="groups">群組</TabsTrigger>
            <TabsTrigger value="system">系統</TabsTrigger>
          </TabsList>

          {/* ── TAB: Tasks ── */}
          <TabsContent value="tasks" className="space-y-3">
            {/* By-Group Summary */}
            <Card>
              <CardHeader className="pb-2 pt-3 px-4">
                <CardTitle className="text-sm text-gray-700">各群組任務概況</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-3 space-y-2">
                {taskStats?.byGroup
                  ? Object.entries(taskStats.byGroup).map(([gId, g]) => (
                    <div key={gId} className="flex items-center justify-between text-xs">
                      <span className="text-gray-600 truncate max-w-[120px]">{groupName(gId)}</span>
                      <div className="flex gap-1.5 items-center">
                        <span className="text-orange-600 font-semibold">待辦 {g.pending}</span>
                        <span className="text-gray-300">·</span>
                        <span className="text-green-600">完成 {g.completed}</span>
                      </div>
                    </div>
                  ))
                  : <div className="text-xs text-gray-400">載入中…</div>}
              </CardContent>
            </Card>

            {/* Recent Tasks */}
            <Card>
              <CardHeader className="pb-2 pt-3 px-4">
                <CardTitle className="text-sm text-gray-700">最近 10 筆任務</CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3 space-y-2">
                {taskStats?.recentTasks?.map(t => (
                  <div key={t.id} className="rounded-lg bg-gray-50 border border-gray-100 p-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs text-gray-700 leading-relaxed flex-1">{t.text}</p>
                      <TaskStatusBadge status={t.status} />
                    </div>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-[10px] text-blue-600 bg-blue-50 rounded px-1.5 py-0.5">{groupName(t.groupId)}</span>
                      <span className="text-[10px] text-gray-400">{fmtTime(t.createdAt)}</span>
                    </div>
                  </div>
                )) ?? <div className="text-xs text-gray-400 py-2">載入中…</div>}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── TAB: Announcements ── */}
          <TabsContent value="announce" className="space-y-3">
            {/* Summary Stats */}
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 text-center">
                <div className="text-xl font-bold text-purple-700">{announce?.pendingReviewCount ?? '—'}</div>
                <div className="text-[10px] text-purple-500 mt-0.5">待審</div>
              </div>
              <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
                <div className="text-xl font-bold text-green-700">{announce?.approvedCount ?? '—'}</div>
                <div className="text-[10px] text-green-500 mt-0.5">已核准</div>
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-center">
                <div className="text-xl font-bold text-gray-600">{announce?.rejectedCount ?? '—'}</div>
                <div className="text-[10px] text-gray-400 mt-0.5">已駁回</div>
              </div>
            </div>

            {/* By Type */}
            {announce?.byType && Object.keys(announce.byType).length > 0 && (
              <Card>
                <CardHeader className="pb-2 pt-3 px-4">
                  <CardTitle className="text-sm text-gray-700">公告類型分布</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-3 space-y-2">
                  {Object.entries(announce.byType).sort((a, b) => b[1] - a[1]).map(([type, cnt]) => {
                    const total = announce.totalCandidates || 1;
                    const pct = Math.round((cnt / total) * 100);
                    const typeLabel: Record<string, string> = {
                      notice: '📢 公告',
                      task: '📋 任務',
                      event: '📅 活動',
                      policy: '📜 政策',
                      report: '📊 報告',
                      other: '📌 其他',
                    };
                    return (
                      <div key={type} className="flex items-center gap-2">
                        <div className="text-xs text-gray-600 w-20 shrink-0">{typeLabel[type] ?? type}</div>
                        <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                          <div className="h-2 rounded-full bg-purple-400" style={{ width: `${pct}%` }} />
                        </div>
                        <div className="text-xs text-gray-500 w-8 text-right">{cnt}</div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}

            {/* By Facility */}
            {announce?.byFacility && Object.keys(announce.byFacility).length > 0 && (
              <Card>
                <CardHeader className="pb-2 pt-3 px-4">
                  <CardTitle className="text-sm text-gray-700">各場館公告數量</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-3 space-y-1.5">
                  {Object.entries(announce.byFacility).sort((a, b) => b[1] - a[1]).map(([fac, cnt]) => (
                    <div key={fac} className="flex items-center justify-between text-xs">
                      <span className="text-gray-600 truncate max-w-[160px]">{fac}</span>
                      <Badge className="bg-purple-100 text-purple-700 text-[10px]">{cnt} 筆</Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Confidence Distribution */}
            {announce?.confidenceDist && (
              <Card>
                <CardHeader className="pb-2 pt-3 px-4">
                  <CardTitle className="text-sm text-gray-700">AI 信心度分布</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-3">
                  <div className="flex gap-2">
                    {[
                      { label: '高（≥70%）', val: announce.confidenceDist.high, color: 'bg-green-400' },
                      { label: '中（40-70%）', val: announce.confidenceDist.mid, color: 'bg-yellow-400' },
                      { label: '低（＜40%）', val: announce.confidenceDist.low, color: 'bg-red-400' },
                    ].map(({ label, val, color }) => (
                      <div key={label} className="flex-1 text-center">
                        <div className={`h-8 rounded-md ${color} opacity-80 flex items-center justify-center text-white text-sm font-bold`}>{val}</div>
                        <div className="text-[9px] text-gray-500 mt-1 leading-tight">{label}</div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="text-center">
              <a
                href="/announcements"
                className="inline-block text-xs text-purple-600 underline underline-offset-2 py-2"
              >
                前往公告審核頁面 →
              </a>
            </div>
          </TabsContent>

          {/* ── TAB: Groups ── */}
          <TabsContent value="groups" className="space-y-2">
            {/* Feature Penetration */}
            {feats?.featurePenetration && (
              <Card>
                <CardHeader className="pb-2 pt-3 px-4">
                  <CardTitle className="text-sm text-gray-700">功能覆蓋率</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-3 space-y-2">
                  {feats.featurePenetration.map(fp => (
                    <div key={fp.feature} className="flex items-center gap-2">
                      <div className="text-xs text-gray-600 w-16 shrink-0">{fp.feature}</div>
                      <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                        <div className="h-2 rounded-full bg-blue-400" style={{ width: `${fp.rate}%` }} />
                      </div>
                      <div className="text-xs text-gray-500 w-16 text-right">{fp.count}/{feats.totalGroups} ({fp.rate}%)</div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Group Cards */}
            <div className="space-y-2">
              {feats?.groups?.map(g => (
                <div key={g.groupId} className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-base">📍</span>
                      <span className="text-sm font-semibold text-gray-800">{g.name}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-gray-400">{g.totalEnabled} 功能</span>
                    </div>
                  </div>
                  <div className="flex gap-1.5 mt-2 flex-wrap">
                    {g.任務交辦 ? <Badge className="bg-blue-100 text-blue-700 text-[10px]">📋 任務</Badge> : null}
                    {g.天氣預報 ? <Badge className="bg-sky-100 text-sky-700 text-[10px]">🌤 天氣</Badge> : null}
                    {g.GPS打卡 ? <Badge className="bg-green-100 text-green-700 text-[10px]">📍 GPS</Badge> : null}
                  </div>
                  <div className="mt-1.5 text-[10px] text-gray-400 font-mono truncate">{g.groupId}</div>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* ── TAB: System ── */}
          <TabsContent value="system" className="space-y-3">
            {/* Overall Health */}
            <div className={`rounded-xl p-4 flex items-center gap-3 ${allOk ? 'bg-green-50 border border-green-200' : 'bg-yellow-50 border border-yellow-200'}`}>
              <span className="text-3xl">{allOk ? '✅' : '⚠️'}</span>
              <div>
                <div className={`font-bold text-sm ${allOk ? 'text-green-700' : 'text-yellow-700'}`}>
                  {allOk ? '系統運行正常' : '部分服務異常'}
                </div>
                <div className="text-xs text-gray-500">
                  {health?.healthyCount}/{health?.totalCount} 服務正常 · 最後檢查 {health?.checkedAt ? fmtTime(health.checkedAt) : '—'}
                </div>
              </div>
            </div>

            {/* Services List */}
            <Card>
              <CardHeader className="pb-2 pt-3 px-4">
                <CardTitle className="text-sm text-gray-700">微服務狀態</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-3 space-y-2">
                {health?.services?.map(s => (
                  <div key={s.service} className="flex items-start gap-2">
                    <Dot ok={s.status === 'healthy'} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-gray-700 truncate">{s.service}</span>
                        <StatusBadge status={s.status} />
                      </div>
                      <div className="text-[10px] text-gray-400 mt-0.5">{s.note}</div>
                    </div>
                  </div>
                )) ?? <div className="text-xs text-gray-400">載入中…</div>}
              </CardContent>
            </Card>

            {/* Audit Logs */}
            <Card>
              <CardHeader className="pb-2 pt-3 px-4">
                <CardTitle className="text-sm text-gray-700">最近系統日誌</CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3 space-y-1.5">
                {logs?.logs?.slice(0, 15).map(l => {
                  const levelStyle: Record<string, string> = {
                    info: 'text-blue-600',
                    warn: 'text-yellow-600',
                    error: 'text-red-600',
                    debug: 'text-gray-400',
                  };
                  return (
                    <div key={l.id} className="rounded-lg bg-gray-50 border border-gray-100 px-2.5 py-2">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className={`text-[10px] font-bold uppercase ${levelStyle[l.level] ?? 'text-gray-500'}`}>{l.level}</span>
                        <span className="text-[10px] text-gray-400 bg-gray-100 rounded px-1">{l.category}</span>
                        <span className="text-[10px] text-gray-400 ml-auto">{fmtTime(l.timestamp)}</span>
                      </div>
                      <div className="text-[11px] text-gray-700 leading-snug line-clamp-2">{l.message}</div>
                    </div>
                  );
                }) ?? <div className="text-xs text-gray-400 py-2">載入中…</div>}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
