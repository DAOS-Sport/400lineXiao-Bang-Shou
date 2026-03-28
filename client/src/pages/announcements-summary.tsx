import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";

interface PipelineStats {
  date: string;
  totalChecked: number;
  preFilterPass: number;
  gptClassified: number;
  stored: number;
  supervisorChecked: number;
  focusGroupChecked: number;
  skippedLowConf: number;
  preFilterRate: string;
  storageRate: string;
}

interface Summary {
  success: boolean;
  totalMessagesToday: number;
  analyzedMessagesToday: number;
  todaySupervisorCount: number;
  pendingReviewCount: number;
  approvedCount: number;
  rejectedCount: number;
  totalCandidates: number;
  supervisorCount: number;
  nonSupervisorCount: number;
  confidenceDist: { high: number; mid: number; low: number };
  byType: Record<string, number>;
  byFacility: Record<string, number>;
  byGroup: Record<string, number>;
  focusGroups: string[];
  pipeline: PipelineStats;
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
const TYPE_DOT: Record<string, string> = {
  rule: 'bg-blue-500', notice: 'bg-yellow-500', campaign: 'bg-green-500',
  discount: 'bg-pink-500', script: 'bg-purple-500',
};

function PipelineBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-gray-500 w-28 shrink-0">{label}</span>
      <div className="flex-1 bg-gray-100 rounded-full h-3">
        <div className={`${color} h-3 rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-semibold text-gray-700 w-8 text-right shrink-0">{value}</span>
    </div>
  );
}

export default function AnnouncementsSummaryPage() {
  const { data: summary, isLoading: loadSummary } = useQuery<Summary>({
    queryKey: ['/api/announcement-dashboard/summary'],
    refetchInterval: 15000,
  });

  const { data: weekly, isLoading: loadWeekly } = useQuery<Weekly>({
    queryKey: ['/api/announcement-reports/weekly'],
    refetchInterval: 60000,
  });

  const pipeline = summary?.pipeline;

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

        {/* 今日快速數字 */}
        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">今日</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: '今日候選公告', value: summary?.analyzedMessagesToday ?? '-', color: 'text-gray-700' },
              { label: '今日主管訊息', value: summary?.todaySupervisorCount ?? '-', color: 'text-indigo-600' },
              { label: '待審核', value: summary?.pendingReviewCount ?? '-', color: 'text-orange-600' },
              { label: '已核准', value: summary?.approvedCount ?? '-', color: 'text-green-600' },
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

        {/* 進程漏斗 */}
        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            今日進程漏斗
            {pipeline?.date && <span className="font-normal text-gray-400 ml-2">({pipeline.date})</span>}
          </h2>
          <Card>
            <CardContent className="py-4 px-5 space-y-3">
              {loadSummary ? <p className="text-gray-400 text-sm">載入中…</p> : pipeline && (
                <>
                  <PipelineBar label="進入分析" value={pipeline.totalChecked} max={pipeline.totalChecked} color="bg-gray-400" />
                  <PipelineBar label="└ 主管訊息" value={pipeline.supervisorChecked} max={pipeline.totalChecked} color="bg-indigo-400" />
                  <PipelineBar label="└ 重點群組" value={pipeline.focusGroupChecked} max={pipeline.totalChecked} color="bg-blue-400" />
                  <PipelineBar label="預篩通過" value={pipeline.preFilterPass} max={pipeline.totalChecked} color="bg-yellow-400" />
                  <PipelineBar label="GPT 分類完成" value={pipeline.gptClassified} max={pipeline.totalChecked} color="bg-orange-400" />
                  <PipelineBar label="成功儲存" value={pipeline.stored} max={pipeline.totalChecked} color="bg-green-500" />
                  <div className="flex gap-4 pt-1 text-xs text-gray-500 border-t border-gray-100 mt-1">
                    <span>預篩通過率：<span className="font-semibold text-gray-700">{pipeline.preFilterRate}</span></span>
                    <span>GPT→儲存率：<span className="font-semibold text-gray-700">{pipeline.storageRate}</span></span>
                    <span>跳過（低信心）：<span className="font-semibold text-gray-700">{pipeline.skippedLowConf}</span></span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </section>

        {/* 來源分布（主管 vs 一般） + 信心分布 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <section>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">來源分布（累計）</h2>
            <Card>
              <CardContent className="py-4 px-4 space-y-3">
                {loadSummary ? <p className="text-gray-400 text-sm">載入中…</p> : summary && (() => {
                  const total = (summary.supervisorCount ?? 0) + (summary.nonSupervisorCount ?? 0);
                  return total === 0 ? <p className="text-gray-400 text-sm">尚無資料</p> : (
                    <>
                      {[
                        { label: '管理員/主管', value: summary.supervisorCount, color: 'bg-indigo-500' },
                        { label: '一般群組成員', value: summary.nonSupervisorCount, color: 'bg-gray-300' },
                      ].map(s => (
                        <div key={s.label}>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-gray-600">{s.label}</span>
                            <span className="font-semibold text-gray-700">{s.value} ({total > 0 ? Math.round(s.value / total * 100) : 0}%)</span>
                          </div>
                          <div className="w-full bg-gray-100 rounded-full h-2">
                            <div className={`${s.color} h-2 rounded-full`} style={{ width: `${total > 0 ? Math.round(s.value / total * 100) : 0}%` }} />
                          </div>
                        </div>
                      ))}
                    </>
                  );
                })()}
              </CardContent>
            </Card>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">信心分布（累計）</h2>
            <Card>
              <CardContent className="py-4 px-4 space-y-3">
                {loadSummary ? <p className="text-gray-400 text-sm">載入中…</p> : summary && (() => {
                  const cd = summary.confidenceDist;
                  const total = cd.high + cd.mid + cd.low;
                  return total === 0 ? <p className="text-gray-400 text-sm">尚無資料</p> : (
                    <>
                      {[
                        { label: '高（≥70%）', value: cd.high, color: 'bg-green-500' },
                        { label: '中（40–70%）', value: cd.mid, color: 'bg-yellow-400' },
                        { label: '低（<40%）', value: cd.low, color: 'bg-red-300' },
                      ].map(s => (
                        <div key={s.label}>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-gray-600">{s.label}</span>
                            <span className="font-semibold text-gray-700">{s.value}</span>
                          </div>
                          <div className="w-full bg-gray-100 rounded-full h-2">
                            <div className={`${s.color} h-2 rounded-full`} style={{ width: `${total > 0 ? Math.round(s.value / total * 100) : 0}%` }} />
                          </div>
                        </div>
                      ))}
                    </>
                  );
                })()}
              </CardContent>
            </Card>
          </section>
        </div>

        {/* 7 天每日趨勢 */}
        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">過去 7 天每日偵測</h2>
          <Card>
            <CardContent className="p-0">
              {loadWeekly ? <p className="text-gray-400 text-sm p-4">載入中…</p> : (
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
                        <span className="text-xs text-gray-500 w-24 text-right shrink-0">
                          {vals.detected} 偵 / {vals.classified} 分類
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        {/* 類型分布 + 場館分布 */}
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
                      return (
                        <div key={type} className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${TYPE_DOT[type] ?? 'bg-gray-400'}`} />
                          <span className="text-sm text-gray-700 flex-1">{TYPE_LABEL[type] ?? type}</span>
                          <span className="text-sm font-semibold text-gray-800">{count}</span>
                          <span className="text-xs text-gray-400 w-10 text-right">{total > 0 ? Math.round(count / total * 100) : 0}%</span>
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

        {/* 重點群組列表 */}
        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            重點群組（前台/服務台，門檻 ≥15 字）
          </h2>
          <Card>
            <CardContent className="py-3 px-4">
              {(summary?.focusGroups ?? []).length === 0
                ? <p className="text-gray-400 text-sm">無設定</p>
                : (
                  <div className="flex flex-wrap gap-2">
                    {(summary?.focusGroups ?? []).map(gid => (
                      <span key={gid} className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded font-mono border border-blue-100">
                        {gid.substring(0, 12)}…
                      </span>
                    ))}
                  </div>
                )
              }
            </CardContent>
          </Card>
        </section>

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
