import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

interface CandidateMeta {
  decisionSource: 'rule_engine' | 'ai';
  preFilterScore: number;
  matchedRules: string[];
  groupTier: string;
  speakerType: 'vip' | 'supervisor' | 'member';
  needsAck: boolean;
  isTimeSensitive: boolean;
  isCustomerFacing: boolean;
  isOperationallyRelevant: boolean;
}

interface Candidate {
  id: number;
  groupId: string;
  facilityName: string | null;
  displayName: string | null;
  originalText: string;
  candidateType: string;
  scopeType: string;
  title: string | null;
  summary: string | null;
  confidence: string;
  status: string;
  isFromSupervisor: string;
  detectedAt: string;
  reasoningTags: string[] | null;
  _meta: CandidateMeta;
}

interface CandidatesResponse {
  success: boolean;
  total: number;
  page: number;
  pageSize: number;
  items: Candidate[];
}

const TYPE_LABEL: Record<string, string> = {
  rule: '規則/SOP', notice: '通知公告', campaign: '活動', discount: '優惠折扣',
  script: '標準說詞', ignore: '忽略',
};
const TYPE_COLOR: Record<string, string> = {
  rule: 'bg-blue-100 text-blue-700', notice: 'bg-yellow-100 text-yellow-700',
  campaign: 'bg-green-100 text-green-700', discount: 'bg-pink-100 text-pink-700',
  script: 'bg-purple-100 text-purple-700', ignore: 'bg-gray-100 text-gray-500',
};
const STATUS_COLOR: Record<string, string> = {
  pending_review: 'bg-orange-100 text-orange-700',
  rule_matched_pending_review: 'bg-blue-100 text-blue-700',
  ai_pending_review: 'bg-violet-100 text-violet-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  ignored: 'bg-gray-100 text-gray-400',
  archived_noise: 'bg-gray-100 text-gray-400',
  vip_chat: 'bg-amber-100 text-amber-700',
  vip_raw: 'bg-amber-100 text-amber-700',
};
const STATUS_LABEL: Record<string, string> = {
  pending_review: '待審核',
  rule_matched_pending_review: '規則直判・待審',
  ai_pending_review: 'AI 分析・待審',
  approved: '已核准', rejected: '已退回',
  ignored: '已忽略', archived_noise: '已丟棄',
  vip_chat: '⭐ VIP閒聊', vip_raw: '⭐ VIP原始',
};
const SPEAKER_BADGE: Record<string, string> = {
  vip: '⭐ VIP', supervisor: '主管', member: '一般',
};
const TIER_COLOR: Record<string, string> = {
  A: 'bg-red-50 text-red-600', B: 'bg-orange-50 text-orange-600', C: 'bg-gray-50 text-gray-500',
};

const PENDING_STATUSES = ['pending_review', 'rule_matched_pending_review', 'ai_pending_review'];

