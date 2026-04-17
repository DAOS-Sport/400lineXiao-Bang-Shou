import { useState } from "react";
import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertTriangle, Bell, MessageSquare, XCircle,
  ChevronDown, ChevronUp, RefreshCw, Building2,
  Clock, BookOpen, Megaphone, Tag, Users,
} from "lucide-react";

// ── 型別 ────────────────────────────────────────────────────────────────────

interface Facility {
  id: number;
  lineGroupId: string;
  name: string;
  shortName: string;
  tier: string;
  isActive: boolean;
}

interface PublishedAnnouncement {
  id: number;
  title: string;
  summary: string;
  body: string | null;
  candidateType: string;
  scopeType: string;
  priority: string;
  homeVisibility: string;
  needsAck: boolean;
  recommendedReply: string | null;
  badExample: string | null;
  appliesToRolesJson: string[];
  effectiveStartAt: string | null;
  effectiveEndAt: string | null;
  publishedAt: string;
}

interface HomeResponse {
  success: boolean;
  facility: Facility;
  mustRead: PublishedAnnouncement[];
  announcements: PublishedAnnouncement[];
  total: number;
  generatedAt: string;
}

// ── 常數 ────────────────────────────────────────────────────────────────────

const TYPE_LABEL: Record<string, string> = {
  rule: '規則/SOP', notice: '通知公告', campaign: '活動',
  discount: '優惠', script: '標準說詞',
};
const TYPE_COLOR: Record<string, string> = {
  rule: 'bg-blue-100 text-blue-700',
  notice: 'bg-teal-100 text-teal-700',
  campaign: 'bg-purple-100 text-purple-700',
  discount: 'bg-orange-100 text-orange-700',
  script: 'bg-pink-100 text-pink-700',
};
const SCOPE_LABEL: Record<string, string> = {
  group: '本群組', facility: '本館', multi_facility: '多館', global: '全館',
};
const SCOPE_COLOR: Record<string, string> = {
  group: '', facility: '',
  multi_facility: 'bg-violet-100 text-violet-700',
  global: 'bg-rose-100 text-rose-700',
};
const ROLE_LABEL: Record<string, string> = {
  frontdesk: '櫃台', lifeguard: '救生員', admin: '行政',
  supervisor: '主管', new_staff: '新進人員',
};
const TIER_COLOR: Record<string, string> = {
  A: 'bg-emerald-100 text-emerald-700',
  B: 'bg-sky-100 text-sky-700',
  C: 'bg-gray-100 text-gray-600',
};

function formatDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

// ── 公告卡片（可展開）────────────────────────────────────────────────────────

