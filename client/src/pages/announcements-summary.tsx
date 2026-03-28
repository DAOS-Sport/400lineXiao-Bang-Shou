import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Summary {
  success: boolean;
  totalMessagesToday: number;
  analyzedMessagesToday: number;
  pendingReviewCount: number;
  approvedCount: number;
  rejectedCount: number;
  totalCandidates: number;
  byType: Record<string, number>;
  byFacility: Record<string, number>;
  byGroup: Record<string, number>;
}

interface Weekly {
  success: boolean;
  period: { from: string; to: string };
  daily: Record<string, { detected: number; classified: number }>;
  byType: Record<string, number>;
  byFacility: Record<string, number>;
  highConfidenceCount: number;
  errorRate: string;
  totalInPeriod: number;
}

const TYPE_LABEL: Record<string, string> = {
  rule: '規則/SOP', notice: '通知公告', campaign: '活動',
  discount: '優惠折扣', script: '標準說詞',
};
const TYPE_COLOR: Record<string, string> = {
  rule: 'bg-blue-500', notice: 'bg-yellow-500', campaign: 'bg-green-500',
  discount: 'bg-pink-500', script: 'bg-purple-500',
};

export default function AnnouncementsSummaryPage() {
  const { data: summary, isLoading: loadSummary } = useQuery<Summary>({
    queryKey: ['/api/announcement-dashboard/summary'],
    refetchInterval: 30000,
  });

  const { data: weekly, isLoading: loadWeekly } = useQuery<Weekly>({
    queryKey: ['/api/announcement-reports/weekly'],
    refetchInterval: 60000,
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-[#1a3a5c] text-white px-6 py-4 flex items-center justify-between shadow">
        <div className="flex items-center gap-3">
          <span className="text-2xl">📊</span>
          <div>
            <h1 className="text-lg font-bold">公告歸納器 — 統計總覽</h1>
            <p className="text-xs text-blue-200">
              {weekly?.period && `${weekly.period.from} ~ ${weekly.period.to}`}
            </p>
          </div>
        </div>
        <div className="flex gap-2 text-sm">
          <Link href="/" className="text-blue-200 hover:text-white">首頁</Link>
          <span className="text-blue-300">｜</span>
          <Link href="/announcements" className="text-blue-200 hover:text-white">候選列表</Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">

        {/* 今日統計 */}
        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">今日</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: '今日分析', value: summary?.analyzedMessagesToday ?? '-', color: 'text-gray-700' },
              { label: '待審核', value: summary?.pendingReviewCount ?? '-', color: 'text-orange-600' },
              { label: '已核准', value: summary?.approvedCount ?? '-', color: 'text-green-600' },
              { label: '已退回', value: summary?.rejectedCount ?? '-', color: 'text-red-600' },
            ].map(s => (
              <Card key={s.label}>
                <CardContent className="pt-4 text-center">
                  <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
                  <p className="text-xs text-gray-400 mt-1">{s.label}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* 7 天每日趨勢 */}
        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">過去 7 天每日偵測</h2>
          <Card>
            <CardContent className="p-0">
              {loadWeekly ? (
                <p className="text-gray-400 text-sm p-4">載入中…</p>
              ) : (
                <div className="divide-y">
                  {weekly && Object.entries(weekly.daily).map(([date, vals]) => {
                    const maxVal = Math.max(...Object.values(weekly.daily).map(v => v.detected), 1);
                    const pct = Math.round((vals.detected / maxVal) * 100);
                    return (
                      <div key={date} className="px-4 py-2.5 flex items-center gap-4">
                        <span className="text-xs text-gray-500 font-mono w-20 shrink-0">{date.slice(5)}</span>
                        <div className="flex-1 bg-gray-100 rounded-full h-2">
                          <div className="bg-[#1a3a5c] h-2 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs text-gray-500 w-16 text-right shrink-0">
                          {vals.detected} 偵測 / {vals.classified} 分類
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        {/* 類型分布 + 場館分布（並排）*/}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <section>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">類型分布</h2>
            <Card>
              <CardContent className="py-3 px-4 space-y-2">
                {loadSummary ? <p className="text-gray-400 text-sm">載入中…</p> : (
                  Object.keys(summary?.byType ?? {}).length === 0
                    ? <p className="text-gray-400 text-sm">尚無資料</p>
                    : Object.entries(summary?.byType ?? {}).sort((a, b) => b[1] - a[1]).map(([type, count]) => {
                      const total = Object.values(summary!.byType).reduce((a, b) => a + b, 0);
                      const pct = Math.round((count / total) * 100);
                      return (
                        <div key={type} className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${TYPE_COLOR[type] ?? 'bg-gray-400'}`} />
                          <span className="text-sm text-gray-700 flex-1">{TYPE_LABEL[type] ?? type}</span>
                          <span className="text-sm font-semibold text-gray-800">{count}</span>
                          <span className="text-xs text-gray-400 w-10 text-right">{pct}%</span>
                        </div>
                      );
                    })
                )}
              </CardContent>
            </Card>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">場館分布</h2>
            <Card>
              <CardContent className="py-3 px-4 space-y-2">
                {loadSummary ? <p className="text-gray-400 text-sm">載入中…</p> : (
                  Object.keys(summary?.byFacility ?? {}).length === 0
                    ? <p className="text-gray-400 text-sm">尚無資料</p>
                    : Object.entries(summary?.byFacility ?? {}).sort((a, b) => b[1] - a[1]).map(([name, count]) => (
                      <div key={name} className="flex items-center gap-2">
                        <span className="text-sm text-gray-700 flex-1 truncate">{name}</span>
                        <span className="text-sm font-semibold text-gray-800 shrink-0">{count}</span>
                      </div>
                    ))
                )}
              </CardContent>
            </Card>
          </section>
        </div>

        {/* 7 天報表摘要 */}
        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">7 天報表摘要</h2>
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: '期間總偵測', value: weekly?.totalInPeriod ?? '-' },
              { label: '高信心公告', value: weekly?.highConfidenceCount ?? '-' },
              { label: '誤判率（審核估算）', value: weekly?.errorRate ?? 'N/A' },
            ].map(s => (
              <Card key={s.label}>
                <CardContent className="pt-4 text-center">
                  <p className="text-2xl font-bold text-gray-800">{s.value}</p>
                  <p className="text-xs text-gray-400 mt-1">{s.label}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

      </main>
    </div>
  );
}