export default function AnnouncementsPage() {
  const { toast } = useToast();
  const [status, setStatus] = useState<string>('');
  const [candidateType, setCandidateType] = useState<string>('');
  const [decisionSource, setDecisionSource] = useState<string>('');
  const [needsAck, setNeedsAck] = useState<boolean>(false);
  const [vipOnly, setVipOnly] = useState<boolean>(false);
  const [keyword, setKeyword] = useState<string>('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Candidate | null>(null);

  const params = new URLSearchParams({ page: String(page), pageSize: '20' });
  if (status) params.set('status', status);
  if (candidateType) params.set('candidateType', candidateType);
  if (decisionSource) params.set('decisionSource', decisionSource);
  if (needsAck) params.set('needsAck', 'true');
  if (vipOnly) params.set('vipOnly', 'true');
  if (keyword) params.set('keyword', keyword);

  const { data, isLoading } = useQuery<CandidatesResponse>({
    queryKey: ['/api/announcement-candidates', status, candidateType, decisionSource, needsAck, vipOnly, keyword, page],
    queryFn: () => fetch(`/api/announcement-candidates?${params}`).then(r => r.json()),
  });

  const approve = useMutation({
    mutationFn: (id: number) => apiRequest('POST', `/api/announcement-candidates/${id}/approve`),
    onSuccess: () => {
      toast({ title: '✅ 已核准' });
      queryClient.invalidateQueries({ queryKey: ['/api/announcement-candidates'] });
      setSelected(null);
    },
  });

  const reject = useMutation({
    mutationFn: (id: number) => apiRequest('POST', `/api/announcement-candidates/${id}/reject`),
    onSuccess: () => {
      toast({ title: '🚫 已退回' });
      queryClient.invalidateQueries({ queryKey: ['/api/announcement-candidates'] });
      setSelected(null);
    },
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-[#1a3a5c] text-white px-6 py-4 flex items-center justify-between shadow">
        <div className="flex items-center gap-3">
          <span className="text-2xl">📋</span>
          <div>
            <h1 className="text-lg font-bold">重要事項公告歸納器</h1>
            <p className="text-xs text-blue-200">候選公告審核 · 規則先行 · AI 最後</p>
          </div>
        </div>
        <div className="flex gap-2 text-sm">
          <Link href="/" className="text-blue-200 hover:text-white">首頁</Link>
          <span className="text-blue-300">｜</span>
          <Link href="/announcements/summary" className="text-blue-200 hover:text-white">統計總覽</Link>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 flex gap-5">
        {/* 左：列表 */}
        <div className="flex-1 space-y-4">
          {/* 篩選列 */}
          <div className="flex flex-wrap gap-2">
            <Input
              placeholder="搜尋關鍵字…"
              value={keyword}
              onChange={e => { setKeyword(e.target.value); setPage(1); }}
              className="w-44"
            />
            <Select value={status || 'all'} onValueChange={v => { setStatus(v === 'all' ? '' : v); setPage(1); }}>
              <SelectTrigger className="w-40"><SelectValue placeholder="狀態" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部狀態</SelectItem>
                <SelectItem value="rule_matched_pending_review">規則直判・待審</SelectItem>
                <SelectItem value="ai_pending_review">AI 分析・待審</SelectItem>
                <SelectItem value="pending_review">舊版待審</SelectItem>
                <SelectItem value="approved">已核准</SelectItem>
                <SelectItem value="rejected">已退回</SelectItem>
                <SelectItem value="vip_raw">⭐ VIP原始</SelectItem>
                <SelectItem value="archived_noise">已丟棄</SelectItem>
              </SelectContent>
            </Select>
            <Select value={candidateType || 'all'} onValueChange={v => { setCandidateType(v === 'all' ? '' : v); setPage(1); }}>
              <SelectTrigger className="w-36"><SelectValue placeholder="類型" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部類型</SelectItem>
                <SelectItem value="rule">規則/SOP</SelectItem>
                <SelectItem value="notice">通知公告</SelectItem>
                <SelectItem value="campaign">活動</SelectItem>
                <SelectItem value="discount">優惠折扣</SelectItem>
                <SelectItem value="script">標準說詞</SelectItem>
              </SelectContent>
            </Select>
            <Select value={decisionSource || 'all'} onValueChange={v => { setDecisionSource(v === 'all' ? '' : v); setPage(1); }}>
              <SelectTrigger className="w-32"><SelectValue placeholder="來源" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部來源</SelectItem>
                <SelectItem value="rule_engine">規則引擎</SelectItem>
                <SelectItem value="ai">AI 分析</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant={needsAck ? 'default' : 'outline'}
              size="sm"
              onClick={() => { setNeedsAck(v => !v); setPage(1); }}
              className={needsAck ? 'bg-red-500 hover:bg-red-600 text-white' : 'border-red-300 text-red-600 hover:bg-red-50'}
            >
              🔔 須確認
            </Button>
            <Button
              variant={vipOnly ? 'default' : 'outline'}
              size="sm"
              onClick={() => { setVipOnly(v => !v); setPage(1); }}
              className={vipOnly ? 'bg-amber-500 hover:bg-amber-600 text-white' : 'border-amber-400 text-amber-600 hover:bg-amber-50'}
            >
              ⭐ VIP
            </Button>
            {data && <span className="text-sm text-gray-400 self-center">共 {data.total} 筆</span>}
          </div>

          {isLoading && <p className="text-gray-400 text-sm">載入中…</p>}

          {data?.items.map(c => {
            const meta = c._meta ?? {};
            const isPending = PENDING_STATUSES.includes(c.status);
            return (
              <Card
                key={c.id}
                className={`cursor-pointer transition-shadow hover:shadow-md ${selected?.id === c.id ? 'ring-2 ring-[#1a3a5c]' : ''}`}
                onClick={() => setSelected(selected?.id === c.id ? null : c)}
              >
                <CardContent className="py-3 px-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      {/* 標籤列 */}
                      <div className="flex flex-wrap gap-1 mb-1">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_COLOR[c.candidateType] ?? 'bg-gray-100 text-gray-600'}`}>
                          {TYPE_LABEL[c.candidateType] ?? c.candidateType}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[c.status] ?? 'bg-gray-100'}`}>
                          {STATUS_LABEL[c.status] ?? c.status}
                        </span>
                        {/* 來源標籤 */}
                        {meta.decisionSource && (
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${meta.decisionSource === 'rule_engine' ? 'bg-blue-50 text-blue-600' : 'bg-violet-50 text-violet-600'}`}>
                            {meta.decisionSource === 'rule_engine' ? '⚡ 規則' : '🤖 AI'}
                          </span>
                        )}
                        {/* Tier 標籤 */}
                        {meta.groupTier && (
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TIER_COLOR[meta.groupTier] ?? 'bg-gray-50 text-gray-500'}`}>
                            Tier {meta.groupTier}
                          </span>
                        )}
                        {/* 發話者類型 */}
                        {meta.speakerType && meta.speakerType !== 'member' && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-medium">
                            {SPEAKER_BADGE[meta.speakerType]}
                          </span>
                        )}
                        {/* 須確認 */}
                        {meta.needsAck && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-600 font-bold">🔔 須確認</span>
                        )}
                        {/* 時效 */}
                        {meta.isTimeSensitive && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-50 text-yellow-600">⏰ 時效</span>
                        )}
                        {/* 信心分（AI 才顯示） */}
                        {meta.decisionSource === 'ai' && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                            信心 {Math.round(parseFloat(c.confidence) * 100)}%
                          </span>
                        )}
                        {/* 規則分（規則引擎才顯示） */}
                        {meta.decisionSource === 'rule_engine' && meta.preFilterScore != null && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-500">
                            規則分 {meta.preFilterScore}
                          </span>
                        )}
                      </div>

                      <p className="font-medium text-sm text-gray-800 truncate">{c.title ?? '（規則直判，無 AI 標題）'}</p>
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className="text-xs font-medium text-[#1a3a5c] bg-blue-50 px-1.5 py-0.5 rounded">
                          📍 {c.facilityName ?? c.groupId.substring(0, 12) + '…'}
                        </span>
                        <span className="text-xs text-gray-400">‧ {c.displayName ?? '未知'}</span>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5 truncate">{c.originalText}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <span className="text-xs text-gray-300 block">
                        {new Date(c.detectedAt).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei', month: '2-digit', day: '2-digit' })}
                      </span>
                      {isPending && (
                        <div className="flex gap-1 mt-1">
                          <button
                            onClick={e => { e.stopPropagation(); approve.mutate(c.id); }}
                            disabled={approve.isPending}
                            className="text-xs bg-green-500 hover:bg-green-600 text-white px-2 py-0.5 rounded"
                          >✓</button>
                          <button
                            onClick={e => { e.stopPropagation(); reject.mutate(c.id); }}
                            disabled={reject.isPending}
                            className="text-xs bg-red-400 hover:bg-red-500 text-white px-2 py-0.5 rounded"
                          >✗</button>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {/* 分頁 */}
          {data && data.total > data.pageSize && (
            <div className="flex gap-2 justify-center">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>上一頁</Button>
              <span className="text-sm text-gray-500 self-center">第 {page} 頁</span>
              <Button variant="outline" size="sm" disabled={page * data.pageSize >= data.total} onClick={() => setPage(p => p + 1)}>下一頁</Button>
            </div>
          )}
        </div>

        {/* 右：詳情面板 */}
        {selected && (
          <div className="w-88 shrink-0" style={{ width: '22rem' }}>
            <Card className="sticky top-4">
              <CardContent className="py-4 px-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-sm text-gray-800">詳細資訊</h3>
                  <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 text-xs">✕ 關閉</button>
                </div>

                {/* 來源群組 */}
                <div className="bg-blue-50 rounded-lg p-2.5 space-y-1">
                  <p className="text-xs text-gray-400 font-medium">📍 來源群組</p>
                  <p className="text-sm font-semibold text-[#1a3a5c]">{selected.facilityName ?? '未知場館'}</p>
                  <p className="text-xs text-gray-400 font-mono break-all">{selected.groupId}</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    <Badge variant="outline" className={`text-xs ${TIER_COLOR[selected._meta?.groupTier] ?? ''}`}>
                      Tier {selected._meta?.groupTier ?? '?'}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {SPEAKER_BADGE[selected._meta?.speakerType ?? 'member'] ?? '一般'} 發話
                    </Badge>
                  </div>
                  <p className="text-xs text-gray-500">
                    發話者：{selected.displayName ?? '未知'}
                    {selected.isFromSupervisor === 'true' && <span className="ml-1 text-indigo-600 font-medium">（主管/VIP）</span>}
                  </p>
                </div>

                {/* 為何送進來 */}
                <div className="bg-gray-50 rounded-lg p-2.5">
                  <p className="text-xs font-medium text-gray-500 mb-1">
                    {selected._meta?.decisionSource === 'rule_engine' ? '⚡ 規則引擎直判（未送 AI）' : '🤖 AI 分析判定'}
                  </p>
                  {selected._meta?.matchedRules && selected._meta.matchedRules.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {selected._meta.matchedRules.map((r, i) => (
                        <span key={i} className="text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded">
                          {r}
                        </span>
                      ))}
                    </div>
                  )}
                  {selected._meta?.preFilterScore != null && (
                    <p className="text-xs text-gray-400 mt-1">規則評分：{selected._meta.preFilterScore} 分</p>
                  )}
                  {selected._meta?.decisionSource === 'ai' && (
                    <p className="text-xs text-gray-400 mt-1">AI 信心：{Math.round(parseFloat(selected.confidence) * 100)}%</p>
                  )}
                </div>

                {/* 原始訊息 */}
                <div>
                  <p className="text-xs text-gray-400">原始訊息</p>
                  <p className="text-sm text-gray-700 bg-gray-50 rounded p-2 mt-1 whitespace-pre-wrap">{selected.originalText}</p>
                </div>

                {/* AI 摘要（僅 AI 來源） */}
                {selected.summary && (
                  <div>
                    <p className="text-xs text-gray-400">AI 摘要</p>
                    <p className="text-sm text-gray-700 mt-1">{selected.summary}</p>
                  </div>
                )}

                {/* 標籤 */}
                {selected.reasoningTags && selected.reasoningTags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {selected.reasoningTags.map((t, i) => (
                      <span key={i} className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">#{t}</span>
                    ))}
                  </div>
                )}

                {/* 特性標記 */}
                <div className="flex flex-wrap gap-1">
                  {selected._meta?.needsAck && <Badge className="bg-red-100 text-red-600 text-xs">🔔 須確認</Badge>}
                  {selected._meta?.isTimeSensitive && <Badge className="bg-yellow-100 text-yellow-700 text-xs">⏰ 時效性</Badge>}
                  {selected._meta?.isCustomerFacing && <Badge className="bg-green-100 text-green-700 text-xs">👥 對客相關</Badge>}
                  {selected._meta?.isOperationallyRelevant && <Badge className="bg-blue-100 text-blue-700 text-xs">🏊 營運相關</Badge>}
                </div>

                {/* 審核按鈕 */}
                {PENDING_STATUSES.includes(selected.status) && (
                  <div className="flex gap-2 pt-2">
                    <Button
                      className="flex-1 bg-green-600 hover:bg-green-700 text-white h-8 text-xs"
                      onClick={() => approve.mutate(selected.id)}
                      disabled={approve.isPending}
                    >
                      ✅ 核准
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1 border-red-300 text-red-600 hover:bg-red-50 h-8 text-xs"
                      onClick={() => reject.mutate(selected.id)}
                      disabled={reject.isPending}
                    >
                      🚫 退回
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}
