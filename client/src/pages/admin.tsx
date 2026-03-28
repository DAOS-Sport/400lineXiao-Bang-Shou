import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

interface Overview {
  success: boolean;
  timestamp: string;
  tasks: { total: number; pending: number; completed: number };
  groups: { total: number; list: Array<{ id: string; name: string; features: string[] }> };
  recentLogs: Array<{ id: string; level: string; category: string; message: string; timestamp: string }>;
  apis: Array<{ method: string; path: string; desc: string }>;
}

interface InterviewUser {
  id: number;
  userId: string;
  userName: string;
  isActive: boolean;
  canInterviewCheck: boolean;
  canInternalQuery: boolean;
  createdAt: string;
}

const featureLabel: Record<string, string> = {
  task: '任務', weather: '天氣', gps: 'GPS',
};
const featureColor: Record<string, string> = {
  task: 'bg-blue-100 text-blue-700', weather: 'bg-sky-100 text-sky-700', gps: 'bg-green-100 text-green-700',
};
const levelColor: Record<string, string> = {
  info: 'text-blue-600', warn: 'text-yellow-600', error: 'text-red-600', debug: 'text-gray-500',
};
const methodColor: Record<string, string> = {
  GET: 'bg-green-100 text-green-700', POST: 'bg-orange-100 text-orange-700',
  PUT: 'bg-blue-100 text-blue-700', DELETE: 'bg-red-100 text-red-700',
};

export default function AdminPage() {
  const { toast } = useToast();

  const { data: overview, isLoading } = useQuery<Overview>({
    queryKey: ['/api/admin/overview'],
    refetchInterval: 30000,
  });

  const { data: interviewUsersData, isLoading: isLoadingUsers } = useQuery<{ success: boolean; users: InterviewUser[] }>({
    queryKey: ['/api/admin/interview-users'],
  });

  const triggerTasks = useMutation({
    mutationFn: () => apiRequest('POST', '/api/admin/trigger-tasks'),
    onSuccess: () => {
      toast({ title: '✅ 任務提醒已觸發', description: '訊息正在發送中' });
    },
    onError: () => toast({ title: '❌ 觸發失敗', variant: 'destructive' }),
  });

  const triggerForecast = useMutation({
    mutationFn: () => apiRequest('POST', '/api/admin/trigger-combined-forecast'),
    onSuccess: () => {
      toast({ title: '✅ 天氣預報已觸發', description: '訊息正在發送中' });
    },
    onError: () => toast({ title: '❌ 觸發失敗', variant: 'destructive' }),
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">載入中…</p>
      </div>
    );
  }

  const ov = overview;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-[#1a3a5c] text-white px-6 py-4 flex items-center gap-3 shadow">
        <span className="text-2xl">🏃</span>
        <div>
          <h1 className="text-lg font-bold">駿斯運動 — 小幫手管理後台</h1>
          <p className="text-xs text-blue-200">
            {ov?.timestamp ? new Date(ov.timestamp).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }) : ''}
          </p>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">

        {/* 任務統計 */}
        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">任務概覽</h2>
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: '全部任務', value: ov?.tasks.total ?? '-', color: 'text-gray-800' },
              { label: '待處理', value: ov?.tasks.pending ?? '-', color: 'text-orange-600' },
              { label: '已完成', value: ov?.tasks.completed ?? '-', color: 'text-green-600' },
            ].map(s => (
              <Card key={s.label}>
                <CardContent className="pt-5 text-center">
                  <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
                  <p className="text-sm text-gray-500 mt-1">{s.label}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* 快速操作 */}
        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">快速操作</h2>
          <div className="flex flex-wrap gap-3">
            <Button
              onClick={() => triggerTasks.mutate()}
              disabled={triggerTasks.isPending}
              className="bg-[#1a3a5c] hover:bg-[#2a5a8c]"
            >
              {triggerTasks.isPending ? '發送中…' : '📢 觸發任務提醒'}
            </Button>
            <Button
              onClick={() => triggerForecast.mutate()}
              disabled={triggerForecast.isPending}
              variant="outline"
            >
              {triggerForecast.isPending ? '發送中…' : '🌤 觸發天氣預報'}
            </Button>
          </div>
        </section>

        {/* 群組列表 */}
        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            監控群組 ({ov?.groups.total ?? 0})
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {ov?.groups.list.map(g => (
              <Card key={g.id}>
                <CardContent className="py-3 px-4">
                  <p className="font-medium text-sm text-gray-800">{g.name}</p>
                  <p className="text-xs text-gray-400 font-mono mt-0.5 truncate">{g.id}</p>
                  <div className="flex gap-1 mt-2 flex-wrap">
                    {g.features.map(f => (
                      <span key={f} className={`text-xs px-2 py-0.5 rounded-full font-medium ${featureColor[f] ?? 'bg-gray-100 text-gray-600'}`}>
                        {featureLabel[f] ?? f}
                      </span>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* 面試授權用戶 */}
        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            面試檢核授權用戶 ({interviewUsersData?.users.length ?? 0})
          </h2>
          {isLoadingUsers ? (
            <p className="text-gray-400 text-sm">載入中…</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {interviewUsersData?.users.map(u => (
                <Card key={u.id}>
                  <CardContent className="py-3 px-4 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm text-gray-800">{u.userName}</p>
                      <p className="text-xs text-gray-400 font-mono truncate max-w-[180px]">{u.userId}</p>
                    </div>
                    <div className="flex flex-col gap-1 items-end">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${u.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {u.isActive ? '啟用' : '停用'}
                      </span>
                      {u.canInterviewCheck && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-blue-100 text-blue-700">面試檢核</span>
                      )}
                      {u.canInternalQuery && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-purple-100 text-purple-700">內部查詢</span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>

        {/* 最近日誌 */}
        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">最近系統日誌</h2>
          <Card>
            <CardContent className="p-0">
              <div className="divide-y">
                {ov?.recentLogs.length === 0 && (
                  <p className="text-gray-400 text-sm p-4">無日誌記錄</p>
                )}
                {ov?.recentLogs.map(log => (
                  <div key={log.id} className="px-4 py-3 flex items-start gap-3">
                    <span className={`text-xs font-bold uppercase mt-0.5 w-12 shrink-0 ${levelColor[log.level] ?? 'text-gray-500'}`}>
                      {log.level}
                    </span>
                    <div className="min-w-0">
                      <span className="text-xs text-gray-400 mr-2 bg-gray-100 px-1.5 py-0.5 rounded">{log.category}</span>
                      <span className="text-sm text-gray-700">{log.message}</span>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {new Date(log.timestamp).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>

        {/* API 端點列表 */}
        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            可用 API 端點 ({ov?.apis.length ?? 0})
          </h2>
          <Card>
            <CardContent className="p-0">
              <div className="divide-y">
                {ov?.apis.map((api, i) => (
                  <div key={i} className="px-4 py-2.5 flex items-center gap-3">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded font-mono shrink-0 ${methodColor[api.method] ?? 'bg-gray-100 text-gray-600'}`}>
                      {api.method}
                    </span>
                    <code className="text-xs text-gray-600 font-mono flex-1 truncate">{api.path}</code>
                    <span className="text-xs text-gray-400 shrink-0">{api.desc}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>

      </main>
    </div>
  );
}
