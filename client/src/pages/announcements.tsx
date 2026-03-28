import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

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
  recommendedAction: string | null;
  badExample: string | null;
  recommendedReply: string | null;
  confidence: string;
  status: string;
  isFromSupervisor: string;
  detectedAt: string;
  appliesToRoles: string[] | null;
  reasoningTags: string[] | null;
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
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  ignored: 'bg-gray-100 text-gray-400',
  vip_chat: 'bg-amber-100 text-amber-700',
};
const STATUS_LABEL: Record<string, string> = {
  pending_review: '待審核', approved: '已核准', rejected: '已退回', ignored: '已忽略',
  vip_chat: '⭐ VIP閒聊',
};

export default function AnnouncementsPage() {
  const { toast } = useToast();
  const [status, setStatus] = useState<string>('');
  const [candidateType, setCandidateType] = useState<string>('');
  const [keyword, setKeyword] = useState<string>('');
  const [vipOnly, setVipOnly] = useState<boolean>(false);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Candidate | null>(null);

  const params = new URLSearchParams({ page: String(page), pageSize: '20' });
  if (status) params.set('status', status);
  if (candidateType) params.set('candidateType', candidateType);
  if (keyword) params.set('keyword', keyword);
  if (vipOnly) params.set('vipOnly', 'true');

  const { data, isLoading } = useQuery<CandidatesResponse>({
    queryKey: ['/api/announcement-candidates', status, candidateType, keyword, vipOnly, page],
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
            <p className="text-xs text-blue-200">候選公告列表</p>
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
              <SelectTrigger className="w-32"><SelectValue placeholder="狀態" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部狀態</SelectItem>
                <SelectItem value="pending_review">待審核</SelectItem>
                <SelectItem value="approved">已核准</SelectItem>
                <SelectItem value="rejected">已退回</SelectItem>
                <SelectItem value="ignored">已忽略</SelectItem>
                <SelectItem value="vip_chat">⭐ VIP閒聊</SelectItem>
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
            <Button
              variant={vipOnly ? 'default' : 'outline'}
              size="sm"
              onClick={() => { setVipOnly(v => !v); setPage(1); }}
              className={vipOnly ? 'bg-amber-500 hover:bg-amber-600 text-white' : 'border-amber-400 text-amber-600 hover:bg-amber-50'}
            >
              ⭐ 特別關注
            </Button>
            {data && <span className="text-sm text-gray-400 self-center">共 {data.total} 筆</span>}
          </div>

          {isLoading && <p className="text-gray-400 text-sm">載入中…</p>}

          {data?.items.map(c => (
            <Card
              key={c.id}
              className={`cursor-pointer transition-shadow hover:shadow-md ${selected?.id === c.id ? 'ring-2 ring-[#1a3a5c]' : ''}`}
              onClick={() => setSelected(selected?.id === c.id ? null : c)}
            >
              <CardContent className="py-3 px-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap gap-1 mb-1">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_COLOR[c.candidateType] ?? 'bg-gray-100 text-gray-600'}`}>
                        {TYPE_LABEL[c.candidateType] ?? c.candidateType}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[c.status] ?? 'bg-gray-100'}`}>
                        {STATUS_LABEL[c.status] ?? c.status}
                      </span>
                      {c.isFromSupervisor === 'true' && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-medium">主管</span>
                      )}
                      {Array.isArray(c.reasoningTags) && (c.reasoningTags as string[]).some(t => t.startsWith('⭐特別關注:')) && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-bold">⭐ 特別關注</span>
                      )}
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                        信心 {Math.round(parseFloat(c.confidence) * 100)}%
                      </span>
                    </div>
                    <p className="font-medium text-sm text-gray-800 truncate">{c.title ?? '（無標題）'}</p>
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className="text-xs font-medium text-[#1a3a5c] bg-blue-50 px-1.5 py-0.5 rounded">
                        📍 {c.facilityName ?? c.groupId}
                      </span>
                      <span className="text-xs text-gray-400">‧ {c.displayName ?? '未知'}</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5 truncate">{c.originalText}</p>
                  </div>
                  <span className="text-xs text-gray-300 shrink-0">
                    {new Date(c.detectedAt).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei', month: '2-digit', day: '2-digit' })}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}

          {/* 分頁 */}
          {data && data.total > data.pageSize && (
            <div className="flex gap-2 justify-center">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>上一頁</Button>
              <span className="text-sm text-gray-500 self-center">第 {page} 頁</span>
              <Button variant="outline" size="sm" disabled={page * data.pageSize >= data.total} onClick={() => setPage(p => p + 1)}>下一頁</Button>
            </div>
          )}
        </div>

        {/* 右：詳情 */}
        {selected && (
          <div className="w-80 shrink-0">
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
                  <p className="text-xs text-gray-500">
                    發話者：{selected.displayName ?? '未知'}
                    {selected.isFromSupervisor === 'true' && <span className="ml-1 text-indigo-600 font-medium">（主管）</span>}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-gray-400">原始訊息</p>
                  <p className="text-sm text-gray-700 bg-gray-50 rounded p-2 mt-1 whitespace-pre-wrap">{selected.originalText}</p>
                </div>

                {selected.summary && (
                  <div>
                    <p className="text-xs text-gray-400">摘要</p>
                    <p className="text-sm text-gray-700 mt-1">{selected.summary}</p>
                  </div>
                )}

                {selected.recommendedAction && (
                  <div>
                    <p className="text-xs text-gray-400">建議動作</p>
                    <p className="text-sm text-gray-700 mt-1">{selected.recommendedAction}</p>
                  </div>
                )}

                {selected.badExample && (
                  <div>
                    <p className="text-xs text-gray-400">禁止說法</p>
                    <p className="text-sm text-red-600 mt-1">{selected.badExample}</p>
                  </div>
                )}

                {selected.recommendedReply && (
                  <div>
                    <p className="text-xs text-gray-400">標準回覆</p>
                    <p className="text-sm text-green-700 mt-1">{selected.recommendedReply}</p>
                  </div>
                )}

                {selected.reasoningTags && selected.reasoningTags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {selected.reasoningTags.map((t, i) => (
                      <span key={i} className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">#{t}</span>
                    ))}
                  </div>
                )}

                {selected.status === 'pending_review' && (
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
