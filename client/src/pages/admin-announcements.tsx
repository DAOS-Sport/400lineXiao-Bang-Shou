import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, CheckCircle2, XCircle, ChevronDown, ChevronUp,
  Megaphone, MessageSquare, AlertTriangle, Users, RefreshCw,
  Shield, Clock, Star,
} from "lucide-react";

interface CandidateMeta {
  decisionSource: string;
  preFilterScore: number;
  speakerType: string;
  needsAck: boolean;
  isTimeSensitive: boolean;
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
  recommendedReply: string | null;
  badExample: string | null;
  appliesToRoles: string[] | null;
  priority: string | null;
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

const PRIORITY_COLORS: Record<string, string> = {
  must_read: 'bg-red-100 text-red-700 border-red-200',
  high: 'bg-amber-100 text-amber-700 border-amber-200',
  normal: 'bg-gray-100 text-gray-600 border-gray-200',
};
const PRIORITY_HINT: Record<string, string> = {
  must_read: '→ 置頂 + 需簽收',
  high: '→ 置頂顯示',
  normal: '→ 一般列表',
};
const SCOPE_LABELS: Record<string, string> = {
  single: '單館',
  multi_facility: '多館',
  global: '全館',
};
const SCOPE_COLORS: Record<string, string> = {
  single: 'bg-sky-100 text-sky-700',
  multi_facility: 'bg-violet-100 text-violet-700',
  global: 'bg-rose-100 text-rose-700',
};
const TYPE_LABEL: Record<string, string> = {
  rule: '規則/SOP', notice: '通知公告', campaign: '活動',
  discount: '優惠', script: '標準說詞',
};
const TYPE_COLOR: Record<string, string> = {
  rule: 'bg-blue-100 text-blue-700',
  notice: 'bg-yellow-100 text-yellow-700',
  campaign: 'bg-green-100 text-green-700',
  discount: 'bg-pink-100 text-pink-700',
  script: 'bg-purple-100 text-purple-700',
};

function ConfidenceBadge({ value }: { value: string }) {
  const pct = Math.round(parseFloat(value) * 100);
  const color = pct >= 70 ? 'text-emerald-600' : pct >= 40 ? 'text-amber-600' : 'text-gray-400';
  return <span className={`font-mono text-xs font-bold ${color}`}>{pct}%</span>;
}

function CandidateCard({ candidate, onAction }: {
  candidate: Candidate;
  onAction: () => void;
}) {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [comment, setComment] = useState('');
  const [priority, setPriority] = useState(candidate.priority ?? 'normal');
  const [scopeType, setScopeType] = useState(candidate.scopeType ?? 'single');
  const [showReject, setShowReject] = useState(false);

  const approveMutation = useMutation({
    mutationFn: () =>
      apiRequest('POST', `/api/announcement-candidates/${candidate.id}/approve`, {
        comment: comment || null,
        overrides: { priority, scopeType },
      }),
    onSuccess: () => {
      toast({ title: '✅ 已核准，公告已發布到值班首頁' });
      queryClient.invalidateQueries({ queryKey: ['/api/announcement-candidates'] });
      onAction();
    },
    onError: () => toast({ title: '❌ 核准失敗', variant: 'destructive' }),
  });

  const rejectMutation = useMutation({
    mutationFn: () =>
      apiRequest('POST', `/api/announcement-candidates/${candidate.id}/reject`, {
        comment: comment || null,
      }),
    onSuccess: () => {
      toast({ title: '🚫 已退回候選公告' });
      queryClient.invalidateQueries({ queryKey: ['/api/announcement-candidates'] });
      onAction();
    },
    onError: () => toast({ title: '❌ 退回失敗', variant: 'destructive' }),
  });

  const roles = Array.isArray(candidate.appliesToRoles) ? candidate.appliesToRoles : [];
  const isSup = candidate.isFromSupervisor === 'true';

  return (
    <Card className="border border-gray-100 shadow-sm hover:shadow-md transition-shadow bg-white">
      <CardHeader className="pb-3 pt-4 px-5">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              {isSup && (
                <Badge className="text-xs bg-blue-600 text-white border-0 flex items-center gap-1">
                  <Shield className="w-3 h-3" />主管
                </Badge>
              )}
              <Badge className={`text-xs border ${TYPE_COLOR[candidate.candidateType] ?? 'bg-gray-100 text-gray-500'}`}>
                {TYPE_LABEL[candidate.candidateType] ?? candidate.candidateType}
              </Badge>
              <Badge className={`text-xs ${SCOPE_COLORS[candidate.scopeType] ?? 'bg-gray-100 text-gray-500'}`}>
                {SCOPE_LABELS[candidate.scopeType] ?? candidate.scopeType}
              </Badge>
              {candidate._meta.needsAck && (
                <Badge className="text-xs bg-red-100 text-red-700 border-red-200 border">需簽收</Badge>
              )}
              {candidate._meta.isTimeSensitive && (
                <Badge className="text-xs bg-orange-100 text-orange-700 border-orange-200 border flex items-center gap-1">
                  <Clock className="w-3 h-3" />時效性
                </Badge>
              )}
              <span className="text-xs text-gray-400 ml-auto">
                {candidate.facilityName ?? candidate.groupId.substring(0, 12)}
              </span>
            </div>
            <CardTitle className="text-sm font-semibold text-gray-800 leading-snug">
              {candidate.title ?? '（未命名）'}
            </CardTitle>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-xs text-gray-400 mb-1">信心分</div>
            <ConfidenceBadge value={candidate.confidence} />
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-5 pb-5 space-y-4">
        {/* AI 摘要 */}
        {candidate.summary && (
          <div className="bg-blue-50 rounded-lg p-3">
            <p className="text-xs font-semibold text-blue-600 mb-1 flex items-center gap-1">
              <Megaphone className="w-3.5 h-3.5" />AI 摘要
            </p>
            <p className="text-xs text-blue-800 leading-relaxed">{candidate.summary}</p>
          </div>
        )}

        {/* 話術建議 */}
        {candidate.recommendedReply && (
          <div className="bg-emerald-50 rounded-lg p-3">
            <p className="text-xs font-semibold text-emerald-700 mb-1 flex items-center gap-1">
              <MessageSquare className="w-3.5 h-3.5" />話術建議（推薦回覆）
            </p>
            <p className="text-xs text-emerald-800 leading-relaxed whitespace-pre-wrap">{candidate.recommendedReply}</p>
          </div>
        )}

        {/* 壞範例 */}
        {candidate.badExample && (
          <div className="bg-red-50 rounded-lg p-3">
            <p className="text-xs font-semibold text-red-600 mb-1 flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" />壞範例（請勿如此回覆）
            </p>
            <p className="text-xs text-red-700 leading-relaxed whitespace-pre-wrap">{candidate.badExample}</p>
          </div>
        )}

        {/* 適用角色 */}
        {roles.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-400 flex items-center gap-1">
              <Users className="w-3.5 h-3.5" />適用角色：
            </span>
            {roles.map(r => (
              <Badge key={r} variant="outline" className="text-xs">{r}</Badge>
            ))}
          </div>
        )}

        {/* 原文（可展開） */}
        <div>
          <button
            onClick={() => setExpanded(v => !v)}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            {expanded ? '收起原文' : '展開原文'}
          </button>
          {expanded && (
            <div className="mt-2 bg-gray-50 rounded-lg p-3 border border-gray-100">
              <p className="text-xs text-gray-600 leading-relaxed whitespace-pre-wrap">{candidate.originalText}</p>
            </div>
          )}
        </div>

        {/* Priority + ScopeType 修改 + 操作 */}
        <div className="border-t border-gray-100 pt-4 space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs text-gray-500 font-medium shrink-0">發布優先級：</span>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger className="h-8 w-32 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="must_read">必讀</SelectItem>
                <SelectItem value="high">高</SelectItem>
                <SelectItem value="normal">一般</SelectItem>
              </SelectContent>
            </Select>
            <Badge className={`text-xs border ${PRIORITY_COLORS[priority]}`}>
              {PRIORITY_HINT[priority]}
            </Badge>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs text-gray-500 font-medium shrink-0">適用範圍：</span>
            <Select value={scopeType} onValueChange={setScopeType}>
              <SelectTrigger className="h-8 w-36 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="single">單館（僅本館）</SelectItem>
                <SelectItem value="multi_facility">多館（跨館共用）</SelectItem>
                <SelectItem value="global">全館（所有館別）</SelectItem>
              </SelectContent>
            </Select>
            <Badge className={`text-xs ${SCOPE_COLORS[scopeType] ?? 'bg-gray-100 text-gray-500'}`}>
              {SCOPE_LABELS[scopeType]}
            </Badge>
          </div>

          {/* comment + action buttons */}
          {showReject ? (
            <div className="space-y-2">
              <Textarea
                value={comment}
                onChange={e => setComment(e.target.value)}
                placeholder="退回原因（選填）…"
                className="text-xs h-16 resize-none"
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs border-red-300 text-red-600 hover:bg-red-50 h-8"
                  onClick={() => rejectMutation.mutate()}
                  disabled={rejectMutation.isPending}
                >
                  <XCircle className="w-3.5 h-3.5 mr-1" />
                  {rejectMutation.isPending ? '退回中…' : '確認退回'}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-xs h-8 text-gray-400"
                  onClick={() => setShowReject(false)}
                >
                  取消
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Textarea
                value={comment}
                onChange={e => setComment(e.target.value)}
                placeholder="核准備註（選填）…"
                className="text-xs h-14 resize-none"
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-8 px-4"
                  onClick={() => approveMutation.mutate()}
                  disabled={approveMutation.isPending}
                >
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                  {approveMutation.isPending ? '核准中…' : '核准並發布'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs border-red-200 text-red-500 hover:bg-red-50 h-8 px-4"
                  onClick={() => setShowReject(true)}
                >
                  <XCircle className="w-3.5 h-3.5 mr-1.5" />退回
                </Button>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

const PAGE_SIZE = 20;

export default function AdminAnnouncementsPage() {
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);

  const { data, isLoading, isFetching, refetch } = useQuery<CandidatesResponse>({
    queryKey: ['/api/announcement-candidates', 'pending', page, refreshKey],
    queryFn: async () => {
      const params = new URLSearchParams({
        pendingOnly: 'true',
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      const res = await fetch(`/api/announcement-candidates?${params}`);
      return res.json();
    },
    refetchInterval: 30_000,
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function handleAction() {
    setRefreshKey(k => k + 1);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-[#1a3a5c] text-white">
        <div className="max-w-4xl mx-auto px-5 py-4 flex items-center gap-4">
          <Link href="/admin">
            <button className="flex items-center gap-1.5 text-blue-200 hover:text-white transition-colors text-sm">
              <ArrowLeft className="w-4 h-4" />後台首頁
            </button>
          </Link>
          <span className="text-blue-400">›</span>
          <div className="flex items-center gap-2">
            <Megaphone className="w-5 h-5 text-blue-300" />
            <h1 className="text-base font-bold">公告審核中心</h1>
          </div>
          <div className="ml-auto flex items-center gap-3">
            {total > 0 && (
              <Badge className="bg-amber-500 text-white border-0 text-xs">
                {total} 筆待審
              </Badge>
            )}
            <button
              onClick={() => refetch()}
              className="flex items-center gap-1.5 text-blue-200 hover:text-white transition-colors text-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
              刷新
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-5 py-6 space-y-6">
        {/* Stats bar */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: '待審核', value: total, color: total > 0 ? 'text-amber-600' : 'text-emerald-600' },
            { label: '本頁顯示', value: items.length, color: 'text-gray-700' },
            { label: '總頁數', value: totalPages, color: 'text-blue-600' },
          ].map(item => (
            <div key={item.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-center">
              <p className={`text-2xl font-bold ${item.color}`}>{item.value}</p>
              <p className="text-xs text-gray-400 mt-1">{item.label}</p>
            </div>
          ))}
        </div>

        {/* Notice */}
        <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 flex items-start gap-3">
          <Star className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
          <p className="text-xs text-blue-700 leading-relaxed">
            以下為 AI / 規則引擎偵測出的公告候選，依信心分由高到低排列。
            <strong>核准</strong>後會立即寫入值班首頁（<code className="font-mono text-blue-800">/api/facility-home/:groupId/home</code>），
            <strong>退回</strong>則不會對外發布。可調整優先級與適用範圍後再操作。
          </p>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-white rounded-xl border border-gray-100 h-48 animate-pulse" />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!isLoading && items.length === 0 && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm py-16 text-center">
            <CheckCircle2 className="w-12 h-12 text-emerald-300 mx-auto mb-4" />
            <p className="text-gray-500 font-medium">目前沒有待審核的公告候選</p>
            <p className="text-xs text-gray-300 mt-1">所有候選已完成審核，或尚未有新訊息進入管線</p>
            <Button
              size="sm"
              variant="outline"
              className="mt-6 text-xs"
              onClick={() => refetch()}
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />重新整理
            </Button>
          </div>
        )}

        {/* Candidate list */}
        {!isLoading && items.length > 0 && (
          <div className="space-y-4">
            {items.map(candidate => (
              <CandidateCard
                key={candidate.id}
                candidate={candidate}
                onAction={handleAction}
              />
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-4 pt-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
              className="text-xs h-8"
            >
              上一頁
            </Button>
            <span className="text-xs text-gray-400">
              第 {page} 頁 / 共 {totalPages} 頁（{total} 筆待審）
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= totalPages}
              onClick={() => setPage(p => p + 1)}
              className="text-xs h-8"
            >
              下一頁
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