function AnnouncementCard({
  item,
  isMustRead = false,
  defaultExpanded = false,
}: {
  item: PublishedAnnouncement;
  isMustRead?: boolean;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const scopeIsWide = item.scopeType === 'multi_facility' || item.scopeType === 'global';
  const roles = Array.isArray(item.appliesToRolesJson) ? item.appliesToRolesJson : [];
  const hasExtra = !!(item.recommendedReply || item.badExample || item.body);

  return (
    <Card className={`mb-3 border ${
      isMustRead
        ? 'border-red-300 bg-red-50 shadow-md'
        : 'border-gray-200 bg-white shadow-sm'
    }`}>
      <CardContent className="p-4">
        {/* 標題列 */}
        <div className="flex items-start gap-2 mb-2">
          {isMustRead && (
            <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <p className={`font-semibold leading-snug ${
              isMustRead ? 'text-red-800 text-base' : 'text-gray-800 text-sm'
            }`}>
              {item.title || '（未命名公告）'}
            </p>
          </div>
          {hasExtra && (
            <button
              onClick={() => setExpanded(e => !e)}
              className="text-gray-400 hover:text-gray-600 shrink-0 ml-1"
              aria-label={expanded ? '收起' : '展開'}
            >
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          )}
        </div>

        {/* 摘要 */}
        <p className={`text-sm mb-3 leading-relaxed ${
          isMustRead ? 'text-red-700 font-medium' : 'text-gray-600'
        }`}>
          {item.summary}
        </p>

        {/* 標籤列 */}
        <div className="flex flex-wrap gap-1.5 mb-2">
          <Badge variant="outline" className={`text-xs ${TYPE_COLOR[item.candidateType] || 'bg-gray-100 text-gray-600'}`}>
            {TYPE_LABEL[item.candidateType] || item.candidateType}
          </Badge>
          {scopeIsWide && (
            <Badge variant="outline" className={`text-xs ${SCOPE_COLOR[item.scopeType]}`}>
              {SCOPE_LABEL[item.scopeType]}
            </Badge>
          )}
          {item.needsAck && (
            <Badge variant="outline" className="text-xs bg-amber-100 text-amber-700 border-amber-200">
              需簽收
            </Badge>
          )}
          {roles.length > 0 && (
            <div className="flex items-center gap-1">
              <Users className="w-3 h-3 text-gray-400" />
              <span className="text-xs text-gray-500">
                {roles.map(r => ROLE_LABEL[r] || r).join('、')}
              </span>
            </div>
          )}
        </div>

        {/* 有效期 */}
        {item.effectiveEndAt && (
          <div className="flex items-center gap-1 mb-2 text-xs text-amber-600">
            <Clock className="w-3 h-3" />
            <span>有效至 {formatDate(item.effectiveEndAt)}</span>
          </div>
        )}

        {/* 展開內容 */}
        {expanded && (
          <div className="mt-3 space-y-3 border-t pt-3 border-gray-200">
            {item.recommendedReply && (
              <div className="rounded-md bg-emerald-50 border border-emerald-200 p-3">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-xs font-semibold text-emerald-700">遇客人詢問時這樣說</span>
                </div>
                <p className="text-sm text-emerald-800 leading-relaxed">
                  {item.recommendedReply}
                </p>
              </div>
            )}
            {item.badExample && (
              <div className="rounded-md bg-red-50 border border-red-200 p-3">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <XCircle className="w-3.5 h-3.5 text-red-500" />
                  <span className="text-xs font-semibold text-red-600">不要這樣說 / 做</span>
                </div>
                <p className="text-sm text-red-700 leading-relaxed">
                  {item.badExample}
                </p>
              </div>
            )}
            {item.body && !item.recommendedReply && !item.badExample && (
              <div className="rounded-md bg-gray-50 border border-gray-200 p-3">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <BookOpen className="w-3.5 h-3.5 text-gray-500" />
                  <span className="text-xs font-semibold text-gray-600">原始內容</span>
                </div>
                <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                  {item.body}
                </p>
              </div>
            )}
            <div className="text-xs text-gray-400 text-right">
              發布於 {formatDate(item.publishedAt)}
            </div>
          </div>
        )}

        {/* 若無展開按鈕但有發布時間 */}
        {!hasExtra && (
          <div className="text-xs text-gray-400 text-right mt-1">
            {formatDate(item.publishedAt)}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── 值班首頁主體 ─────────────────────────────────────────────────────────────

function DutyBoard({ groupId }: { groupId: string }) {
  const { data, isLoading, isError, refetch, isFetching, dataUpdatedAt } = useQuery<HomeResponse>({
    queryKey: ['/api/facility-home', groupId, 'home'],
    queryFn: () => fetch(`/api/facility-home/${groupId}/home`).then(r => r.json()),
    refetchInterval: 60_000, // 每分鐘自動刷新
    staleTime: 30_000,
  });

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-gray-500">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-400" />
        <p className="text-sm">載入中…</p>
      </div>
    );
  }

  if (isError || !data?.success) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 p-6">
        <AlertTriangle className="w-10 h-10 text-amber-400" />
        <p className="text-gray-600 text-center">無法載入公告，請確認館別 ID 正確或稍後再試</p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>重試</Button>
        <Link href="/duty" className="text-sm text-blue-500 underline">回選擇館別</Link>
      </div>
    );
  }

  const { facility, mustRead, announcements, generatedAt } = data;
  const lastUpdated = dataUpdatedAt ? new Date(dataUpdatedAt) : new Date(generatedAt);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <Link href="/duty">
                <Building2 className="w-5 h-5 text-gray-400 hover:text-gray-600 shrink-0 cursor-pointer" />
              </Link>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="font-bold text-gray-800 text-base truncate">
                    {facility.shortName || facility.name}
                  </h1>
                  <Badge variant="outline" className={`text-xs shrink-0 ${TIER_COLOR[facility.tier] || ''}`}>
                    Tier {facility.tier}
                  </Badge>
                </div>
                <p className="text-xs text-gray-400">
                  更新 {lastUpdated.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              className="shrink-0"
            >
              <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </div>

      {/* 值班首頁標題列 */}
      <div className="max-w-2xl mx-auto px-4 pt-4 pb-2">
        <div className="flex items-center gap-2 text-gray-500 text-sm">
          <Bell className="w-4 h-4" />
          <span>值班公告</span>
          <span className="ml-auto text-gray-400">共 {mustRead.length + announcements.length} 則</span>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pb-20">
        {/* 必讀公告區 */}
        {mustRead.length > 0 ? (
          <div className="mb-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="flex items-center gap-1.5 bg-red-100 text-red-700 px-3 py-1.5 rounded-full">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span className="text-xs font-bold">必讀公告 · {mustRead.length} 則</span>
              </div>
            </div>
            {mustRead.map(item => (
              <AnnouncementCard key={item.id} item={item} isMustRead defaultExpanded />
            ))}
          </div>
        ) : (
          <div className="mb-5 rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-center">
            <p className="text-sm text-emerald-700 font-medium">✅ 目前沒有必讀公告</p>
            <p className="text-xs text-emerald-500 mt-0.5">今日值班一切正常</p>
          </div>
        )}

        {/* 一般公告區 */}
        {announcements.length > 0 ? (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="flex items-center gap-1.5 text-gray-500">
                <Megaphone className="w-3.5 h-3.5" />
                <span className="text-sm font-medium">一般公告 · {announcements.length} 則</span>
              </div>
            </div>
            {announcements.map(item => (
              <AnnouncementCard key={item.id} item={item} />
            ))}
          </div>
        ) : (
          mustRead.length === 0 && (
            <div className="rounded-xl bg-white border border-dashed border-gray-200 p-10 text-center">
              <Bell className="w-8 h-8 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-400">目前沒有公告</p>
            </div>
          )
        )}
      </div>

      {/* 底部導覽 */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 py-2 px-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <Link href="/duty">
            <Button variant="ghost" size="sm" className="text-gray-500 gap-1.5">
              <Building2 className="w-4 h-4" />
              切換館別
            </Button>
          </Link>
          <Link href="/admin/announcements">
            <Button variant="ghost" size="sm" className="text-gray-500 gap-1.5">
              <Tag className="w-4 h-4" />
              審核後台
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

// ── 館別選擇頁 ──────────────────────────────────────────────────────────────

interface FacilitiesResponse {
  success: boolean;
  facilities: Facility[];
}

function FacilitySelector() {
  const { data, isLoading } = useQuery<FacilitiesResponse>({
    queryKey: ['/api/facility-home/list'],
    queryFn: () => fetch('/api/facility-home/list').then(r => r.json()),
  });

  const byTier = (data?.facilities ?? []).reduce<Record<string, Facility[]>>((acc, f) => {
    (acc[f.tier] = acc[f.tier] || []).push(f);
    return acc;
  }, {});

  const tierOrder = ['A', 'B', 'C'];
  const tierLabel: Record<string, string> = {
    A: 'A 級館別（主要運營）',
    B: 'B 級館別',
    C: 'C 級館別（觀察）',
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center">
              <Bell className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-800">值班首頁</h1>
              <p className="text-xs text-gray-500">請選擇今日值班的館別</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6">
        {isLoading ? (
          <div className="flex justify-center items-center py-20">
            <RefreshCw className="w-6 h-6 animate-spin text-blue-400" />
          </div>
        ) : (
          tierOrder.map(tier => {
            const list = byTier[tier];
            if (!list || list.length === 0) return null;
            return (
              <div key={tier} className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <Badge variant="outline" className={`text-xs ${TIER_COLOR[tier] || ''}`}>
                    Tier {tier}
                  </Badge>
                  <span className="text-xs text-gray-400">{tierLabel[tier]}</span>
                </div>
                <div className="space-y-2">
                  {list.map(f => (
                    <Link key={f.id} href={`/duty/${f.lineGroupId}`}>
                      <div className="flex items-center gap-3 bg-white rounded-xl border border-gray-200 px-4 py-3.5 hover:border-blue-300 hover:bg-blue-50 active:bg-blue-100 cursor-pointer transition-colors shadow-sm">
                        <Building2 className="w-5 h-5 text-gray-400 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-800 text-sm">{f.name}</p>
                          {f.shortName && f.shortName !== f.name && (
                            <p className="text-xs text-gray-400">{f.shortName}</p>
                          )}
                        </div>
                        <ChevronDown className="w-4 h-4 text-gray-400 -rotate-90 shrink-0" />
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })
        )}

        {/* 底部連結 */}
        <div className="mt-8 text-center">
          <Link href="/dashboard">
            <Button variant="ghost" size="sm" className="text-gray-400 text-xs">
              前往管理儀表板
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

// ── 路由判斷：有 groupId → DutyBoard，無 → FacilitySelector ─────────────────

export default function DutyPage() {
  const params = useParams<{ groupId?: string }>();
  const groupId = params.groupId;

  if (!groupId) {
    return <FacilitySelector />;
  }

  return <DutyBoard groupId={groupId} />;
}
